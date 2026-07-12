export type GameSessionState = 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED'

export interface GameSessionSnapshot {
  state: GameSessionState
  isFinishConfirmationPending: boolean
}

export class GameSession {
  private state: GameSessionState = 'NOT_STARTED'
  private finishConfirmationPending = false

  getSnapshot(): GameSessionSnapshot {
    return {
      state: this.state,
      isFinishConfirmationPending: this.finishConfirmationPending,
    }
  }

  start(): void {
    if (this.state !== 'NOT_STARTED') {
      throw new Error('La session a déjà démarré.')
    }
    this.state = 'IN_PROGRESS'
  }

  requestFinish(): boolean {
    if (this.state !== 'IN_PROGRESS') return false
    this.finishConfirmationPending = true
    return true
  }

  confirmFinish(): boolean {
    if (this.state !== 'IN_PROGRESS' || !this.finishConfirmationPending) {
      return false
    }
    this.finishConfirmationPending = false
    this.state = 'FINISHED'
    return true
  }

  cancelFinish(): boolean {
    if (!this.finishConfirmationPending) return false
    this.finishConfirmationPending = false
    return true
  }

  reset(): void {
    this.state = 'NOT_STARTED'
    this.finishConfirmationPending = false
  }
}
