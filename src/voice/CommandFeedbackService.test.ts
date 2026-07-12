import { describe, expect, it } from 'vitest'
import type { SynthesisAdapter } from './speechTypes'
import {
  BEEP_DURATION_MS,
  CommandFeedbackService,
} from './CommandFeedbackService'

class SynthesisSpy implements SynthesisAdapter {
  readonly isSupported = true
  spoken: string[] = []

  async speak(text: string): Promise<void> {
    this.spoken.push(text)
  }

  cancel(): void {}
}

describe('CommandFeedbackService', () => {
  it('utilise un bip compris entre 30 et 60 ms', () => {
    expect(BEEP_DURATION_MS).toBeGreaterThanOrEqual(30)
    expect(BEEP_DURATION_MS).toBeLessThanOrEqual(60)
  })

  it('prononce uniquement OK en mode vocal', async () => {
    const synthesis = new SynthesisSpy()
    const service = new CommandFeedbackService(synthesis)

    await service.play('OK')

    expect(synthesis.spoken).toEqual(['OK'])
  })
})
