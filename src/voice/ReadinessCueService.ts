import type { ReadinessCueAdapter } from './speechTypes'

export const READINESS_BEEP_DURATION_MS = 45

export class ReadinessCueService implements ReadinessCueAdapter {
  private audioContext: AudioContext | null = null

  prepare(): void {
    if (
      typeof window !== 'undefined' &&
      window.AudioContext &&
      !this.audioContext
    ) {
      this.audioContext = new AudioContext()
    }
  }

  async play(): Promise<void> {
    if (typeof window === 'undefined' || !window.AudioContext) {
      throw new Error('Bip de disponibilité indisponible dans ce navigateur.')
    }
    const context = this.audioContext ?? new AudioContext()
    this.audioContext = context
    if (context.state === 'suspended') await context.resume()

    await new Promise<void>((resolve) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      const end = now + READINESS_BEEP_DURATION_MS / 1000
      oscillator.frequency.value = 1040
      gain.gain.setValueAtTime(0.07, now)
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

  dispose(): void {
    if (this.audioContext) void this.audioContext.close()
    this.audioContext = null
  }
}
