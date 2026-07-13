export interface ContinuousListeningSnapshot {
  shouldListen: boolean
  recognitionRunning: boolean
  startPending: boolean
  restartPending: boolean
  suspended: boolean
  consecutiveFailures: number
}

type RestartTechnicalSession = () => void

const RESTART_DELAYS_MS = [250, 500, 1_000, 2_000] as const

export class ContinuousListeningManager {
  private shouldListen = false
  private recognitionRunning = false
  private startPending = false
  private restartPending = false
  private suspended = false
  private consecutiveFailures = 0
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(private readonly restart: RestartTechnicalSession) {}

  getSnapshot(): ContinuousListeningSnapshot {
    return {
      shouldListen: this.shouldListen,
      recognitionRunning: this.recognitionRunning,
      startPending: this.startPending,
      restartPending: this.restartPending,
      suspended: this.suspended,
      consecutiveFailures: this.consecutiveFailures,
    }
  }

  startFunctionalListening(): void {
    if (this.disposed) return
    this.shouldListen = true
    this.suspended = false
  }

  stopFunctionalListening(): void {
    this.shouldListen = false
    this.suspended = false
    this.recognitionRunning = false
    this.startPending = false
    this.consecutiveFailures = 0
    this.clearRestart()
  }

  suspendTechnicalListening(): void {
    this.suspended = true
    this.recognitionRunning = false
    this.startPending = false
    this.clearRestart()
  }

  resumeTechnicalListening(): void {
    if (!this.shouldListen || this.disposed) return
    this.suspended = false
  }

  beginTechnicalStart(): boolean {
    if (
      this.disposed ||
      !this.shouldListen ||
      this.suspended ||
      this.recognitionRunning ||
      this.startPending
    ) {
      return false
    }
    this.startPending = true
    return true
  }

  handleTechnicalStarted(): void {
    if (this.disposed || !this.shouldListen || this.suspended) return
    this.startPending = false
    this.recognitionRunning = true
    this.clearRestart()
  }

  handleTechnicalEnded(): void {
    this.recognitionRunning = false
    this.startPending = false
    if (!this.shouldListen || this.suspended || this.disposed) return
    this.scheduleRestart()
  }

  recordRecoverableFailure(): void {
    this.consecutiveFailures += 1
  }

  recordSuccessfulRecognition(): void {
    this.consecutiveFailures = 0
  }

  dispose(): void {
    this.disposed = true
    this.stopFunctionalListening()
  }

  private scheduleRestart(): void {
    if (this.restartPending || this.restartTimer !== null) return
    const delayIndex = Math.min(
      this.consecutiveFailures,
      RESTART_DELAYS_MS.length - 1,
    )
    this.restartPending = true
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.restartPending = false
      if (!this.shouldListen || this.suspended || this.disposed) return
      this.restart()
    }, RESTART_DELAYS_MS[delayIndex])
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.restartPending = false
  }
}
