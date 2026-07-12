import { ScoreEngine } from '../core/ScoreEngine'
import type {
  DisplayState,
  MatchState,
  TeamId,
  TeamNames,
} from '../core/matchTypes'
import { resolveVoiceCommand } from '../voice/commandAliases'
import { normalizeSpeech, validateTeamNames } from '../voice/normalizeSpeech'
import type {
  RecognitionAdapter,
  RecognitionHandlers,
  RecognitionResultDiagnostics,
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

export type MatchPhase = 'setup' | 'match' | 'correction' | 'finished'
export type MicrophoneStatus =
  'inactive' | 'listening' | 'speaking' | 'disabled' | 'unavailable' | 'error'
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
}

export interface StartMatchOptions {
  teamNames: TeamNames
  servingTeam: TeamId
}

type Listener = (snapshot: MatchControllerSnapshot) => void

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
  private correctionTimeout: ReturnType<typeof setTimeout> | null = null
  private listeningWanted = false
  private isSpeaking = false
  private disposed = false
  private readonly listeners = new Set<Listener>()

  constructor(
    private readonly recognition: RecognitionAdapter,
    private readonly synthesis: SynthesisAdapter,
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
    }
  }

  subscribe(listener: Listener): () => void {
    this.disposed = false
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  startMatch(options: StartMatchOptions): boolean {
    const validationError = validateTeamNames(
      options.teamNames.A,
      options.teamNames.B,
    )
    if (validationError) {
      this.message = validationError
      this.emit()
      return false
    }

    this.engine = new ScoreEngine({
      teamNames: {
        A: options.teamNames.A.trim(),
        B: options.teamNames.B.trim(),
      },
      servingTeam: options.servingTeam,
    })
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
    this.listeningWanted = this.recognition.isSupported

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

  async handleTranscript(result: SpeechTranscript): Promise<void> {
    if (this.phase === 'setup' || this.phase === 'finished') return
    this.lastTranscript = result.transcript
    const normalized = normalizeSpeech(result.transcript)
    this.normalizedTranscript = normalized
    this.interpretation = ''
    this.rejectionReason = ''
    this.extractedContent = ''
    this.correctionResult = ''
    this.extractedContent = ''
    this.correctionResult = ''

    const usableConfidence = usableRecognitionConfidence(result.confidence)
    if (
      usableConfidence !== undefined &&
      usableConfidence < MINIMUM_RECOGNITION_CONFIDENCE
    ) {
      if (this.phase === 'correction') {
        await this.rejectPointCorrection('Confiance insuffisante.')
        return
      }
      this.lastCommand = 'Transcription ignorée'
      this.message = `Confiance insuffisante (${Math.round(usableConfidence * 100)} %).`
      this.emit()
      return
    }

    if (this.phase === 'correction') {
      await this.handlePointCorrection(result.transcript, normalized)
      return
    }

    const state = this.engine.getState()
    const normalizedA = normalizeSpeech(state.teams.A)
    const normalizedB = normalizeSpeech(state.teams.B)

    if (normalized === normalizedA) {
      this.lastCommand = `Point ${state.teams.A}`
      await this.awardPoint('A')
      return
    }
    if (normalized === normalizedB) {
      this.lastCommand = `Point ${state.teams.B}`
      await this.awardPoint('B')
      return
    }

    const command = resolveVoiceCommand(normalized)
    switch (command?.type) {
      case 'SCORE':
        this.lastCommand = 'Score'
        this.interpretation = 'score court'
        await this.announcePointScore()
        return
      case 'FULL_SCORE':
        this.lastCommand = 'Score complet'
        this.interpretation = 'score complet'
        await this.announceFullScore()
        return
      case 'UNDO':
        this.lastCommand = 'Annule'
        await this.undo()
        return
      case 'START_CORRECTION':
        this.lastCommand = 'START_CORRECTION'
        this.interpretation = 'mode guidé'
        await this.enterCorrection()
        return
      case 'CORRECT_POINTS_INLINE':
        this.lastCommand = 'CORRECT_POINTS_INLINE'
        this.extractedContent = command.spokenScore
        await this.applySpokenPointCorrection(
          command.spokenScore,
          'CORRECT_POINTS_INLINE',
        )
        return
      case 'STOP_LISTENING':
        this.lastCommand = 'Termine écoute'
        this.disableListening()
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
    const next = snapshotOf(this.engine)
    this.message = ''

    if (next.match.winner) {
      this.phase = 'finished'
      this.listeningWanted = false
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

    if (this.phase === 'finished') {
      this.phase = 'match'
      this.listeningWanted = this.recognition.isSupported
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
    this.clearCorrectionTimeout()
    this.phase = 'correction'
    this.conversationStatus = 'En attente du nouveau score'
    this.interpretation = 'attente de correction des points'
    this.rejectionReason = ''
    this.message = 'Nouveau score ?'
    this.emit()
    await this.announce('Nouveau score ?')
    if (this.phase === 'correction') this.scheduleCorrectionTimeout()
  }

  cancelCorrection(): void {
    if (this.phase !== 'correction') return
    this.clearCorrectionTimeout()
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
      this.clearCorrectionTimeout()
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
    if (this.listeningWanted) this.disableListening()
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
    this.listeningWanted = true
    this.message = ''
    this.startRecognition()
  }

  disableListening(): void {
    this.listeningWanted = false
    this.recognition.stop()
    this.microphoneStatus = 'disabled'
    this.message = 'Écoute désactivée volontairement.'
    this.emit()
  }

  prepareNewMatch(): void {
    this.clearCorrectionTimeout()
    this.listeningWanted = false
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
    this.emit()
  }

  destroy(): void {
    this.clearCorrectionTimeout()
    this.disposed = true
    this.listeningWanted = false
    this.recognition.dispose()
    this.synthesis.cancel()
    this.listeners.clear()
  }

  private async handlePointCorrection(
    transcript: string,
    normalized: string,
  ): Promise<void> {
    const command = resolveVoiceCommand(normalized)
    if (command?.type === 'UNDO') {
      this.lastCommand = 'Annulation de la correction'
      this.cancelCorrection()
      await this.announce('Correction annulée')
      return
    }
    if (command) {
      await this.rejectPointCorrection(
        'Une commande réservée ne peut pas servir de nouveau score.',
      )
      return
    }

    await this.applySpokenPointCorrection(transcript)
  }

  private async applySpokenPointCorrection(
    transcript: string,
    commandLabel?: string,
  ): Promise<void> {
    const state = this.engine.getState()
    const parsed = parseSpokenPointScore(
      transcript,
      state.teams,
      state.isTieBreak,
    )
    if (!parsed.ok) {
      await this.rejectPointCorrection(parsed.reason, commandLabel)
      return
    }

    try {
      this.engine.correctPoints(parsed.pointsA, parsed.pointsB)
      this.clearCorrectionTimeout()
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
    this.clearCorrectionTimeout()
    this.conversationStatus = 'Score non compris'
    this.lastCommand = commandLabel ?? 'Score non compris'
    this.interpretation = ''
    this.rejectionReason = reason
    this.correctionResult = `rejet : ${reason}`
    this.message = 'Score non compris. Répétez ou annulez.'
    this.emit()
    await this.announce('Score non compris. Répétez ou annulez.')
    if (this.phase === 'correction') this.scheduleCorrectionTimeout()
  }

  private scheduleCorrectionTimeout(): void {
    this.clearCorrectionTimeout()
    this.correctionTimeout = setTimeout(() => {
      void this.expireCorrection()
    }, 10_000)
  }

  private clearCorrectionTimeout(): void {
    if (this.correctionTimeout === null) return
    clearTimeout(this.correctionTimeout)
    this.correctionTimeout = null
  }

  private async expireCorrection(): Promise<void> {
    this.correctionTimeout = null
    if (this.phase !== 'correction') return
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
    return this.phase === 'match' || this.phase === 'correction'
  }

  private recognitionHandlers(): RecognitionHandlers {
    return {
      onDiagnostic: (diagnostics) => {
        this.recognitionDiagnostics = { ...diagnostics }
        this.emit()
      },
      onResult: (result) => void this.handleTranscript(result),
      onError: (code, message) => {
        if (code === 'no-speech') {
          this.message = message
        } else {
          this.microphoneStatus = 'error'
          this.message = message
        }
        this.emit()
      },
      onEnd: () => {
        if (
          !this.disposed &&
          this.listeningWanted &&
          !this.isSpeaking &&
          this.isListeningPhase()
        ) {
          this.startRecognition()
        } else if (!this.isSpeaking && this.microphoneStatus !== 'disabled') {
          this.microphoneStatus = this.recognition.isSupported
            ? 'inactive'
            : 'unavailable'
          this.emit()
        }
      },
    }
  }

  private startRecognition(): void {
    if (
      this.disposed ||
      !this.listeningWanted ||
      this.isSpeaking ||
      !this.isListeningPhase()
    ) {
      return
    }
    this.microphoneStatus = 'listening'
    this.recognition.start(this.recognitionHandlers())
    this.emit()
  }

  private async announce(text: string): Promise<void> {
    this.isSpeaking = true
    this.microphoneStatus = 'speaking'
    this.recognition.stop()
    this.emit()

    try {
      if (!this.synthesis.isSupported) {
        throw new Error('Synthèse vocale indisponible dans ce navigateur.')
      }
      await this.synthesis.speak(text)
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : 'Erreur de synthèse vocale.'
    } finally {
      this.isSpeaking = false
      if (
        this.listeningWanted &&
        this.isListeningPhase() &&
        this.recognition.isSupported
      ) {
        this.startRecognition()
      } else {
        this.microphoneStatus = this.recognition.isSupported
          ? this.listeningWanted
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
