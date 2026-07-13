export type ExperienceStage = 'IDLE' | 'CONFIGURING' | 'PLAYING' | 'FINISHED'

export interface ExperienceSessionSnapshot {
  stage: ExperienceStage
  active: boolean
}

export class ExperienceSession {
  private stage: ExperienceStage = 'IDLE'

  getSnapshot(): ExperienceSessionSnapshot {
    return { stage: this.stage, active: this.isActive() }
  }

  beginConfiguration(): void {
    this.stage = 'CONFIGURING'
  }

  startMatch(): void {
    this.stage = 'PLAYING'
  }

  finishMatch(): void {
    this.stage = 'FINISHED'
  }

  returnHome(): void {
    this.stage = 'IDLE'
  }

  private isActive(): boolean {
    return this.stage === 'CONFIGURING' || this.stage === 'PLAYING'
  }
}
