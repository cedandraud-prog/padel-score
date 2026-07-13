import { ScoreEngine } from '../core/ScoreEngine'
import type { DisplayState, MatchState, TeamId } from '../core/matchTypes'
import { resolveVoiceCommand } from '../voice/commandAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import type {
  CommandFeedbackAdapter,
  FeedbackMode,
  RecognitionAdapter,
  RecognitionHandlers,
  RecognitionResultDiagnostics,
  ReadinessCueAdapter,
  SpeechTranscript,
  SynthesisAdapter,
} from '../voice/speechTypes'
import {
  MINIMUM_RECOGNITION_CONFIDENCE,
  usableRecognitionConfidence,
} from '../voice/speechTypes'
import {
  buildFullScoreAnnouncement,
  buildPointScoreAnnouncement,
  buildTransitionAnnouncement,
  type AnnounceableMatchState,
} from './matchAnnouncements'
import { parseSpokenPointScore } from './parseSpokenPointScore'
import { GameSession, type GameSessionSnapshot } from './GameSession'
import {
  ConnectionQualityMonitor,
  type ConnectionQualitySnapshot,
} from './ConnectionQualityMonitor'
import {
  ConversationEngine,
  type ConversationSnapshot,
} from './ConversationEngine'
import {
  copyMatchConfiguration,
  createDefaultMatchConfiguration,
  type MatchConfiguration,
  validateMatchConfiguration,
} from './matchConfiguration'
import {
  areVoiceNamesValidated,
  VoiceMatchSetup,
  type VoiceMatchSetupSnapshot,
} from './VoiceMatchSetup'
import { WaitingVoiceEntry } from './WaitingVoiceEntry'
import {
  ContinuousListeningManager,
  type ContinuousListeningSnapshot,
} from './ContinuousListeningManager'
import {
  ExperienceSession,
  type ExperienceSessionSnapshot,
} from './ExperienceSession'
import type { ListeningStrategy } from '../voice/ListeningStrategy'

export interface VoiceRuntimeMetrics {
  sessionsCreated: number
  sessionsEnded: number
  restarts: number
  errors: number
  commandsRecognized: number
  commandsLost: number
  lastError: string
}

export type MatchPhase =
  | 'setup'
  | 'voice-setup'
  | 'match'
  | 'correction'
  | 'session-end-confirmation'
  | 'session-finished'
  | 'finished'
export type MicrophoneStatus =
  | 'inactive'
  | 'starting'
  | 'listening'
  | 'speaking'
  | 'disabled'
  | 'unavailable'
  | 'error'
export type ConversationStatus =
  | 'Mode normal'
  | 'En attente du nouveau score'
  | 'Correction appliquée'
  | 'Score non compris'
  | 'Correction annulée'

export interface MatchControllerSnapshot {
  phase: MatchPhase
  display: DisplayState
  microphoneStatus: MicrophoneStatus
  recognitionAvailable: boolean
  lastTranscript: string
  lastCommand: string
  message: string
  recognitionDiagnostics: RecognitionResultDiagnostics | null
  conversationStatus: ConversationStatus
  normalizedTranscript: string
  interpretation: string
  rejectionReason: string
  extractedContent: string
  correctionResult: string
  feedbackMode: FeedbackMode
  configuration: MatchConfiguration | null
  editingConfiguration: MatchConfiguration
  voiceSetup: VoiceMatchSetupSnapshot | null
  conversation: ConversationSnapshot
  recognitionAttemptId: number | null
  recognitionLifecycle: string
  session: GameSessionSnapshot
  connectionQuality: ConnectionQualitySnapshot
  continuousListening: ContinuousListeningSnapshot
  experience: ExperienceSessionSnapshot
  listeningStrategy: ListeningStrategy
  voiceMetrics: VoiceRuntimeMetrics
}

export interface StartMatchOptions {
  configuration: MatchConfiguration
  feedbackMode?: FeedbackMode
}

type Listener = (snapshot: MatchControllerSnapshot) => void

const DUPLICATE_WINDOW_MS = 1_500

const NOOP_FEEDBACK: CommandFeedbackAdapter = {
  prepare() {},
  async play() {},
  dispose() {},
}

const NOOP_READINESS_CUE: ReadinessCueAdapter = {
  prepare() {},
  async play() {},
  dispose() {},
}

function snapshotOf(engine: ScoreEngine): AnnounceableMatchState {
  return { match: engine.getState(), display: engine.getDisplayState() }
}

export class MatchController {
  private engine = new ScoreEngine()
  private readonly session = new GameSession()
  private readonly experience = new ExperienceSession()
  private phase: MatchPhase = 'setup'
  private microphoneStatus: MicrophoneStatus = 'inactive'
  private lastTranscript = ''
  private lastCommand = ''
  private message = ''
  private recognitionDiagnostics: RecognitionResultDiagnostics | null = null
  private conversationStatus: ConversationStatus = 'Mode normal'
  private normalizedTranscript = ''
  private interpretation = ''
  private rejectionReason = ''
  private extractedContent = ''
  private correctionResult = ''
  private feedbackMode: FeedbackMode = 'NONE'
  private configuration: MatchConfiguration | null = null
  private editingConfiguration = createDefaultMatchConfiguration()
  private editingRevision = 0
  private readonly voiceSetup = new VoiceMatchSetup()
  private readonly waitingVoiceEntry = new WaitingVoiceEntry()
  private readonly connectionQuality = new ConnectionQualityMonitor()
  private recognitionListeningStartedAt: number | null = null
  private voiceSetupSnapshot: VoiceMatchSetupSnapshot | null = null
  private lastExecutedVoiceCommand: { transcript: string; at: number } | null =
    null
  private actionCount = 0
  private feedbackPlaying = false
  private readinessPlaying = false
  private recognitionAttemptSequence = 0
  private pendingRecognitionAttempt: number | null = null
  private pendingRecognitionIsTechnicalRestart = false
  private activeRecognitionAttempt: number | null = null
  private recognitionStartTimeout: ReturnType<typeof setTimeout> | null = null
  private consecutiveStartFailures = 0
  private consecutiveNetworkErrors = 0
  private recognitionLifecycle = 'Aucune tentative'
  private voiceMetrics: VoiceRuntimeMetrics = {
    sessionsCreated: 0,
    sessionsEnded: 0,
    restarts: 0,
    errors: 0,
    commandsRecognized: 0,
    commandsLost: 0,
    lastError: '',
  }
  private readonly conversation = new ConversationEngine((intent) => {
    if (intent.type === 'Timeout') void this.expireCorrection()
  })
  private readonly continuousListening = new ContinuousListeningManager(() =>
    this.startRecognition(true),
  )
  private disposed = false
  private readonly listeners = new Set<Listener>()

  constructor(
    private readonly recognition: RecognitionAdapter,
    private readonly synthesis: SynthesisAdapter,
    private readonly feedback: CommandFeedbackAdapter = NOOP_FEEDBACK,
    private readonly now: () => number = () => Date.now(),
    private readonly readinessCue: ReadinessCueAdapter = NOOP_READINESS_CUE,
    private listeningStrategy: ListeningStrategy = 'CONTINUOUS',
  ) {}

  getSnapshot(): MatchControllerSnapshot {
    return {
      phase: this.phase,
      display: this.engine.getDisplayState(),
      microphoneStatus: this.microphoneStatus,
      recognitionAvailable: this.recognition.isSupported,
      lastTranscript: this.lastTranscript,
      lastCommand: this.lastCommand,
      message: this.message,
      recognitionDiagnostics: this.recognitionDiagnostics
        ? { ...this.recognitionDiagnostics }
        : null,
      conversationStatus: this.conversationStatus,
      normalizedTranscript: this.normalizedTranscript,
      interpretation: this.interpretation,
      rejectionReason: this.rejectionReason,
      extractedContent: this.extractedContent,
      correctionResult: this.correctionResult,
      feedbackMode: this.feedbackMode,
      configuration: this.configuration
        ? copyMatchConfiguration(this.configuration)
        : null,
      editingConfiguration: copyMatchConfiguration(this.editingConfiguration),
      voiceSetup: this.voiceSetupSnapshot
        ? {
            ...this.voiceSetupSnapshot,
            configuration: copyMatchConfiguration(
              this.voiceSetupSnapshot.configuration,
            ),
          }
        : null,
      conversation: this.conversation.getSnapshot(),
      recognitionAttemptId: this.pendingRecognitionAttempt,
      recognitionLifecycle: this.recognitionLifecycle,
      session: this.session.getSnapshot(),
      connectionQuality: this.connectionQuality.getSnapshot(),
      continuousListening: this.continuousListening.getSnapshot(),
      experience: this.experience.getSnapshot(),
      listeningStrategy: this.listeningStrategy,
      voiceMetrics: { ...this.voiceMetrics },
    }
  }

  subscribe(listener: Listener): () => void {
    this.disposed = false
    this.listeners.add(listener)
    const unsubscribeConnection = this.connectionQuality.subscribe(() =>
      this.emit(),
    )
    listener(this.getSnapshot())
    return () => {
      unsubscribeConnection()
      this.listeners.delete(listener)
    }
  }

  beginConfigurationExperience(): void {
    this.experience.beginConfiguration()
    this.emit()
  }

  setListeningStrategy(strategy: ListeningStrategy): void {
    if (strategy === this.listeningStrategy) return
    this.listeningStrategy = strategy
    this.continuousListening.suspendTechnicalListening()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.activeRecognitionAttempt = null
    this.recognition.stop()
    if (this.conversation.getSnapshot().isRunning && this.isListeningPhase()) {
      this.continuousListening.resumeTechnicalListening()
      this.startRecognition()
    }
    this.emit()
  }

  resetVoiceMetrics(): void {
    this.voiceMetrics = {
      sessionsCreated: 0,
      sessionsEnded: 0,
      restarts: 0,
      errors: 0,
      commandsRecognized: 0,
      commandsLost: 0,
      lastError: '',
    }
    this.emit()
  }

  startMatch(options: StartMatchOptions): boolean {
    const validationError = validateMatchConfiguration(options.configuration)
    if (validationError) {
      this.message = validationError
      this.emit()
      return false
    }

    this.engine = new ScoreEngine({
      teamNames: {
        A: options.configuration.teamA.displayName.trim(),
        B: options.configuration.teamB.displayName.trim(),
      },
      servingTeam: options.configuration.servingTeam,
      format: 'FREE_PLAY',
    })
    this.session.reset()
    this.session.start()
    this.experience.startMatch()
    this.configuration = copyMatchConfiguration(options.configuration)
    this.editingConfiguration = copyMatchConfiguration(options.configuration)
    this.voiceSetupSnapshot = null
    this.phase = 'match'
    this.lastTranscript = ''
    this.lastCommand = 'Match démarré'
    this.message = ''
    this.recognitionDiagnostics = null
    this.conversationStatus = 'Mode normal'
    this.normalizedTranscript = ''
    this.interpretation = ''
    this.rejectionReason = ''
    this.extractedContent = ''
    this.correctionResult = ''
    this.feedbackMode = options.feedbackMode ?? 'NONE'
    this.feedback.prepare(this.feedbackMode)
    this.readinessCue.prepare()
    this.lastExecutedVoiceCommand = null
    this.actionCount = 0
    if (this.recognition.isSupported) {
      this.conversation.start()
      this.continuousListening.startFunctionalListening()
    }

    if (this.recognition.isSupported) {
      this.startRecognition()
    } else {
      this.microphoneStatus = 'unavailable'
      this.message =
        'Reconnaissance vocale indisponible. Utilisez Google Chrome ou les boutons de secours.'
    }
    this.emit()
    return true
  }

  startConfiguredMatch(options: StartMatchOptions): boolean {
    const validatedNames = this.voiceSetupSnapshot?.validatedVoiceNames ?? {
      A: null,
      B: null,
    }
    if (!areVoiceNamesValidated(options.configuration, validatedNames)) {
      this.message = 'Les deux noms vocaux doivent être validés.'
      this.emit()
      return false
    }
    return this.startMatch(options)
  }

  async startVoiceSetup(feedbackMode: FeedbackMode = 'NONE'): Promise<void> {
    if (this.phase === 'voice-setup') return
    if (!this.recognition.isSupported) {
      this.message = 'Reconnaissance vocale indisponible dans ce navigateur.'
      this.microphoneStatus = 'unavailable'
      this.emit()
      return
    }
    const result = this.voiceSetup.start(this.editingConfiguration)
    this.experience.beginConfiguration()
    this.editingRevision += 1
    this.voiceSetupSnapshot = result.snapshot
    this.phase = 'voice-setup'
    this.feedbackMode = feedbackMode
    this.conversation.start()
    this.continuousListening.startFunctionalListening()
    this.conversation.enterGuidedMode()
    this.lastCommand = 'Configuration vocale démarrée'
    this.message = ''
    this.readinessCue.prepare()
    this.emit()
    await this.announce(result.announcement, true)
  }

  listenForNewMatch(): void {
    if (this.phase !== 'setup' || !this.recognition.isSupported) return
    this.conversation.start()
    this.continuousListening.startFunctionalListening()
    this.startRecognition()
  }

  async startNewMatchVoiceSetup(
    feedbackMode: FeedbackMode = this.feedbackMode,
  ): Promise<void> {
    if (this.session.getSnapshot().state === 'IN_PROGRESS') {
      this.message = "Le match n'est pas terminé."
      this.emit()
      await this.announce("Le match n'est pas terminé.")
      return
    }
    if (this.phase !== 'setup') this.prepareNewMatch()
    await this.startVoiceSetup(feedbackMode)
  }

  updateEditingConfiguration(configuration: MatchConfiguration): void {
    if (this.phase !== 'setup' && this.phase !== 'voice-setup') return
    this.editingConfiguration = copyMatchConfiguration(configuration)
    this.experience.beginConfiguration()
    this.editingRevision += 1
    if (this.phase === 'voice-setup') {
      this.voiceSetup.synchronizeConfiguration(this.editingConfiguration)
      this.voiceSetupSnapshot = this.voiceSetup.getSnapshot()
      this.cancelPendingRecognitionAttempt('Modification manuelle')
      this.continuousListening.suspendTechnicalListening()
      this.activeRecognitionAttempt = null
      this.recognition.stop()
      this.continuousListening.resumeTechnicalListening()
      this.startRecognition()
    }
    this.emit()
  }

  async handleTranscript(
    result: SpeechTranscript,
    sourceRevision = this.editingRevision,
  ): Promise<void> {
    if (this.recognitionListeningStartedAt !== null) {
      this.connectionQuality.recordRecognitionDelay(
        this.now() - this.recognitionListeningStartedAt,
      )
      this.recognitionListeningStartedAt = null
    }
    if (this.phase === 'setup') {
      this.lastTranscript = result.transcript
      const waitingResult = this.waitingVoiceEntry.interpret(result.transcript)
      this.normalizedTranscript = waitingResult.normalizedTranscript
      const confidence = usableRecognitionConfidence(result.confidence)
      if (
        (confidence === undefined ||
          confidence >= MINIMUM_RECOGNITION_CONFIDENCE) &&
        waitingResult.type === 'START_NEW_MATCH'
      ) {
        this.lastCommand = 'NEW_MATCH'
        this.rejectionReason = ''
        this.emit()
        await this.startNewMatchVoiceSetup()
      } else {
        this.lastCommand = 'Commande ignorée sur l’écran d’attente'
        this.rejectionReason =
          confidence !== undefined &&
          confidence < MINIMUM_RECOGNITION_CONFIDENCE
            ? 'Confiance insuffisante.'
            : waitingResult.type === 'IGNORED'
              ? waitingResult.reason
              : ''
        this.emit()
      }
      return
    }
    if (this.phase === 'finished') return
    this.lastTranscript = result.transcript
    const normalized = normalizeSpeech(result.transcript)
    this.normalizedTranscript = normalized
    if (
      this.phase === 'voice-setup' &&
      sourceRevision !== this.editingRevision
    ) {
      this.lastCommand = 'Transcription vocale obsolète ignorée'
      this.message =
        'Une modification plus récente du formulaire est prioritaire.'
      this.emit()
      return
    }
    if (
      this.conversation.getSnapshot().state === 'STARTING_LISTENING' ||
      this.readinessPlaying
    ) {
      this.lastCommand = 'Parole ignorée avant le bip de disponibilité'
      this.message = 'Réponse ignorée : attendez le bip de disponibilité.'
      this.emit()
      return
    }
    if (
      this.conversation.getSnapshot().state === 'SYSTEM_TURN' ||
      this.feedbackPlaying
    ) {
      this.lastCommand = 'Parole ignorée pendant une annonce'
      this.rejectionReason = 'Synthèse vocale en cours.'
      this.message = 'Parole ignorée pendant une annonce.'
      this.emit()
      return
    }
    this.conversation.handleSpeech(result.transcript)
    this.conversation.resumeListening()
    this.interpretation = ''
    this.rejectionReason = ''
    this.extractedContent = ''
    this.correctionResult = ''

    const usableConfidence = usableRecognitionConfidence(result.confidence)
    if (
      usableConfidence !== undefined &&
      usableConfidence < MINIMUM_RECOGNITION_CONFIDENCE
    ) {
      if (this.phase === 'voice-setup') {
        this.conversation.handleSpeechRejected()
        this.conversation.resumeListening()
        this.lastCommand = 'Configuration ignorée'
        this.message = 'Confiance insuffisante.'
        this.emit()
        return
      }
      if (this.phase === 'correction') {
        this.conversation.handleSpeechRejected()
        this.conversation.resumeListening()
        await this.rejectPointCorrection('Confiance insuffisante.')
        return
      }
      this.lastCommand = 'Transcription ignorée'
      this.conversation.handleSpeechRejected()
      this.conversation.resumeListening()
      this.message = `Confiance insuffisante (${Math.round(usableConfidence * 100)} %).`
      this.emit()
      return
    }

    if (this.phase === 'voice-setup') {
      if (resolveVoiceCommand(normalized)?.type === 'NEW_MATCH') return
      await this.handleVoiceSetupTranscript(result.transcript)
      return
    }

    if (this.phase === 'correction') {
      await this.handlePointCorrection(result.transcript, normalized)
      return
    }

    if (this.phase === 'session-end-confirmation') {
      await this.handleSessionEndConfirmation(normalized)
      return
    }

    if (this.phase === 'session-finished') {
      if (resolveVoiceCommand(normalized)?.type === 'NEW_MATCH') {
        await this.startNewMatchVoiceSetup()
      } else {
        this.lastCommand = 'Session terminée'
        this.message = 'Seule la commande « Nouveau match » est disponible.'
        this.emit()
      }
      return
    }

    const state = this.engine.getState()
    const normalizedA = normalizeSpeech(
      this.configuration?.teamA.voiceName ?? state.teams.A,
    )
    const normalizedB = normalizeSpeech(
      this.configuration?.teamB.voiceName ?? state.teams.B,
    )

    if (normalized === normalizedA) {
      this.lastCommand = `Point ${state.teams.A}`
      await this.executeAcceptedVoiceCommand(normalized, () =>
        this.awardPoint('A'),
      )
      return
    }
    if (normalized === normalizedB) {
      this.lastCommand = `Point ${state.teams.B}`
      await this.executeAcceptedVoiceCommand(normalized, () =>
        this.awardPoint('B'),
      )
      return
    }

    const command = resolveVoiceCommand(normalized)
    switch (command?.type) {
      case 'SCORE':
        this.lastCommand = 'Score'
        this.interpretation = 'score court'
        await this.executeAcceptedVoiceCommand(normalized, () =>
          this.announcePointScore(),
        )
        return
      case 'FULL_SCORE':
        this.lastCommand = 'Score complet'
        this.interpretation = 'score complet'
        await this.executeAcceptedVoiceCommand(normalized, () =>
          this.announceFullScore(),
        )
        return
      case 'UNDO':
        this.lastCommand = 'Annule'
        if (this.actionCount === 0) {
          await this.undo()
          return
        }
        await this.executeAcceptedVoiceCommand(normalized, () => this.undo())
        return
      case 'START_CORRECTION':
        this.lastCommand = 'START_CORRECTION'
        this.interpretation = 'mode guidé'
        await this.executeAcceptedVoiceCommand(normalized, () =>
          this.enterCorrection(),
        )
        return
      case 'CORRECT_POINTS_INLINE':
        this.lastCommand = 'CORRECT_POINTS_INLINE'
        this.extractedContent = command.spokenScore
        await this.handleInlinePointCorrection(normalized, command.spokenScore)
        return
      case 'STOP_LISTENING':
        this.lastCommand = 'Termine écoute'
        await this.executeAcceptedVoiceCommand(normalized, async () => {
          this.disableListening()
        })
        return
      case 'RESUME_LISTENING':
        this.lastCommand = 'Reprends écoute'
        this.message = 'L’écoute est déjà active.'
        this.emit()
        return
      case 'FINISH_MATCH':
        await this.requestSessionFinish()
        return
      case 'NEW_MATCH':
        this.lastCommand = 'Nouveau match refusé'
        this.message = "Le match n'est pas terminé."
        this.emit()
        await this.announce("Le match n'est pas terminé.")
        return
      case 'CONFIRM':
        this.lastCommand = 'Commande inconnue'
        this.message = 'Aucune confirmation n’est attendue.'
        this.emit()
        return
      default:
        this.lastCommand = 'Commande inconnue'
        this.message = normalized
          ? `Commande ignorée : « ${result.transcript.trim()} ».`
          : 'Transcription vide ignorée.'
        this.emit()
    }
  }

  async awardPoint(team: TeamId): Promise<void> {
    if (this.phase !== 'match') return
    const previous = snapshotOf(this.engine)
    this.engine.awardPoint(team)
    this.actionCount += 1
    const next = snapshotOf(this.engine)
    this.message = ''

    this.emit()
    await this.announce(
      buildTransitionAnnouncement(previous, next, team, {
        suppressMatchWinner: true,
      }),
    )
  }

  async undo(): Promise<boolean> {
    const restored = this.engine.undo()
    if (!restored) {
      this.message = 'Rien à annuler.'
      this.emit()
      await this.announce('Rien à annuler')
      return false
    }
    this.actionCount = Math.max(0, this.actionCount - 1)

    if (this.phase === 'finished') {
      this.phase = 'match'
      if (this.recognition.isSupported) this.conversation.start()
    }
    this.message = 'Dernière action annulée.'
    this.emit()
    await this.announcePointScore()
    return true
  }

  async announcePointScore(): Promise<void> {
    await this.announce(buildPointScoreAnnouncement(snapshotOf(this.engine)))
  }

  async announceFullScore(): Promise<void> {
    await this.announce(buildFullScoreAnnouncement(snapshotOf(this.engine)))
  }

  async enterCorrection(): Promise<void> {
    if (this.phase !== 'match') return
    this.conversation.exitGuidedMode()
    this.conversation.enterGuidedMode()
    this.phase = 'correction'
    this.conversationStatus = 'En attente du nouveau score'
    this.interpretation = 'attente de correction des points'
    this.rejectionReason = ''
    this.message = 'Nouveau score ?'
    this.emit()
    await this.announce('Nouveau score ?', true)
    if (this.phase === 'correction') this.conversation.enterGuidedMode(10_000)
  }

  cancelCorrection(): void {
    if (this.phase !== 'correction') return
    this.conversation.manualCancel()
    this.phase = 'match'
    this.conversationStatus = 'Correction annulée'
    this.interpretation = 'annulation de la correction'
    this.rejectionReason = ''
    this.message = 'Correction annulée.'
    this.emit()
  }

  async confirmCorrection(pointsA: number, pointsB: number): Promise<boolean> {
    if (this.phase !== 'correction') return false
    try {
      this.engine.correctPoints(pointsA, pointsB)
      this.actionCount += 1
      this.conversation.exitGuidedMode()
      this.phase = 'match'
      this.conversationStatus = 'Correction appliquée'
      this.interpretation = `points ${pointsA}-${pointsB}`
      this.rejectionReason = ''
      this.lastCommand = 'Correction confirmée'
      this.message = 'Points corrigés.'
      this.emit()
      await this.announcePointScore()
      return true
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Correction impossible.'
      this.emit()
      return false
    }
  }

  toggleListening(): void {
    if (this.conversation.getSnapshot().isRunning) this.disableListening()
    else this.enableListening()
  }

  enableListening(): void {
    if (!this.isListeningPhase()) return
    if (!this.recognition.isSupported) {
      this.microphoneStatus = 'unavailable'
      this.message =
        'Reconnaissance vocale indisponible. Utilisez Google Chrome ou les boutons de secours.'
      this.emit()
      return
    }
    this.conversation.start()
    this.continuousListening.startFunctionalListening()
    this.message = ''
    this.startRecognition()
  }

  disableListening(): void {
    this.conversation.stop()
    this.continuousListening.stopFunctionalListening()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.activeRecognitionAttempt = null
    this.recognition.stop()
    this.microphoneStatus = 'disabled'
    this.message = 'Écoute désactivée volontairement.'
    this.emit()
  }

  prepareNewMatch(): void {
    this.conversation.stop()
    this.continuousListening.stopFunctionalListening()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.activeRecognitionAttempt = null
    this.recognition.stop()
    this.synthesis.cancel()
    this.engine = new ScoreEngine()
    this.session.reset()
    this.experience.returnHome()
    this.phase = 'setup'
    this.microphoneStatus = 'inactive'
    this.lastTranscript = ''
    this.lastCommand = ''
    this.message = ''
    this.recognitionDiagnostics = null
    this.conversationStatus = 'Mode normal'
    this.normalizedTranscript = ''
    this.interpretation = ''
    this.rejectionReason = ''
    this.extractedContent = ''
    this.correctionResult = ''
    this.feedbackMode = 'NONE'
    this.configuration = null
    this.editingConfiguration = createDefaultMatchConfiguration()
    this.editingRevision += 1
    this.voiceSetupSnapshot = null
    this.lastExecutedVoiceCommand = null
    this.actionCount = 0
    this.emit()
  }

  destroy(): void {
    this.disposed = true
    this.conversation.stop()
    this.continuousListening.dispose()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.activeRecognitionAttempt = null
    this.recognition.dispose()
    this.synthesis.cancel()
    this.feedback.dispose()
    this.readinessCue.dispose()
    this.connectionQuality.dispose()
    this.listeners.clear()
  }

  private async requestSessionFinish(): Promise<void> {
    if (!this.session.requestFinish()) return
    this.phase = 'session-end-confirmation'
    this.conversation.enterGuidedMode()
    this.lastCommand = 'Fin de match'
    this.message = 'Confirmer ?'
    this.emit()
    await this.announce('Confirmer ?', true)
  }

  private async handleSessionEndConfirmation(
    normalizedTranscript: string,
  ): Promise<void> {
    const command = resolveVoiceCommand(normalizedTranscript)
    if (command?.type === 'UNDO') {
      this.session.cancelFinish()
      this.conversation.manualCancel()
      this.phase = 'match'
      this.lastCommand = 'Fin de match annulée'
      this.message = 'Session reprise.'
      this.emit()
      return
    }
    if (command?.type !== 'CONFIRM') {
      this.lastCommand = 'Confirmation attendue'
      this.message = 'Dites Confirmer ou Annuler.'
      this.emit()
      return
    }

    this.session.confirmFinish()
    this.experience.finishMatch()
    this.conversation.exitGuidedMode()
    this.phase = 'session-finished'
    this.lastCommand = 'Session terminée'
    this.message = 'Session terminée'
    this.emit()
    await this.announce(
      `Fin du match. ${buildFullScoreAnnouncement(snapshotOf(this.engine))}`,
    )
  }

  private async handlePointCorrection(
    transcript: string,
    normalized: string,
  ): Promise<void> {
    const command = resolveVoiceCommand(normalized)
    if (command?.type === 'UNDO') {
      this.lastCommand = 'Annulation de la correction'
      await this.executeAcceptedVoiceCommand(normalized, async () => {
        this.cancelCorrection()
        await this.announce('Correction annulée')
      })
      return
    }
    if (command) {
      await this.rejectPointCorrection(
        'Une commande réservée ne peut pas servir de nouveau score.',
      )
      return
    }

    const parsed = this.preparePointCorrection(transcript)
    if (!parsed.ok) {
      await this.rejectPointCorrection(parsed.reason)
      return
    }
    await this.executeAcceptedVoiceCommand(normalized, () =>
      this.applyPointCorrection(parsed),
    )
  }

  private async handleInlinePointCorrection(
    normalized: string,
    spokenScore: string,
  ): Promise<void> {
    const parsed = this.preparePointCorrection(spokenScore)
    if (!parsed.ok) {
      await this.rejectPointCorrection(parsed.reason, 'CORRECT_POINTS_INLINE')
      return
    }
    await this.executeAcceptedVoiceCommand(normalized, () =>
      this.applyPointCorrection(parsed, 'CORRECT_POINTS_INLINE'),
    )
  }

  private preparePointCorrection(transcript: string) {
    const state = this.engine.getState()
    const parsed = parseSpokenPointScore(
      transcript,
      state.teams,
      state.isTieBreak,
    )
    if (!parsed.ok) return parsed

    const leadingPoints = Math.max(parsed.pointsA, parsed.pointsB)
    const pointDifference = Math.abs(parsed.pointsA - parsed.pointsB)
    const alreadyFinished = state.isTieBreak
      ? leadingPoints >= 7 && pointDifference >= 2
      : leadingPoints >= 4 && pointDifference >= 2
    return alreadyFinished
      ? {
          ok: false as const,
          reason: 'Le score correspond déjà à un jeu terminé.',
        }
      : parsed
  }

  private async applyPointCorrection(
    parsed: Extract<ReturnType<typeof parseSpokenPointScore>, { ok: true }>,
    commandLabel?: string,
  ): Promise<void> {
    try {
      this.engine.correctPoints(parsed.pointsA, parsed.pointsB)
      this.actionCount += 1
      this.conversation.exitGuidedMode()
      this.phase = 'match'
      this.conversationStatus = 'Correction appliquée'
      this.lastCommand = commandLabel ?? 'Correction vocale appliquée'
      this.interpretation = parsed.interpretation
      this.rejectionReason = ''
      this.correctionResult = 'correction appliquée'
      this.message = 'Correction appliquée.'
      this.emit()
      await this.announcePointScore()
    } catch (error) {
      await this.rejectPointCorrection(
        error instanceof Error ? error.message : 'Correction impossible.',
        commandLabel,
      )
    }
  }

  private async rejectPointCorrection(
    reason: string,
    commandLabel?: string,
  ): Promise<void> {
    this.conversation.exitGuidedMode()
    this.conversationStatus = 'Score non compris'
    this.lastCommand = commandLabel ?? 'Score non compris'
    this.interpretation = ''
    this.rejectionReason = reason
    this.correctionResult = `rejet : ${reason}`
    this.message = 'Score non compris. Répétez ou annulez.'
    this.emit()
    await this.announce('Score non compris. Répétez ou annulez.', true)
    if (this.phase === 'correction') this.conversation.enterGuidedMode(10_000)
  }

  private async expireCorrection(): Promise<void> {
    if (this.phase !== 'correction') return
    this.conversation.exitGuidedMode()
    this.phase = 'match'
    this.conversationStatus = 'Correction annulée'
    this.lastCommand = 'Expiration de la correction'
    this.interpretation = 'expiration après 10 secondes'
    this.rejectionReason = ''
    this.message = 'Correction annulée.'
    this.emit()
    await this.announce('Correction annulée')
  }

  private isListeningPhase(): boolean {
    return (
      this.phase === 'setup' ||
      this.phase === 'voice-setup' ||
      this.phase === 'match' ||
      this.phase === 'correction' ||
      this.phase === 'session-end-confirmation' ||
      this.phase === 'session-finished'
    )
  }

  private async handleVoiceSetupTranscript(transcript: string): Promise<void> {
    this.voiceSetup.synchronizeConfiguration(this.editingConfiguration)
    const result = this.voiceSetup.handle(transcript)
    this.voiceSetupSnapshot = result.snapshot
    this.editingConfiguration = copyMatchConfiguration(
      result.snapshot.configuration,
    )
    this.editingRevision += 1
    this.lastCommand = `Configuration : ${result.snapshot.step}`
    this.message = result.snapshot.message
    this.emit()

    if (result.cancelled) {
      this.experience.returnHome()
      this.conversation.stop()
      this.continuousListening.stopFunctionalListening()
      this.conversation.exitGuidedMode()
      this.phase = 'setup'
      this.voiceSetupSnapshot = null
      this.activeRecognitionAttempt = null
      this.recognition.stop()
      await this.announce(result.announcement)
      this.listenForNewMatch()
      return
    }
    if (result.completedConfiguration) {
      const feedbackMode = this.feedbackMode
      this.conversation.exitGuidedMode()
      this.conversation.stop()
      this.continuousListening.stopFunctionalListening()
      this.activeRecognitionAttempt = null
      this.recognition.stop()
      this.startMatch({
        configuration: copyMatchConfiguration(this.editingConfiguration),
        feedbackMode,
      })
      await this.announce(result.announcement)
      return
    }
    await this.announce(result.announcement, true)
  }

  private async executeAcceptedVoiceCommand(
    normalizedTranscript: string,
    execute: () => Promise<unknown>,
  ): Promise<boolean> {
    const previous = this.lastExecutedVoiceCommand
    const now = this.now()
    if (
      previous?.transcript === normalizedTranscript &&
      now - previous.at < DUPLICATE_WINDOW_MS
    ) {
      this.lastCommand = 'Doublon ignoré'
      this.rejectionReason = 'Commande déjà exécutée dans les 1 500 ms.'
      this.message = 'Doublon ignoré.'
      this.emit()
      return false
    }

    await this.playCommandFeedback()
    await execute()
    this.voiceMetrics.commandsRecognized += 1
    this.lastExecutedVoiceCommand = {
      transcript: normalizedTranscript,
      at: this.now(),
    }
    return true
  }

  private async playCommandFeedback(): Promise<void> {
    if (this.feedbackMode === 'NONE') return
    this.feedbackPlaying = true
    this.microphoneStatus = 'speaking'
    this.continuousListening.suspendTechnicalListening()
    this.activeRecognitionAttempt = null
    this.recognition.stop()
    this.emit()
    try {
      await this.feedback.play(this.feedbackMode)
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Feedback sonore indisponible.'
    } finally {
      this.feedbackPlaying = false
    }
  }

  private recognitionHandlers(
    sourceRevision = this.editingRevision,
    attemptId = this.pendingRecognitionAttempt,
  ): RecognitionHandlers {
    return {
      onStart: () => void this.handleRecognitionStarted(attemptId),
      onDiagnostic: (diagnostics) => {
        this.recognitionDiagnostics = { ...diagnostics }
        this.emit()
      },
      onResult: (result) => {
        this.continuousListening.recordSuccessfulRecognition()
        this.consecutiveNetworkErrors = 0
        void this.handleTranscript(result, sourceRevision)
      },
      onError: (code, message) => {
        if (
          attemptId !== this.pendingRecognitionAttempt &&
          attemptId !== this.activeRecognitionAttempt
        ) {
          return
        }
        this.clearRecognitionStartTimeout()
        this.voiceMetrics.errors += 1
        this.voiceMetrics.commandsLost += 1
        this.voiceMetrics.lastError = message
        this.recognitionLifecycle = `Erreur réelle : ${code}`
        if (code === 'network') {
          this.connectionQuality.recordNetworkError()
          this.consecutiveNetworkErrors += 1
        }

        const isFatal =
          code === 'not-allowed' ||
          code === 'audio-capture' ||
          code === 'unknown' ||
          (code === 'network' && this.consecutiveNetworkErrors >= 3)

        if (isFatal) {
          this.pendingRecognitionAttempt = null
          this.activeRecognitionAttempt = null
          this.continuousListening.stopFunctionalListening()
          this.conversation.handleFatalError()
          this.microphoneStatus = 'error'
          this.message = message
          this.emit()
          return
        }

        this.continuousListening.recordRecoverableFailure()
        this.microphoneStatus = 'listening'
        if (code !== 'no-speech') this.message = ''
        this.emit()

        if (code === 'invalid-state') {
          this.pendingRecognitionAttempt = null
          this.activeRecognitionAttempt = null
          this.continuousListening.handleTechnicalEnded()
        }
      },
      onEnd: () => {
        if (
          attemptId !== this.pendingRecognitionAttempt &&
          attemptId !== this.activeRecognitionAttempt
        ) {
          return
        }
        this.clearRecognitionStartTimeout()
        this.pendingRecognitionAttempt = null
        this.activeRecognitionAttempt = null
        this.voiceMetrics.sessionsEnded += 1
        if (
          !this.disposed &&
          this.conversation.getSnapshot().isRunning &&
          this.conversation.getSnapshot().state !== 'SYSTEM_TURN' &&
          !this.feedbackPlaying &&
          this.isListeningPhase()
        ) {
          this.voiceMetrics.restarts += 1
          if (this.listeningStrategy === 'LEGACY') {
            this.continuousListening.suspendTechnicalListening()
            this.continuousListening.resumeTechnicalListening()
            this.startRecognition()
            return
          }
          this.microphoneStatus = 'listening'
          this.recognitionLifecycle = `Session technique ${attemptId ?? 'inconnue'} terminée, relance planifiée`
          this.continuousListening.handleTechnicalEnded()
          this.emit()
        } else if (
          !this.feedbackPlaying &&
          this.microphoneStatus !== 'disabled'
        ) {
          this.continuousListening.suspendTechnicalListening()
          this.microphoneStatus = this.recognition.isSupported
            ? 'inactive'
            : 'unavailable'
          this.emit()
        }
      },
    }
  }

  private startRecognition(technicalRestart = false): boolean {
    if (
      this.disposed ||
      !this.conversation.getSnapshot().isRunning ||
      this.conversation.getSnapshot().state === 'SYSTEM_TURN' ||
      this.feedbackPlaying ||
      !this.isListeningPhase()
    ) {
      return false
    }
    if (this.pendingRecognitionAttempt !== null) return false
    if (!this.continuousListening.beginTechnicalStart()) return false
    const attemptId = ++this.recognitionAttemptSequence
    this.pendingRecognitionAttempt = attemptId
    this.pendingRecognitionIsTechnicalRestart = technicalRestart
    if (!technicalRestart) this.microphoneStatus = 'starting'
    this.recognitionLifecycle = technicalRestart
      ? `Relance technique ${attemptId} demandée`
      : `Tentative ${attemptId} demandée`
    this.scheduleRecognitionStartTimeout(attemptId)
    this.voiceMetrics.sessionsCreated += 1
    this.recognition.start(
      this.recognitionHandlers(this.editingRevision, attemptId),
    )
    this.emit()
    return true
  }

  private async handleRecognitionStarted(
    attemptId: number | null,
  ): Promise<void> {
    if (attemptId === null || attemptId !== this.pendingRecognitionAttempt) {
      this.recognitionLifecycle = `onstart obsolète ignoré (${attemptId ?? 'sans identifiant'})`
      this.emit()
      return
    }
    const technicalRestart = this.pendingRecognitionIsTechnicalRestart
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.pendingRecognitionIsTechnicalRestart = false
    this.activeRecognitionAttempt = attemptId
    this.consecutiveStartFailures = 0
    this.continuousListening.handleTechnicalStarted()
    this.microphoneStatus = 'listening'
    this.recognitionListeningStartedAt = this.now()
    this.recognitionLifecycle = technicalRestart
      ? `Relance technique ${attemptId} active`
      : `onstart reçu pour la tentative ${attemptId}`

    if (technicalRestart) {
      this.emit()
      return
    }

    const intents = this.conversation.handleSpeechStarted()
    const expectsResponse = intents.some(
      (intent) => intent.type === 'PlayReadyBeep',
    )
    if (expectsResponse || !this.message) this.message = 'À vous de parler'
    this.emit()

    if (!expectsResponse) return
    this.readinessPlaying = true
    try {
      await this.readinessCue.play()
      this.recognitionLifecycle = `Bip émis pour la tentative ${attemptId}`
    } catch (error) {
      this.message =
        error instanceof Error
          ? error.message
          : 'Bip de disponibilité indisponible.'
    } finally {
      this.readinessPlaying = false
      this.conversation.handleReadyBeepFinished()
      this.emit()
    }
  }

  private scheduleRecognitionStartTimeout(attemptId: number): void {
    this.clearRecognitionStartTimeout()
    this.recognitionStartTimeout = setTimeout(() => {
      if (attemptId !== this.pendingRecognitionAttempt) return
      this.pendingRecognitionAttempt = null
      this.pendingRecognitionIsTechnicalRestart = false
      this.activeRecognitionAttempt = null
      this.consecutiveStartFailures += 1
      this.continuousListening.recordRecoverableFailure()
      this.recognitionLifecycle = `Timeout de la tentative ${attemptId}`
      this.recognition.stop()

      if (this.consecutiveStartFailures >= 3) {
        this.continuousListening.stopFunctionalListening()
        this.conversation.handleFatalError()
        this.microphoneStatus = 'error'
        this.message = 'Impossible de démarrer la reconnaissance vocale.'
        this.emit()
        return
      }

      if (this.conversation.getSnapshot().state === 'PLAYER_LISTENING') {
        this.microphoneStatus = 'listening'
      }
      this.continuousListening.handleTechnicalEnded()
      this.emit()
    }, 1_500)
  }

  private clearRecognitionStartTimeout(): void {
    if (this.recognitionStartTimeout === null) return
    clearTimeout(this.recognitionStartTimeout)
    this.recognitionStartTimeout = null
  }

  private cancelPendingRecognitionAttempt(reason: string): void {
    if (this.pendingRecognitionAttempt === null) return
    this.clearRecognitionStartTimeout()
    this.recognitionLifecycle = `${reason} : tentative ${this.pendingRecognitionAttempt} annulée`
    this.pendingRecognitionAttempt = null
    this.pendingRecognitionIsTechnicalRestart = false
  }

  private async announce(text: string, expectsResponse = false): Promise<void> {
    this.conversation.beginAnnouncement(text, expectsResponse)
    this.microphoneStatus = 'speaking'
    this.continuousListening.suspendTechnicalListening()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.pendingRecognitionIsTechnicalRestart = false
    this.activeRecognitionAttempt = null
    this.recognition.stop()
    this.emit()

    try {
      if (text && !this.synthesis.isSupported) {
        throw new Error('Synthèse vocale indisponible dans ce navigateur.')
      }
      if (text) await this.synthesis.speak(text)
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Erreur de synthèse vocale.'
    } finally {
      const intents = this.conversation.handleAnnouncementFinished()
      if (
        this.conversation.getSnapshot().isRunning &&
        this.isListeningPhase() &&
        this.recognition.isSupported
      ) {
        this.continuousListening.resumeTechnicalListening()
        if (intents.some((intent) => intent.type === 'StartRecognition')) {
          this.startRecognition()
        }
        this.emit()
      } else {
        this.microphoneStatus = this.recognition.isSupported
          ? this.conversation.getSnapshot().isRunning
            ? 'inactive'
            : 'disabled'
          : 'unavailable'
        this.emit()
      }
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}

export function isReservedCommand(value: string): boolean {
  return resolveVoiceCommand(normalizeSpeech(value)) !== null
}

export function stateForAnnouncement(
  match: MatchState,
  display: DisplayState,
): AnnounceableMatchState {
  return { match, display }
}
