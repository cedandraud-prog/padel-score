import type {
  CommandFeedbackAdapter,
  FeedbackMode,
  SynthesisAdapter,
} from './speechTypes'

export const BEEP_DURATION_MS = 45

export class CommandFeedbackService implements CommandFeedbackAdapter {
  private audioContext: AudioContext | null = null

  constructor(private readonly synthesis: SynthesisAdapter) {}

  prepare(mode: FeedbackMode): void {
    if (
      mode === 'BEEP' &&
      typeof window !== 'undefined' &&
      window.AudioContext &&
      !this.audioContext
    ) {
      this.audioContext = new AudioContext()
    }
  }

  async play(mode: Exclude<FeedbackMode, 'NONE'>): Promise<void> {
    if (mode === 'OK') {
      await this.synthesis.speak('OK')
      return
    }
    await this.beep()
  }

  dispose(): void {
    if (this.audioContext) void this.audioContext.close()
    this.audioContext = null
  }

  private async beep(): Promise<void> {
    if (typeof window === 'undefined' || !window.AudioContext) {
      throw new Error('Web Audio indisponible dans ce navigateur.')
    }

    const context = this.audioContext ?? new AudioContext()
    this.audioContext = context
    if (context.state === 'suspended') await context.resume()

    await new Promise<void>((resolve) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      const end = now + BEEP_DURATION_MS / 1000

      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, end)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
        resolve()
      }
      oscillator.start(now)
      oscillator.stop(end)
    })
  }
}
