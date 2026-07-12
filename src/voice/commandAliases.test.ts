import { describe, expect, it } from 'vitest'
import { normalizeSpeech } from './normalizeSpeech'
import { resolveVoiceCommand } from './commandAliases'

describe('resolveVoiceCommand', () => {
  it.each(['Corrige', 'Corriger', 'Corrigé', 'Corrigez'])(
    'interprète « %s » comme un démarrage de correction',
    (transcript) => {
      expect(resolveVoiceCommand(normalizeSpeech(transcript))).toEqual({
        type: 'START_CORRECTION',
      })
    },
  )

  it.each([
    ['Corrige 30 30', '30 30'],
    ['Corrigé, 30, 30', '30 30'],
    ['Corriger 15 partout', '15 partout'],
    ['Corrigez 40 30', '40 30'],
  ])('extrait la charge utile de « %s »', (transcript, spokenScore) => {
    expect(resolveVoiceCommand(normalizeSpeech(transcript))).toEqual({
      type: 'CORRECT_POINTS_INLINE',
      spokenScore,
    })
  })

  it('rejette une phrase où corrige n’est pas au début', () => {
    expect(
      resolveVoiceCommand(normalizeSpeech('demain corrige 30 30')),
    ).toBeNull()
  })
})
