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
  VoiceMatchSetup,
  type VoiceMatchSetupSnapshot,
} from './VoiceMatchSetup'

export type MatchPhase =
  'setup' | 'voice-setup' | 'match' | 'correction' | 'finished'
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
  private voiceSetupSnapshot: VoiceMatchSetupSnapshot | null = null
  private lastExecutedVoiceCommand: { transcript: string; at: number } | null =
    null
  private actionCount = 0
  private feedbackPlaying = false
  private readinessPlaying = false
  private recognitionAttemptSequence = 0
  private pendingRecognitionAttempt: number | null = null
  private recognitionStartTimeout: ReturnType<typeof setTimeout> | null = null
  private recognitionStartRetry = 0
  private recognitionRetryScheduled = false
  private recognitionRetryFallback: ReturnType<typeof setTimeout> | null = null
  private recognitionLifecycle = 'Aucune tentative'
  private readonly conversation = new ConversationEngine((intent) => {
    if (intent.type === 'Timeout') void this.expireCorrection()
  })
  private disposed = false
  private readonly listeners = new Set<Listener>()

  constructor(
    private readonly recognition: RecognitionAdapter,
    private readonly synthesis: SynthesisAdapter,
    private readonly feedback: CommandFeedbackAdapter = NOOP_FEEDBACK,
    private readonly now: () => number = () => Date.now(),
    private readonly readinessCue: ReadinessCueAdapter = NOOP_READINESS_CUE,
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
    }
  }

  subscribe(listener: Listener): () => void {
    this.disposed = false
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
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
    })
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
    if (this.recognition.isSupported) this.conversation.start()

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

  async startVoiceSetup(feedbackMode: FeedbackMode = 'NONE'): Promise<void> {
    if (!this.recognition.isSupported) {
      this.message = 'Reconnaissance vocale indisponible dans ce navigateur.'
      this.microphoneStatus = 'unavailable'
      this.emit()
      return
    }
    const result = this.voiceSetup.start(this.editingConfiguration)
    this.editingRevision += 1
    this.voiceSetupSnapshot = result.snapshot
    this.phase = 'voice-setup'
    this.feedbackMode = feedbackMode
    this.conversation.start()
    this.conversation.enterGuidedMode()
    this.lastCommand = 'Configuration vocale démarrée'
    this.message = ''
    this.readinessCue.prepare()
    this.emit()
    await this.announce(result.announcement, true)
  }

  updateEditingConfiguration(configuration: MatchConfiguration): void {
    if (this.phase !== 'setup' && this.phase !== 'voice-setup') return
    this.editingConfiguration = copyMatchConfiguration(configuration)
    this.editingRevision += 1
    if (this.phase === 'voice-setup') {
      this.voiceSetup.synchronizeConfiguration(this.editingConfiguration)
      this.voiceSetupSnapshot = this.voiceSetup.getSnapshot()
      this.cancelPendingRecognitionAttempt('Modification manuelle')
      this.recognition.stop()
      this.startRecognition()
    }
    this.emit()
  }

  async handleTranscript(
    result: SpeechTranscript,
    sourceRevision = this.editingRevision,
  ): Promise<void> {
    if (this.phase === 'setup' || this.phase === 'finished') return
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
      await this.handleVoiceSetupTranscript(result.transcript)
      return
    }

    if (this.phase === 'correction') {
      await this.handlePointCorrection(result.transcript, normalized)
      return
    }

    const state = this.engine.getState()
    const normalizedA = normalizeSpeech(
      this.configuration?.teamA.voiceIdentifier ?? state.teams.A,
    )
    const normalizedB = normalizeSpeech(
      this.configuration?.teamB.voiceIdentifier ?? state.teams.B,
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

    if (next.match.winner) {
      this.phase = 'finished'
      this.conversation.stop()
    }
    this.emit()
    await this.announce(buildTransitionAnnouncement(previous, next, team))
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
    this.message = ''
    this.startRecognition()
  }

  disableListening(): void {
    this.conversation.stop()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.recognition.stop()
    this.microphoneStatus = 'disabled'
    this.message = 'Écoute désactivée volontairement.'
    this.emit()
  }

  prepareNewMatch(): void {
    this.conversation.stop()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.recognition.stop()
    this.synthesis.cancel()
    this.engine = new ScoreEngine()
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
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.recognitionRetryScheduled = false
    if (this.recognitionRetryFallback !== null) {
      clearTimeout(this.recognitionRetryFallback)
      this.recognitionRetryFallback = null
    }
    this.recognition.dispose()
    this.synthesis.cancel()
    this.feedback.dispose()
    this.readinessCue.dispose()
    this.listeners.clear()
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
      this.phase === 'voice-setup' ||
      this.phase === 'match' ||
      this.phase === 'correction'
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
      this.conversation.stop()
      this.conversation.exitGuidedMode()
      this.phase = 'setup'
      this.voiceSetupSnapshot = null
      this.recognition.stop()
      await this.announce(result.announcement)
      return
    }
    if (result.completedConfiguration) {
      const feedbackMode = this.feedbackMode
      this.conversation.exitGuidedMode()
      this.conversation.stop()
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
      onResult: (result) => void this.handleTranscript(result, sourceRevision),
      onError: (code, message) => {
        if (attemptId !== this.pendingRecognitionAttempt) return
        this.clearRecognitionStartTimeout()
        this.pendingRecognitionAttempt = null
        this.recognitionStartRetry = 0
        this.recognitionLifecycle = `Erreur réelle : ${code}`
        if (code === 'no-speech') {
          this.message = message
        } else {
          this.conversation.handleSpeechRejected()
          this.microphoneStatus = 'error'
          this.message = message
        }
        this.emit()
      },
      onEnd: () => {
        if (this.recognitionRetryScheduled) {
          this.launchScheduledRecognitionRetry()
          return
        }
        if (this.pendingRecognitionAttempt !== null) return
        if (
          !this.disposed &&
          this.conversation.getSnapshot().isRunning &&
          this.conversation.getSnapshot().state !== 'SYSTEM_TURN' &&
          !this.feedbackPlaying &&
          this.isListeningPhase()
        ) {
          this.startRecognition()
        } else if (
          !this.feedbackPlaying &&
          this.microphoneStatus !== 'disabled'
        ) {
          this.microphoneStatus = this.recognition.isSupported
            ? 'inactive'
            : 'unavailable'
          this.emit()
        }
      },
    }
  }

  private startRecognition(): boolean {
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
    const attemptId = ++this.recognitionAttemptSequence
    this.pendingRecognitionAttempt = attemptId
    this.microphoneStatus = 'starting'
    this.recognitionLifecycle = `Tentative ${attemptId} demandée`
    this.scheduleRecognitionStartTimeout(attemptId)
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
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.recognitionStartRetry = 0
    this.recognitionRetryScheduled = false
    if (this.recognitionRetryFallback !== null) {
      clearTimeout(this.recognitionRetryFallback)
      this.recognitionRetryFallback = null
    }
    this.microphoneStatus = 'listening'
    this.recognitionLifecycle = `onstart reçu pour la tentative ${attemptId}`
    const intents = this.conversation.handleSpeechStarted()
    this.message = 'À vous de parler'
    this.emit()

    if (!intents.some((intent) => intent.type === 'PlayReadyBeep')) return
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
      this.recognitionLifecycle = `Timeout de la tentative ${attemptId}`
      if (this.recognitionStartRetry === 0) {
        this.recognitionStartRetry = 1
        this.recognitionRetryScheduled = true
        this.recognition.stop()
        this.recognitionRetryFallback = setTimeout(
          () => this.launchScheduledRecognitionRetry(),
          100,
        )
        return
      }
      this.recognitionStartRetry = 0
      this.conversation.handleSpeechRejected()
      this.microphoneStatus = 'error'
      this.message = 'Impossible de démarrer la reconnaissance vocale.'
      this.emit()
    }, 1_500)
  }

  private clearRecognitionStartTimeout(): void {
    if (this.recognitionStartTimeout === null) return
    clearTimeout(this.recognitionStartTimeout)
    this.recognitionStartTimeout = null
  }

  private launchScheduledRecognitionRetry(): void {
    if (!this.recognitionRetryScheduled) return
    this.recognitionRetryScheduled = false
    if (this.recognitionRetryFallback !== null) {
      clearTimeout(this.recognitionRetryFallback)
      this.recognitionRetryFallback = null
    }
    this.startRecognition()
  }

  private cancelPendingRecognitionAttempt(reason: string): void {
    if (this.pendingRecognitionAttempt === null) return
    this.clearRecognitionStartTimeout()
    this.recognitionLifecycle = `${reason} : tentative ${this.pendingRecognitionAttempt} annulée`
    this.pendingRecognitionAttempt = null
    this.recognitionStartRetry = 0
    this.recognitionRetryScheduled = false
    if (this.recognitionRetryFallback !== null) {
      clearTimeout(this.recognitionRetryFallback)
      this.recognitionRetryFallback = null
    }
  }

  private async announce(text: string, expectsResponse = false): Promise<void> {
    this.conversation.beginAnnouncement(text, expectsResponse)
    this.microphoneStatus = 'speaking'
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
