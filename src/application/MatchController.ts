import { ScoreEngine } from '../core/ScoreEngine'
import type { DisplayState, MatchState, TeamId } from '../core/matchTypes'
import {
  type PlayerId,
  type PlayerParticipant,
  type PlayerSide,
} from '../core/playerPlusService'
import { resolveVoiceCommand } from '../voice/commandAliases'
import { matchesControlledResponse } from '../voice/controlledResponseAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import type {
  AudioReadinessSource,
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
  canonicalizeMatchConfiguration,
  createDefaultMatchConfiguration,
  type MatchConfigurationInput,
  type MatchConfiguration,
  type PlayerMatchConfiguration,
  validateMatchConfiguration,
} from './matchConfiguration'
import {
  VoiceMatchSetup,
  type VoiceSetupEditedField,
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
import {
  MATCH_PERSISTENCE_SCHEMA_VERSION,
  type MatchSessionSnapshot,
} from './matchPersistence'

export interface VoiceRuntimeMetrics {
  sessionsCreated: number
  sessionsEnded: number
  restarts: number
  errors: number
  commandsRecognized: number
  commandsLost: number
  lastError: string
}

export interface RecognitionTimingSnapshot {
  generation: number | null
  audioReadinessSource: AudioReadinessSource | null
  startRequestedAt: number | null
  startToOnStartMs: number | null
  onStartToAudioStartMs: number | null
  beepStartedAt: number | null
  beepEndedAt: number | null
  beepEndToSpeechStartMs: number | null
  speechDurationMs: number | null
  speechEndToResultMs: number | null
  beepEndToResultMs: number | null
  decision: 'pending' | 'accepted' | 'ignored'
  decisionGeneration: number | null
  decisionReason: string
}

interface RecognitionTimingState extends RecognitionTimingSnapshot {
  onStartAt: number | null
  audioStartedAt: number | null
  speechStartedAt: number | null
  speechEndedAt: number | null
}

function emptyRecognitionTiming(): RecognitionTimingState {
  return {
    generation: null,
    audioReadinessSource: null,
    startRequestedAt: null,
    startToOnStartMs: null,
    onStartToAudioStartMs: null,
    beepStartedAt: null,
    beepEndedAt: null,
    beepEndToSpeechStartMs: null,
    speechDurationMs: null,
    speechEndToResultMs: null,
    beepEndToResultMs: null,
    decision: 'pending',
    decisionGeneration: null,
    decisionReason: '',
    onStartAt: null,
    audioStartedAt: null,
    speechStartedAt: null,
    speechEndedAt: null,
  }
}

export type VoiceTraceEventType =
  | 'START_CALLED'
  | 'RECOGNITION_START_REQUESTED'
  | 'ONSTART'
  | 'AUDIOSTART'
  | 'ONEND'
  | 'RESTART_REQUESTED'
  | 'APPLICATION_SOUND'
  | 'ANNOUNCEMENT_REQUESTED'
  | 'ANNOUNCEMENT_STARTED'
  | 'ANNOUNCEMENT_ENDED'
  | 'ANNOUNCEMENT_ERROR'
  | 'ANNOUNCEMENT_CANCELLED'
  | 'ANNOUNCEMENT_TIMEOUT'

export interface VoiceTraceEvent {
  at: number
  type: VoiceTraceEventType
  origin: string
  attemptId: number | null
  announcementId?: number
  announcementType?: 'RESPONSE_REQUIRED' | 'INFORMATION'
  soundType?: 'READY_BEEP' | 'COMMAND_BEEP' | 'COMMAND_OK' | 'ANNOUNCEMENT'
}

export type MatchPhase =
  | 'setup'
  | 'voice-setup'
  | 'match'
  | 'correction'
  | 'server-correction'
  | 'player-server-selection'
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
  editingConfiguration: PlayerMatchConfiguration
  playerServerSelection: PlayerServerSelectionSnapshot | null
  currentPlayerServer: PlayerServerChoice | null
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
  voiceTrace: VoiceTraceEvent[]
  recognitionTiming: RecognitionTimingSnapshot
  durableRevision: number
}

export interface StartMatchOptions {
  configuration: MatchConfigurationInput
  feedbackMode?: FeedbackMode
}

export interface PlayerServerChoice {
  id: PlayerId
  name: string
  side: PlayerSide
}

export interface PlayerServerSelectionSnapshot {
  purpose: 'SECOND_SERVER' | 'CORRECTION'
  teamId: TeamId
  teamName: string
  choices: readonly PlayerServerChoice[]
  awaitingSide: boolean
}

interface PlayerServerSelectionState {
  purpose: PlayerServerSelectionSnapshot['purpose']
  teamId: TeamId
  candidateIds: readonly PlayerId[]
  awaitingSide: boolean
}

type Listener = (snapshot: MatchControllerSnapshot) => void

const DUPLICATE_WINDOW_MS = 1_500
const MINIMUM_ANNOUNCEMENT_TIMEOUT_MS = 4_000
const MAXIMUM_ANNOUNCEMENT_TIMEOUT_MS = 15_000

export function announcementSafetyTimeoutMs(text: string): number {
  return Math.min(
    MAXIMUM_ANNOUNCEMENT_TIMEOUT_MS,
    Math.max(MINIMUM_ANNOUNCEMENT_TIMEOUT_MS, 3_000 + text.length * 80),
  )
}

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
  private playerServerSelection: PlayerServerSelectionState | null = null
  private editingRevision = 0
  private readonly voiceSetup = new VoiceMatchSetup()
  private readonly waitingVoiceEntry = new WaitingVoiceEntry()
  private readonly connectionQuality = new ConnectionQualityMonitor()
  private recognitionListeningStartedAt: number | null = null
  private voiceSetupSnapshot: VoiceMatchSetupSnapshot | null = null
  private lastExecutedVoiceCommand: { transcript: string; at: number } | null =
    null
  private actionCount = 0
  private durableRevision = 0
  private feedbackPlaying = false
  private readinessPlaying = false
  private recognitionAttemptSequence = 0
  private pendingRecognitionAttempt: number | null = null
  private pendingRecognitionIsTechnicalRestart = false
  private activeRecognitionAttempt: number | null = null
  private activeRecognitionIsTechnicalRestart = false
  private audioReadyAttempt: number | null = null
  private readyBeepAttempt: number | null = null
  private recognitionStartTimeout: ReturnType<typeof setTimeout> | null = null
  private restartConfigurationPromise: Promise<void> | null = null
  private announcementSequence = 0
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
  private voiceTrace: VoiceTraceEvent[] = []
  private recognitionTiming = emptyRecognitionTiming()
  private lastRecognitionTiming: RecognitionTimingSnapshot | null = null
  private readonly conversation = new ConversationEngine((intent) => {
    if (intent.type === 'Timeout') void this.expireCorrection()
  })
  private readonly continuousListening = new ContinuousListeningManager(() =>
    this.startRecognition(true, 'CONTINUOUS_RESTART_TIMER'),
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
      display: this.getPresentationDisplayState(),
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
      playerServerSelection: this.getPlayerServerSelectionSnapshot(),
      currentPlayerServer: this.getCurrentPlayerServerSnapshot(),
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
      voiceTrace: this.voiceTrace.map((event) => ({ ...event })),
      recognitionTiming: this.getRecognitionTimingSnapshot(),
      durableRevision: this.durableRevision,
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
      this.startRecognition(false, 'STRATEGY_CHANGE')
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
    this.voiceTrace = []
    this.recognitionTiming = emptyRecognitionTiming()
    this.lastRecognitionTiming = null
    this.emit()
  }

  startMatch(options: StartMatchOptions): boolean {
    const validationError = validateMatchConfiguration(options.configuration)
    if (validationError) {
      this.message = validationError
      this.emit()
      return false
    }

    const configuration = canonicalizeMatchConfiguration(options.configuration)

    this.resetRecognitionForMatchStart()
    this.engine = new ScoreEngine({
      teamNames: {
        A: configuration.teamA.displayName.trim(),
        B: configuration.teamB.displayName.trim(),
      },
      servingTeam:
        configuration.mode === 'PLAYER' ? configuration.servingTeam : undefined,
      playerPlus:
        configuration.mode === 'PLAYERS_PLUS'
          ? {
              participants: configuration.participants,
              firstServer: configuration.firstServer,
            }
          : undefined,
      format: 'FREE_PLAY',
    })
    this.session.reset()
    this.session.start()
    this.experience.startMatch()
    this.configuration = copyMatchConfiguration(configuration)
    this.editingConfiguration =
      configuration.mode === 'PLAYER'
        ? copyMatchConfiguration(configuration)
        : createDefaultMatchConfiguration()
    this.playerServerSelection = null
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
    this.durableRevision += 1
    if (this.recognition.isSupported) {
      this.conversation.start(this.readinessCue !== NOOP_READINESS_CUE)
      this.continuousListening.startFunctionalListening()
    }

    if (this.recognition.isSupported) {
      this.startRecognition(false, 'MATCH_START')
    } else {
      this.microphoneStatus = 'unavailable'
      this.message =
        'Reconnaissance vocale indisponible. Utilisez Google Chrome ou les boutons de secours.'
    }
    this.emit()
    if (configuration.mode === 'PLAYERS_PLUS') {
      const server = this.currentPlayerParticipant()
      if (server) void this.announce(`Service : ${server.name}.`)
    }
    return true
  }

  createMatchSessionSnapshot(metadata: {
    id: string
    createdAt: string
    startedAt: string
    updatedAt?: string
  }): MatchSessionSnapshot | null {
    if (
      !this.configuration ||
      this.session.getSnapshot().state === 'NOT_STARTED'
    ) {
      return null
    }
    const engine = this.engine.exportSnapshot()
    const state = engine.state
    return {
      schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
      id: metadata.id,
      status: 'IN_PROGRESS',
      mode: this.configuration.mode,
      configuration: copyMatchConfiguration(this.configuration),
      createdAt: metadata.createdAt,
      startedAt: metadata.startedAt,
      updatedAt: metadata.updatedAt ?? new Date(this.now()).toISOString(),
      engine,
      completedSets: state.completedSets.map((set) => ({ ...set })),
      currentScore: {
        sets: { ...state.sets },
        games: { ...state.games },
        points: { ...state.points },
        isTieBreak: state.isTieBreak,
      },
      application: {
        feedbackMode: this.feedbackMode,
        actionCount: this.actionCount,
      },
    }
  }

  restoreMatchSession(snapshot: MatchSessionSnapshot): boolean {
    try {
      if (snapshot.schemaVersion !== MATCH_PERSISTENCE_SCHEMA_VERSION) {
        throw new Error('La sauvegarde utilise une version incompatible.')
      }
      const validationError = validateMatchConfiguration(snapshot.configuration)
      if (validationError) throw new Error(validationError)
      const configuration = canonicalizeMatchConfiguration(
        snapshot.configuration,
      )
      const engine = ScoreEngine.fromSnapshot(snapshot.engine)
      if (engine.getState().service.mode !== configuration.mode) {
        throw new Error('Le mode sauvegardé ne correspond pas au moteur.')
      }

      this.resetRecognitionForMatchStart()
      this.recognition.stop()
      this.engine = engine
      this.session.restore({
        state: 'IN_PROGRESS',
        isFinishConfirmationPending: false,
      })
      this.experience.startMatch()
      this.configuration = copyMatchConfiguration(configuration)
      this.editingConfiguration =
        configuration.mode === 'PLAYER'
          ? copyMatchConfiguration(configuration)
          : createDefaultMatchConfiguration()
      this.playerServerSelection = null
      this.voiceSetupSnapshot = null
      this.phase = 'match'
      this.microphoneStatus = this.recognition.isSupported
        ? 'disabled'
        : 'unavailable'
      this.lastTranscript = ''
      this.lastCommand = 'Match restauré'
      this.message = this.recognition.isSupported
        ? 'Match restauré. Réactivez l’écoute pour reprendre les commandes vocales.'
        : 'Match restauré. Utilisez les boutons de secours.'
      this.recognitionDiagnostics = null
      this.conversationStatus = 'Mode normal'
      this.normalizedTranscript = ''
      this.interpretation = ''
      this.rejectionReason = ''
      this.extractedContent = ''
      this.correctionResult = ''
      this.feedbackMode = snapshot.application.feedbackMode
      this.feedback.prepare(this.feedbackMode)
      this.readinessCue.prepare()
      this.lastExecutedVoiceCommand = null
      this.actionCount = snapshot.application.actionCount
      this.editingRevision += 1
      this.durableRevision += 1
      this.emit()
      return true
    } catch (error) {
      this.message =
        error instanceof Error
          ? error.message
          : 'La sauvegarde du match est invalide.'
      this.emit()
      return false
    }
  }

  startConfiguredMatch(options: StartMatchOptions): boolean {
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
    this.startRecognition(false, 'WAITING_SCREEN')
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

  updateEditingConfiguration(
    configuration: PlayerMatchConfiguration,
    editedField?: VoiceSetupEditedField,
  ): void {
    if (this.phase !== 'setup' && this.phase !== 'voice-setup') return
    const listeningWasRequested = this.conversation.getSnapshot().isRunning
    this.editingConfiguration = copyMatchConfiguration(configuration)
    this.experience.beginConfiguration()
    this.editingRevision += 1
    this.durableRevision += 1
    if (this.phase === 'voice-setup') {
      this.voiceSetup.synchronizeConfiguration(
        this.editingConfiguration,
        editedField,
      )
      this.voiceSetupSnapshot = this.voiceSetup.getSnapshot()
      this.cancelPendingRecognitionAttempt('Modification manuelle')
      this.continuousListening.suspendTechnicalListening()
      this.activeRecognitionAttempt = null
      this.recognition.stop()
      if (listeningWasRequested) {
        this.continuousListening.resumeTechnicalListening()
        this.startRecognition(false, 'MANUAL_CONFIGURATION_CHANGE')
      }
    }
    this.emit()
  }

  updateDisplayName(team: TeamId, value: string): boolean {
    const displayName = value.trim()
    if (!displayName || !this.configuration) return false
    if (this.phase === 'setup' || this.phase === 'voice-setup') return false
    const key = team === 'A' ? 'teamA' : 'teamB'

    this.configuration[key].displayName = displayName
    this.editingConfiguration[key].displayName = displayName

    this.message = ''
    this.durableRevision += 1
    this.emit()
    return true
  }

  changeServingTeam(team: TeamId): boolean {
    if (this.session.getSnapshot().state !== 'IN_PROGRESS') return false
    if (this.configuration?.mode === 'PLAYERS_PLUS') return false
    if (this.phase === 'server-correction') {
      this.conversation.exitGuidedMode()
      this.phase = 'match'
    }
    this.applyServingTeamChange(team)
    this.emit()
    return true
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
      this.recordRecognitionDecision(
        'ignored',
        this.message,
        this.activeRecognitionAttempt,
      )
      this.emit()
      return
    }
    if (
      this.conversation.getSnapshot().state === 'STARTING_LISTENING' ||
      this.readinessPlaying
    ) {
      this.lastCommand = 'Parole ignorée avant le bip de disponibilité'
      this.message = 'Réponse ignorée : attendez le bip de disponibilité.'
      this.recordRecognitionDecision(
        'ignored',
        this.message,
        this.activeRecognitionAttempt,
      )
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
      this.recordRecognitionDecision(
        'ignored',
        this.rejectionReason,
        this.activeRecognitionAttempt,
      )
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
      this.recordRecognitionDecision(
        'ignored',
        'Confiance insuffisante.',
        this.activeRecognitionAttempt,
      )
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
      if (normalized === 'recommencer') {
        await this.restartConfiguration()
        return
      }
      await this.handleVoiceSetupTranscript(result.transcript)
      return
    }

    if (this.phase === 'correction') {
      await this.handlePointCorrection(result.transcript, normalized)
      return
    }

    if (this.phase === 'server-correction') {
      await this.handleServerCorrection(normalized)
      return
    }

    if (this.phase === 'player-server-selection') {
      await this.handlePlayerServerSelection(normalized)
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
    const voiceNameA = this.configuration?.teamA.voiceName
    const voiceNameB = this.configuration?.teamB.voiceName
    const normalizedA = normalizeSpeech(voiceNameA ?? state.teams.A)
    const normalizedB = normalizeSpeech(voiceNameB ?? state.teams.B)

    if (
      voiceNameA
        ? matchesControlledResponse(normalized, voiceNameA)
        : normalized === normalizedA
    ) {
      this.lastCommand = `Point ${state.teams.A}`
      await this.executeAcceptedVoiceCommand(normalized, () =>
        this.awardPoint('A'),
      )
      return
    }
    if (
      voiceNameB
        ? matchesControlledResponse(normalized, voiceNameB)
        : normalized === normalizedB
    ) {
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
      case 'CHANGE_SERVER':
        this.lastCommand = 'Serveur'
        await this.executeAcceptedVoiceCommand(normalized, () =>
          this.enterServerCorrection(),
        )
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
      case 'DECLINE':
        this.lastCommand = 'Commande inconnue'
        this.message = 'Aucune confirmation n’est attendue.'
        this.emit()
        return
      default:
        this.lastCommand = 'Commande inconnue'
        this.message = normalized
          ? `Commande ignorée : « ${result.transcript.trim()} ».`
          : 'Transcription vide ignorée.'
        this.recordRecognitionDecision(
          'ignored',
          this.message,
          this.activeRecognitionAttempt,
        )
        this.emit()
    }
  }

  async awardPoint(team: TeamId): Promise<void> {
    if (this.phase !== 'match') return
    const previous = snapshotOf(this.engine)
    const previousPlayerServer = this.currentPlayerParticipant()?.id ?? null
    this.engine.awardPoint(team)
    this.actionCount += 1
    this.durableRevision += 1
    const next = snapshotOf(this.engine)
    this.message = ''

    this.emit()
    await this.announce(
      buildTransitionAnnouncement(previous, next, team, {
        suppressMatchWinner: true,
      }),
    )
    if (this.isAwaitingSecondPlayerServer()) {
      await this.enterPlayerServerSelection('SECOND_SERVER')
      return
    }
    const currentPlayerServer = this.currentPlayerParticipant()
    if (
      !currentPlayerServer ||
      currentPlayerServer.id === previousPlayerServer
    ) {
      return
    }
    if (next.match.completedSets.length > previous.match.completedSets.length) {
      await this.announce(
        `Ordre de service conservé. Dites Serveur pour le modifier. Service : ${currentPlayerServer.name}.`,
      )
      return
    }
    await this.announce(`Service : ${currentPlayerServer.name}.`)
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
    this.durableRevision += 1

    if (this.phase === 'finished') {
      this.phase = 'match'
      if (this.recognition.isSupported) this.conversation.start()
    }
    if (this.phase === 'player-server-selection') {
      this.playerServerSelection = null
      this.conversation.exitGuidedMode()
      this.phase = 'match'
    }
    this.message = 'Dernière action annulée.'
    this.emit()
    await this.announcePointScore()
    if (this.isAwaitingSecondPlayerServer()) {
      await this.enterPlayerServerSelection('SECOND_SERVER')
    }
    return true
  }

  async announcePointScore(): Promise<void> {
    await this.announce(buildPointScoreAnnouncement(snapshotOf(this.engine)))
  }

  async announceFullScore(): Promise<void> {
    await this.announce(
      buildFullScoreAnnouncement({
        match: this.engine.getState(),
        display: this.getPresentationDisplayState(),
      }),
    )
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

  async enterServerCorrection(): Promise<void> {
    if (this.phase !== 'match') return
    if (this.configuration?.mode === 'PLAYERS_PLUS') {
      await this.enterPlayerServerSelection('CORRECTION')
      return
    }
    this.conversation.exitGuidedMode()
    this.conversation.enterGuidedMode()
    this.phase = 'server-correction'
    this.conversationStatus = 'Mode normal'
    this.interpretation = 'attente de l’équipe au service'
    this.rejectionReason = ''
    this.message = 'Quelle équipe sert ?'
    this.emit()
    await this.announce('Quelle équipe sert ?', true)
  }

  async selectPlayerServer(playerId: PlayerId): Promise<boolean> {
    const selection = this.playerServerSelection
    if (this.phase !== 'player-server-selection' || !selection) return false
    if (!selection.candidateIds.includes(playerId)) {
      this.message = 'Ce joueur n’appartient pas à l’équipe attendue.'
      this.emit()
      return false
    }

    try {
      let changed = true
      if (selection.purpose === 'SECOND_SERVER') {
        this.engine.confirmSecondServer(playerId)
      } else {
        changed = this.engine.correctPlayerServer(playerId)
      }
      if (changed) this.actionCount += 1
      if (changed) this.durableRevision += 1
      const participant = this.playerParticipant(playerId)
      this.playerServerSelection = null
      this.conversation.exitGuidedMode()
      this.phase = 'match'
      this.lastCommand =
        selection.purpose === 'SECOND_SERVER'
          ? 'Second serveur validé'
          : 'Serveur PLAYER+ corrigé'
      this.interpretation = `service ${playerId}`
      this.rejectionReason = ''
      this.message = participant ? `Service : ${participant.name}.` : ''
      this.emit()
      await this.announce(this.message)
      return true
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Serveur invalide.'
      this.emit()
      return false
    }
  }

  cancelPlayerServerSelection(): void {
    if (
      this.phase !== 'player-server-selection' ||
      this.playerServerSelection?.purpose !== 'CORRECTION'
    ) {
      return
    }
    this.playerServerSelection = null
    this.conversation.manualCancel()
    this.phase = 'match'
    this.message = 'Changement de serveur annulé.'
    this.emit()
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
      this.durableRevision += 1
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
    this.conversation.start(this.readinessCue !== NOOP_READINESS_CUE)
    this.continuousListening.startFunctionalListening()
    this.message = ''
    this.startRecognition(false, 'MANUAL_ENABLE')
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
    this.playerServerSelection = null
    this.editingConfiguration = createDefaultMatchConfiguration()
    this.editingRevision += 1
    this.voiceSetupSnapshot = null
    this.lastExecutedVoiceCommand = null
    this.actionCount = 0
    this.durableRevision += 1
    this.emit()
  }

  destroy(): void {
    this.disposed = true
    this.announcementSequence += 1
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

  restartConfiguration(): Promise<void> {
    if (this.phase !== 'voice-setup') return Promise.resolve()
    if (this.restartConfigurationPromise) {
      return this.restartConfigurationPromise
    }

    const restart = this.performRestartConfiguration()
    this.restartConfigurationPromise = restart
    const clearRestart = () => {
      if (this.restartConfigurationPromise === restart) {
        this.restartConfigurationPromise = null
      }
    }
    void restart.then(clearRestart, clearRestart)
    return restart
  }

  private async requestSessionFinish(): Promise<void> {
    if (!this.session.requestFinish()) return
    this.phase = 'session-end-confirmation'
    this.conversation.enterGuidedMode()
    this.lastCommand = 'Fin de match'
    this.message = 'Confirmer la fin du match ? Oui ou non ?'
    this.emit()
    await this.announce('Confirmer la fin du match ? Oui ou non ?', true)
  }

  private async handleSessionEndConfirmation(
    normalizedTranscript: string,
  ): Promise<void> {
    const command = resolveVoiceCommand(normalizedTranscript)
    if (command?.type === 'DECLINE' || command?.type === 'UNDO') {
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
      this.message = 'Dites Oui ou Non.'
      this.emit()
      return
    }

    this.session.confirmFinish()
    this.experience.finishMatch()
    this.conversation.exitGuidedMode()
    this.phase = 'session-finished'
    this.durableRevision += 1
    this.lastCommand = 'Session terminée'
    this.message = 'Session terminée'
    this.emit()
    await this.announce(
      `Fin du match. ${buildFullScoreAnnouncement(snapshotOf(this.engine), {
        includeNextServer: false,
      })}`,
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

  private async handleServerCorrection(
    normalizedTranscript: string,
  ): Promise<void> {
    const command = resolveVoiceCommand(normalizedTranscript)
    if (command?.type === 'UNDO' || command?.type === 'DECLINE') {
      await this.executeAcceptedVoiceCommand(normalizedTranscript, async () => {
        this.conversation.manualCancel()
        this.phase = 'match'
        this.lastCommand = 'Changement de serveur annulé'
        this.message = 'Changement de serveur annulé.'
        this.emit()
        await this.announce('Changement de serveur annulé')
      })
      return
    }

    const matches = this.matchingConfiguredTeams(normalizedTranscript)
    if (matches.length !== 1) {
      this.lastCommand = 'Équipe au service non comprise'
      this.rejectionReason =
        matches.length > 1 ? 'Réponse ambiguë.' : 'Équipe inconnue.'
      this.message = 'Équipe non comprise. Quelle équipe sert ?'
      this.emit()
      await this.announce('Équipe non comprise. Quelle équipe sert ?', true)
      return
    }

    const team = matches[0]
    await this.executeAcceptedVoiceCommand(normalizedTranscript, async () => {
      this.conversation.exitGuidedMode()
      this.phase = 'match'
      this.applyServingTeamChange(team)
      this.lastCommand = `Serveur ${team}`
      this.interpretation = `service ${team}`
      this.rejectionReason = ''
      this.emit()
      await this.announce(this.message)
    })
  }

  private async enterPlayerServerSelection(
    purpose: PlayerServerSelectionState['purpose'],
  ): Promise<void> {
    if (this.configuration?.mode !== 'PLAYERS_PLUS') return
    const state = this.engine.getState()
    if (state.service.mode !== 'PLAYERS_PLUS') return
    const teamId = state.service.servingTeam
    const candidateIds = this.configuration.participants
      .filter((participant) => participant.teamId === teamId)
      .map(({ id }) => id)
    this.playerServerSelection = {
      purpose,
      teamId,
      candidateIds,
      awaitingSide: false,
    }
    this.conversation.exitGuidedMode()
    this.conversation.enterGuidedMode()
    this.phase = 'player-server-selection'
    this.interpretation =
      purpose === 'SECOND_SERVER'
        ? 'attente du serveur adverse'
        : 'correction du serveur individuel'
    this.rejectionReason = ''
    this.message = this.playerServerQuestion()
    this.emit()
    await this.announce(this.message, true)
  }

  private async handlePlayerServerSelection(
    normalizedTranscript: string,
  ): Promise<void> {
    const selection = this.playerServerSelection
    if (!selection) return
    const command = resolveVoiceCommand(normalizedTranscript)
    if (command?.type === 'UNDO' || command?.type === 'DECLINE') {
      if (selection.purpose === 'CORRECTION') {
        this.cancelPlayerServerSelection()
        await this.announce('Changement de serveur annulé')
      } else {
        await this.executeAcceptedVoiceCommand(normalizedTranscript, () =>
          this.undo(),
        )
      }
      return
    }
    if (command) {
      this.message = selection.awaitingSide
        ? 'Dites droite ou gauche.'
        : this.playerServerQuestion()
      this.emit()
      await this.announce(this.message, true)
      return
    }

    let matches: PlayerParticipant[] = []
    if (selection.awaitingSide) {
      const side = matchesControlledResponse(normalizedTranscript, 'droite')
        ? 'RIGHT'
        : matchesControlledResponse(normalizedTranscript, 'gauche')
          ? 'LEFT'
          : null
      if (side) {
        matches = this.playerServerCandidates().filter(
          (participant) => participant.side === side,
        )
      }
    } else {
      matches = this.playerServerCandidates().filter(
        ({ name }) => normalizeSpeech(name) === normalizedTranscript,
      )
    }

    if (matches.length > 1) {
      selection.awaitingSide = true
      this.lastCommand = 'Nom de joueur ambigu'
      this.message = 'Droite ou gauche ?'
      this.emit()
      await this.announce(this.message, true)
      return
    }
    if (matches.length !== 1) {
      this.lastCommand = 'Joueur au service non compris'
      this.rejectionReason = selection.awaitingSide
        ? 'Côté inconnu.'
        : 'Joueur inconnu.'
      this.message = selection.awaitingSide
        ? 'Dites droite ou gauche.'
        : this.playerServerQuestion()
      this.emit()
      await this.announce(this.message, true)
      return
    }

    await this.executeAcceptedVoiceCommand(normalizedTranscript, () =>
      this.selectPlayerServer(matches[0].id),
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
      this.durableRevision += 1
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
      this.phase === 'server-correction' ||
      this.phase === 'player-server-selection' ||
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

  private async performRestartConfiguration(): Promise<void> {
    if (this.phase !== 'voice-setup') return

    // Invalide les résultats et annonces de l'étape précédente avant le reset.
    this.editingRevision += 1
    this.announcementSequence += 1
    this.synthesis.cancel()
    this.cancelPendingRecognitionAttempt('Recommencer')
    this.continuousListening.suspendTechnicalListening()
    this.activeRecognitionAttempt = null
    this.recognition.stop()

    const result = this.voiceSetup.restart()
    this.voiceSetupSnapshot = result.snapshot
    this.editingConfiguration = copyMatchConfiguration(
      result.snapshot.configuration,
    )
    this.lastCommand = 'Configuration recommencée'
    this.message = ''
    this.experience.beginConfiguration()
    this.emit()

    await this.announce(result.announcement, true)
  }

  private async executeAcceptedVoiceCommand(
    normalizedTranscript: string,
    execute: () => Promise<unknown>,
  ): Promise<boolean> {
    const commandGeneration = this.activeRecognitionAttempt
    const previous = this.lastExecutedVoiceCommand
    const now = this.now()
    if (
      previous?.transcript === normalizedTranscript &&
      now - previous.at < DUPLICATE_WINDOW_MS
    ) {
      this.lastCommand = 'Doublon ignoré'
      this.rejectionReason = 'Commande déjà exécutée dans les 1 500 ms.'
      this.message = 'Doublon ignoré.'
      this.recordRecognitionDecision(
        'ignored',
        this.rejectionReason,
        commandGeneration,
      )
      this.emit()
      return false
    }

    await this.playCommandFeedback()
    await execute()
    this.voiceMetrics.commandsRecognized += 1
    this.recordRecognitionDecision(
      'accepted',
      'Commande exécutée.',
      commandGeneration,
    )
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
      this.traceVoice({
        type: 'APPLICATION_SOUND',
        origin: 'ACCEPTED_COMMAND_FEEDBACK',
        attemptId: this.activeRecognitionAttempt,
        soundType: this.feedbackMode === 'BEEP' ? 'COMMAND_BEEP' : 'COMMAND_OK',
      })
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
      onAudioStart: (source) =>
        void this.handleRecognitionAudioStarted(
          attemptId,
          source ?? 'audiostart',
        ),
      onSpeechStart: () => this.handleRecognitionSpeechStarted(attemptId),
      onSpeechEnd: () => this.handleRecognitionSpeechEnded(attemptId),
      onDiagnostic: (diagnostics) => {
        this.recognitionDiagnostics = { ...diagnostics }
        this.emit()
      },
      onResult: (result) => {
        if (attemptId !== this.activeRecognitionAttempt) {
          this.recordRecognitionDecision(
            'ignored',
            `Résultat de la génération ${attemptId ?? 'inconnue'} ignoré : session active ${this.activeRecognitionAttempt ?? 'aucune'}.`,
            attemptId,
          )
          this.lastCommand = 'Résultat d’une ancienne session ignoré'
          this.rejectionReason = this.recognitionTiming.decisionReason
          this.emit()
          return
        }
        this.recordRecognitionResultTiming(attemptId)
        this.continuousListening.recordSuccessfulRecognition()
        this.consecutiveNetworkErrors = 0
        void this.handleTranscript(result, sourceRevision).then(() => {
          if (
            this.lastRecognitionTiming?.generation === attemptId &&
            this.lastRecognitionTiming.decision === 'pending'
          ) {
            this.recordRecognitionDecision(
              'accepted',
              'Résultat transmis à la commande active.',
              attemptId,
            )
            this.emit()
          }
        })
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
        this.microphoneStatus =
          this.audioReadyAttempt === attemptId ? 'listening' : 'starting'
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
        this.traceVoice({
          type: 'ONEND',
          origin: 'SPEECH_RECOGNITION_EVENT',
          attemptId,
        })
        this.clearRecognitionStartTimeout()
        this.pendingRecognitionAttempt = null
        this.activeRecognitionAttempt = null
        this.activeRecognitionIsTechnicalRestart = false
        this.audioReadyAttempt = null
        if (this.readyBeepAttempt === attemptId) {
          this.readyBeepAttempt = null
          this.readinessPlaying = false
        }
        this.voiceMetrics.sessionsEnded += 1
        if (
          !this.disposed &&
          this.conversation.getSnapshot().isRunning &&
          this.conversation.getSnapshot().state !== 'SYSTEM_TURN' &&
          !this.feedbackPlaying &&
          this.isListeningPhase()
        ) {
          this.voiceMetrics.restarts += 1
          this.traceVoice({
            type: 'RESTART_REQUESTED',
            origin:
              this.listeningStrategy === 'LEGACY'
                ? 'LEGACY_ONEND'
                : 'CONTINUOUS_ONEND',
            attemptId,
          })
          if (this.listeningStrategy === 'LEGACY') {
            this.continuousListening.suspendTechnicalListening()
            this.continuousListening.resumeTechnicalListening()
            this.startRecognition(true, 'LEGACY_ONEND')
            return
          }
          this.microphoneStatus = 'starting'
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

  private startRecognition(
    technicalRestart = false,
    origin = technicalRestart ? 'TECHNICAL_RESTART' : 'FUNCTIONAL_START',
  ): boolean {
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
    const requestedAt = this.now()
    this.recognitionTiming = {
      ...emptyRecognitionTiming(),
      generation: attemptId,
      startRequestedAt: requestedAt,
    }
    this.pendingRecognitionAttempt = attemptId
    this.pendingRecognitionIsTechnicalRestart = technicalRestart
    if (!technicalRestart) this.microphoneStatus = 'starting'
    this.recognitionLifecycle = technicalRestart
      ? `Relance technique ${attemptId} demandée`
      : `Tentative ${attemptId} demandée`
    this.scheduleRecognitionStartTimeout(attemptId)
    this.voiceMetrics.sessionsCreated += 1
    this.traceVoice({
      type: 'START_CALLED',
      origin,
      attemptId,
    })
    this.traceVoice({
      type: 'RECOGNITION_START_REQUESTED',
      origin,
      attemptId,
    })
    this.recognition.start(
      this.recognitionHandlers(this.editingRevision, attemptId),
    )
    this.emit()
    return true
  }

  private resetRecognitionForMatchStart(): void {
    const hadTechnicalSession =
      this.pendingRecognitionAttempt !== null ||
      this.activeRecognitionAttempt !== null ||
      this.continuousListening.getSnapshot().recognitionRunning ||
      this.continuousListening.getSnapshot().startPending
    this.conversation.stop()
    this.conversation.exitGuidedMode()
    this.continuousListening.stopFunctionalListening()
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.pendingRecognitionIsTechnicalRestart = false
    this.activeRecognitionAttempt = null
    this.activeRecognitionIsTechnicalRestart = false
    this.audioReadyAttempt = null
    this.readyBeepAttempt = null
    this.readinessPlaying = false
    this.recognitionListeningStartedAt = null
    if (hadTechnicalSession) this.recognition.stop()
    this.microphoneStatus = this.recognition.isSupported
      ? 'starting'
      : 'unavailable'
  }

  private async handleRecognitionStarted(
    attemptId: number | null,
  ): Promise<void> {
    if (attemptId === null || attemptId !== this.pendingRecognitionAttempt) {
      this.recognitionLifecycle = `onstart obsolète ignoré (${attemptId ?? 'sans identifiant'})`
      this.emit()
      return
    }
    this.traceVoice({
      type: 'ONSTART',
      origin: 'SPEECH_RECOGNITION_EVENT',
      attemptId,
    })
    const startedAt = this.now()
    if (this.recognitionTiming.generation === attemptId) {
      this.recognitionTiming.onStartAt = startedAt
      this.recognitionTiming.startToOnStartMs =
        this.recognitionTiming.startRequestedAt === null
          ? null
          : Math.max(0, startedAt - this.recognitionTiming.startRequestedAt)
    }
    const technicalRestart = this.pendingRecognitionIsTechnicalRestart
    this.clearRecognitionStartTimeout()
    this.pendingRecognitionAttempt = null
    this.pendingRecognitionIsTechnicalRestart = false
    this.activeRecognitionAttempt = attemptId
    this.activeRecognitionIsTechnicalRestart = technicalRestart
    this.audioReadyAttempt = null
    this.consecutiveStartFailures = 0
    this.continuousListening.handleTechnicalStarted()
    this.recognitionLifecycle = technicalRestart
      ? `Relance technique ${attemptId} démarrée, capture audio attendue`
      : `onstart reçu pour la tentative ${attemptId}`
    this.emit()
  }

  private async handleRecognitionAudioStarted(
    attemptId: number | null,
    source: AudioReadinessSource,
  ): Promise<void> {
    if (
      attemptId === null ||
      attemptId !== this.activeRecognitionAttempt ||
      this.audioReadyAttempt === attemptId
    ) {
      return
    }
    this.audioReadyAttempt = attemptId
    const audioStartedAt = this.now()
    if (this.recognitionTiming.generation === attemptId) {
      this.recognitionTiming.audioReadinessSource = source
      this.recognitionTiming.audioStartedAt = audioStartedAt
      this.recognitionTiming.onStartToAudioStartMs =
        this.recognitionTiming.onStartAt === null
          ? null
          : Math.max(0, audioStartedAt - this.recognitionTiming.onStartAt)
    }
    this.traceVoice({
      type: 'AUDIOSTART',
      origin: 'SPEECH_RECOGNITION_EVENT',
      attemptId,
    })
    const technicalRestart = this.activeRecognitionIsTechnicalRestart
    this.microphoneStatus = 'listening'
    this.recognitionListeningStartedAt = this.now()
    this.recognitionLifecycle = technicalRestart
      ? `Relance technique ${attemptId} prête`
      : `Capture audio prête pour la tentative ${attemptId}`

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
    this.readyBeepAttempt = attemptId
    this.readinessPlaying = true
    try {
      if (this.recognitionTiming.generation === attemptId) {
        this.recognitionTiming.beepStartedAt = this.now()
      }
      this.traceVoice({
        type: 'APPLICATION_SOUND',
        origin: 'EXPECTED_RESPONSE_READY',
        attemptId,
        soundType: 'READY_BEEP',
      })
      await this.readinessCue.play()
      if (this.recognitionTiming.generation === attemptId) {
        this.recognitionTiming.beepEndedAt = this.now()
      }
      this.recognitionLifecycle = `Bip émis pour la tentative ${attemptId}`
    } catch (error) {
      this.message =
        error instanceof Error
          ? error.message
          : 'Bip de disponibilité indisponible.'
    } finally {
      if (
        this.readyBeepAttempt === attemptId &&
        this.activeRecognitionAttempt === attemptId
      ) {
        this.readyBeepAttempt = null
        this.readinessPlaying = false
        this.conversation.handleReadyBeepFinished()
        this.emit()
      }
    }
  }

  private handleRecognitionSpeechStarted(attemptId: number | null): void {
    if (
      attemptId === null ||
      attemptId !== this.activeRecognitionAttempt ||
      this.recognitionTiming.generation !== attemptId ||
      this.readinessPlaying
    ) {
      return
    }
    const speechStartedAt = this.now()
    this.recognitionTiming.speechStartedAt = speechStartedAt
    this.recognitionTiming.speechEndedAt = null
    this.recognitionTiming.speechDurationMs = null
    this.recognitionTiming.speechEndToResultMs = null
    this.recognitionTiming.beepEndToSpeechStartMs =
      this.recognitionTiming.beepEndedAt === null
        ? null
        : Math.max(0, speechStartedAt - this.recognitionTiming.beepEndedAt)
    this.emit()
  }

  private handleRecognitionSpeechEnded(attemptId: number | null): void {
    if (
      attemptId === null ||
      attemptId !== this.activeRecognitionAttempt ||
      this.recognitionTiming.generation !== attemptId ||
      this.recognitionTiming.speechStartedAt === null
    ) {
      return
    }
    const speechEndedAt = this.now()
    this.recognitionTiming.speechEndedAt = speechEndedAt
    this.recognitionTiming.speechDurationMs = Math.max(
      0,
      speechEndedAt - this.recognitionTiming.speechStartedAt,
    )
    this.emit()
  }

  private recordRecognitionResultTiming(attemptId: number | null): void {
    if (attemptId === null || this.recognitionTiming.generation !== attemptId) {
      return
    }
    const resultAt = this.now()
    this.recognitionTiming.speechEndToResultMs =
      this.recognitionTiming.speechEndedAt === null
        ? null
        : Math.max(0, resultAt - this.recognitionTiming.speechEndedAt)
    this.recognitionTiming.beepEndToResultMs =
      this.recognitionTiming.beepEndedAt === null
        ? null
        : Math.max(0, resultAt - this.recognitionTiming.beepEndedAt)
    this.lastRecognitionTiming = {
      ...this.getActiveRecognitionTimingSnapshot(),
      decision: 'pending',
      decisionGeneration: attemptId,
      decisionReason: '',
    }
  }

  private recordRecognitionDecision(
    decision: 'accepted' | 'ignored',
    reason: string,
    generation: number | null,
  ): void {
    if (this.recognitionTiming.generation === generation) {
      this.recognitionTiming.decision = decision
      this.recognitionTiming.decisionGeneration = generation
      this.recognitionTiming.decisionReason = reason
    }
    if (this.lastRecognitionTiming?.generation === generation) {
      this.lastRecognitionTiming = {
        ...this.lastRecognitionTiming,
        decision,
        decisionGeneration: generation,
        decisionReason: reason,
      }
      return
    }
    this.lastRecognitionTiming = {
      ...emptyRecognitionTiming(),
      generation,
      decision,
      decisionGeneration: generation,
      decisionReason: reason,
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
        this.microphoneStatus = 'starting'
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
    const announcementId = ++this.announcementSequence
    const announcementType = expectsResponse
      ? ('RESPONSE_REQUIRED' as const)
      : ('INFORMATION' as const)
    const origin = `ANNOUNCEMENT_${this.phase.toUpperCase()}`
    let terminalEventRecorded = false
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null
    const traceAnnouncement = (
      type:
        | 'ANNOUNCEMENT_REQUESTED'
        | 'ANNOUNCEMENT_STARTED'
        | 'ANNOUNCEMENT_ENDED'
        | 'ANNOUNCEMENT_ERROR'
        | 'ANNOUNCEMENT_CANCELLED'
        | 'ANNOUNCEMENT_TIMEOUT',
    ) => {
      if (
        type !== 'ANNOUNCEMENT_REQUESTED' &&
        type !== 'ANNOUNCEMENT_STARTED'
      ) {
        if (terminalEventRecorded) return
        terminalEventRecorded = true
      }
      this.traceVoice({
        type,
        origin,
        attemptId: null,
        announcementId,
        announcementType,
      })
    }

    traceAnnouncement('ANNOUNCEMENT_REQUESTED')
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
      if (text) {
        this.traceVoice({
          type: 'APPLICATION_SOUND',
          origin,
          attemptId: null,
          announcementId,
          announcementType,
          soundType: 'ANNOUNCEMENT',
        })
        await Promise.race([
          this.synthesis.speak(text, {
            onStarted: () => {
              if (announcementId === this.announcementSequence) {
                traceAnnouncement('ANNOUNCEMENT_STARTED')
              }
            },
            onEnded: () => traceAnnouncement('ANNOUNCEMENT_ENDED'),
            onError: () => traceAnnouncement('ANNOUNCEMENT_ERROR'),
            onCancelled: () => traceAnnouncement('ANNOUNCEMENT_CANCELLED'),
          }),
          new Promise<void>((resolve) => {
            safetyTimeout = setTimeout(() => {
              traceAnnouncement('ANNOUNCEMENT_TIMEOUT')
              this.synthesis.cancel()
              resolve()
            }, announcementSafetyTimeoutMs(text))
          }),
        ])
        if (!terminalEventRecorded) traceAnnouncement('ANNOUNCEMENT_ENDED')
      }
    } catch (error) {
      traceAnnouncement('ANNOUNCEMENT_ERROR')
      if (announcementId === this.announcementSequence) {
        this.message =
          error instanceof Error ? error.message : 'Erreur de synthèse vocale.'
      }
    } finally {
      if (safetyTimeout !== null) clearTimeout(safetyTimeout)
    }

    if (announcementId !== this.announcementSequence) return
    const intents = this.conversation.handleAnnouncementFinished()
    if (
      this.conversation.getSnapshot().isRunning &&
      this.isListeningPhase() &&
      this.recognition.isSupported
    ) {
      this.continuousListening.resumeTechnicalListening()
      if (intents.some((intent) => intent.type === 'StartRecognition')) {
        this.startRecognition(false, 'ANNOUNCEMENT_FINISHED')
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

  private emit(): void {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private getRecognitionTimingSnapshot(): RecognitionTimingSnapshot {
    return this.lastRecognitionTiming
      ? { ...this.lastRecognitionTiming }
      : this.getActiveRecognitionTimingSnapshot()
  }

  private getActiveRecognitionTimingSnapshot(): RecognitionTimingSnapshot {
    return {
      generation: this.recognitionTiming.generation,
      audioReadinessSource: this.recognitionTiming.audioReadinessSource,
      startRequestedAt: this.recognitionTiming.startRequestedAt,
      startToOnStartMs: this.recognitionTiming.startToOnStartMs,
      onStartToAudioStartMs: this.recognitionTiming.onStartToAudioStartMs,
      beepStartedAt: this.recognitionTiming.beepStartedAt,
      beepEndedAt: this.recognitionTiming.beepEndedAt,
      beepEndToSpeechStartMs: this.recognitionTiming.beepEndToSpeechStartMs,
      speechDurationMs: this.recognitionTiming.speechDurationMs,
      speechEndToResultMs: this.recognitionTiming.speechEndToResultMs,
      beepEndToResultMs: this.recognitionTiming.beepEndToResultMs,
      decision: this.recognitionTiming.decision,
      decisionGeneration: this.recognitionTiming.decisionGeneration,
      decisionReason: this.recognitionTiming.decisionReason,
    }
  }

  private getPresentationDisplayState(): DisplayState {
    const display = this.engine.getDisplayState()

    return {
      ...display,
      teams: {
        A: {
          ...display.teams.A,
          name: this.configuration?.teamA.displayName ?? display.teams.A.name,
        },
        B: {
          ...display.teams.B,
          name: this.configuration?.teamB.displayName ?? display.teams.B.name,
        },
      },
    }
  }

  private playerParticipant(playerId: PlayerId): PlayerParticipant | null {
    if (this.configuration?.mode !== 'PLAYERS_PLUS') return null
    return (
      this.configuration.participants.find(({ id }) => id === playerId) ?? null
    )
  }

  private currentPlayerParticipant(): PlayerParticipant | null {
    const service = this.engine.getState().service
    if (
      service.mode !== 'PLAYERS_PLUS' ||
      service.stage === 'AWAITING_SECOND_SERVER'
    ) {
      return null
    }
    return this.playerParticipant(service.currentServer)
  }

  private isAwaitingSecondPlayerServer(): boolean {
    const service = this.engine.getState().service
    return (
      service.mode === 'PLAYERS_PLUS' &&
      service.stage === 'AWAITING_SECOND_SERVER'
    )
  }

  private playerServerCandidates(): PlayerParticipant[] {
    if (this.configuration?.mode !== 'PLAYERS_PLUS') return []
    const candidateIds = this.playerServerSelection?.candidateIds ?? []
    return this.configuration.participants.filter(({ id }) =>
      candidateIds.includes(id),
    )
  }

  private playerServerQuestion(): string {
    const selection = this.playerServerSelection
    if (!selection || this.configuration?.mode !== 'PLAYERS_PLUS') return ''
    const teamName =
      selection.teamId === 'A'
        ? this.configuration.teamA.displayName
        : this.configuration.teamB.displayName
    const choices = this.playerServerCandidates()
    return `Qui sert pour ${teamName} : ${choices.map(({ name }) => name).join(' ou ')} ?`
  }

  private getPlayerServerSelectionSnapshot(): PlayerServerSelectionSnapshot | null {
    const selection = this.playerServerSelection
    if (!selection || this.configuration?.mode !== 'PLAYERS_PLUS') return null
    const teamName =
      selection.teamId === 'A'
        ? this.configuration.teamA.displayName
        : this.configuration.teamB.displayName
    return {
      purpose: selection.purpose,
      teamId: selection.teamId,
      teamName,
      choices: this.playerServerCandidates().map(({ id, name, side }) => ({
        id,
        name,
        side,
      })),
      awaitingSide: selection.awaitingSide,
    }
  }

  private getCurrentPlayerServerSnapshot(): PlayerServerChoice | null {
    const participant = this.currentPlayerParticipant()
    return participant
      ? {
          id: participant.id,
          name: participant.name,
          side: participant.side,
        }
      : null
  }

  private applyServingTeamChange(team: TeamId): void {
    if (this.engine.correctServingTeam(team)) {
      this.actionCount += 1
      this.durableRevision += 1
    }
    const teamName = this.getPresentationDisplayState().teams[team].name
    this.message = `Service : ${teamName}.`
  }

  private matchingConfiguredTeams(normalizedTranscript: string): TeamId[] {
    if (!this.configuration) return []
    return (['A', 'B'] as const).filter((team) => {
      const configuredTeam =
        team === 'A' ? this.configuration?.teamA : this.configuration?.teamB
      return [configuredTeam?.displayName, configuredTeam?.voiceName].some(
        (name) => normalizeSpeech(name ?? '') === normalizedTranscript,
      )
    })
  }

  private traceVoice(event: Omit<VoiceTraceEvent, 'at'>): void {
    this.voiceTrace = [...this.voiceTrace, { ...event, at: this.now() }].slice(
      -100,
    )
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
