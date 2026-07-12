import { describe, expect, it } from 'vitest'
import { WaitingVoiceEntry } from './WaitingVoiceEntry'

describe('WaitingVoiceEntry', () => {
  it('produit START_NEW_MATCH pour la commande exacte normalisée', () => {
    expect(new WaitingVoiceEntry().interpret(' Nouveau match ! ')).toEqual({
      type: 'START_NEW_MATCH',
      normalizedTranscript: 'nouveau match',
    })
  })

  it.each(['Bonjour', 'Je veux un nouveau match', 'Nouveau', 'Match'])(
    'ignore silencieusement « %s »',
    (transcript) => {
      expect(new WaitingVoiceEntry().interpret(transcript).type).toBe('IGNORED')
    },
  )
})
