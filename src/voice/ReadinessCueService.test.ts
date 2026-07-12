import { describe, expect, it } from 'vitest'
import { READINESS_BEEP_DURATION_MS } from './ReadinessCueService'

describe('ReadinessCueService', () => {
  it('utilise un bip de disponibilité très court', () => {
    expect(READINESS_BEEP_DURATION_MS).toBeGreaterThanOrEqual(30)
    expect(READINESS_BEEP_DURATION_MS).toBeLessThanOrEqual(60)
  })
})
