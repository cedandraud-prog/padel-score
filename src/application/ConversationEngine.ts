export type ConversationMode = 'MATCH' | 'GUIDED'

export type ConversationState =
  | 'IDLE'
  | 'SYSTEM_TURN'
  | 'STARTING_LISTENING'
  | 'PLAYER_READY'
  | 'PLAYER_LISTENING'
  | 'PROCESSING'
  | 'ERROR'
  | 'TIMEOUT'

export type ConversationIntent =
  | { type: 'StartRecognition' }
  | { type: 'StopRecognition' }
  | { type: 'PlayReadyBeep' }
  | { type: 'Speak'; text: string }
  | { type: 'EnterGuidedMode' }
  | { type: 'ExitGuidedMode' }
  | { type: 'ExecuteCommand'; transcript: string }
  | { type: 'UpdateUIState'; state: ConversationState }
  | { type: 'Timeout' }

export interface ConversationSnapshot {
  mode: ConversationMode
  state: ConversationState
  isRunning: boolean
  expectsResponse: boolean
}

type IntentListener = (intent: ConversationIntent) => void

export class ConversationEngine {
  private mode: ConversationMode = 'MATCH'
  private state: ConversationState = 'IDLE'
  private running = false
  private expectsResponse = false
  private timeout: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onIntent: IntentListener = () => {}) {}

  getSnapshot(): ConversationSnapshot {
    return {
      mode: this.mode,
      state: this.state,
      isRunning: this.running,
      expectsResponse: this.expectsResponse,
    }
  }

  start(): ConversationIntent[] {
    this.running = true
    this.state = 'STARTING_LISTENING'
    return this.emitMany([
      { type: 'StartRecognition' },
      { type: 'UpdateUIState', state: this.state },
    ])
  }

  stop(): ConversationIntent[] {
    this.clearTimeout()
    this.running = false
    this.expectsResponse = false
    this.state = 'IDLE'
    return this.emitMany([
      { type: 'StopRecognition' },
      { type: 'UpdateUIState', state: this.state },
    ])
  }

  enterGuidedMode(timeoutMs?: number): ConversationIntent[] {
    this.mode = 'GUIDED'
    if (timeoutMs !== undefined) this.scheduleTimeout(timeoutMs)
    return this.emitMany([{ type: 'EnterGuidedMode' }])
  }

  exitGuidedMode(): ConversationIntent[] {
    this.clearTimeout()
    this.mode = 'MATCH'
    return this.emitMany([{ type: 'ExitGuidedMode' }])
  }

  beginAnnouncement(
    text: string,
    expectsResponse = false,
  ): ConversationIntent[] {
    this.expectsResponse = expectsResponse
    this.state = 'SYSTEM_TURN'
    return this.emitMany([
      { type: 'StopRecognition' },
      { type: 'UpdateUIState', state: this.state },
      { type: 'Speak', text },
    ])
  }

  handleAnnouncementFinished(): ConversationIntent[] {
    if (!this.running) return []
    this.state = 'STARTING_LISTENING'
    return this.emitMany([
      { type: 'StartRecognition' },
      { type: 'UpdateUIState', state: this.state },
    ])
  }

  handleSpeechStarted(): ConversationIntent[] {
    if (!this.running || this.state === 'SYSTEM_TURN') {
      return this.emitMany([{ type: 'StopRecognition' }])
    }
    this.state = 'PLAYER_LISTENING'
    const intents: ConversationIntent[] = [
      { type: 'UpdateUIState', state: this.state },
    ]
    if (this.expectsResponse) intents.push({ type: 'PlayReadyBeep' })
    return this.emitMany(intents)
  }

  handleReadyBeepFinished(): ConversationIntent[] {
    this.expectsResponse = false
    this.state = 'PLAYER_LISTENING'
    return this.emitMany([{ type: 'UpdateUIState', state: this.state }])
  }

  handleSpeech(transcript: string): ConversationIntent[] {
    if (!this.running || this.state !== 'PLAYER_LISTENING') {
      return this.handleSpeechRejected()
    }
    this.state = 'PROCESSING'
    return this.emitMany([
      { type: 'UpdateUIState', state: this.state },
      { type: 'ExecuteCommand', transcript },
    ])
  }

  handleSpeechRejected(): ConversationIntent[] {
    this.state = 'ERROR'
    return this.emitMany([{ type: 'UpdateUIState', state: this.state }])
  }

  resumeListening(): ConversationIntent[] {
    if (!this.running) return []
    this.state = 'PLAYER_LISTENING'
    return this.emitMany([{ type: 'UpdateUIState', state: this.state }])
  }

  handleTimeout(): ConversationIntent[] {
    this.clearTimeout()
    this.state = 'TIMEOUT'
    return this.emitMany([
      { type: 'Timeout' },
      { type: 'UpdateUIState', state: this.state },
    ])
  }

  manualCancel(): ConversationIntent[] {
    const intents = this.exitGuidedMode()
    return [...intents, ...this.resumeListening()]
  }

  private scheduleTimeout(timeoutMs: number): void {
    this.clearTimeout()
    this.timeout = setTimeout(() => this.handleTimeout(), timeoutMs)
  }

  private clearTimeout(): void {
    if (this.timeout === null) return
    clearTimeout(this.timeout)
    this.timeout = null
  }

  private emitMany(intents: ConversationIntent[]): ConversationIntent[] {
    intents.forEach(this.onIntent)
    return intents
  }
}
