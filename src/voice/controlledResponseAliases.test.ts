import { describe, expect, it } from 'vitest'
import {
  canonicalizeControlledResponse,
  matchesControlledResponse,
} from './controlledResponseAliases'

describe('alias de réponses vocales contrôlées', () => {
  it.each(['gagné', 'gagner', ' GAGNÉ ! '])(
    'canonicalise explicitement « %s »',
    (spokenValue) => {
      expect(canonicalizeControlledResponse(spokenValue)).toBe('gagne')
      expect(matchesControlledResponse(spokenValue, 'gagné')).toBe(true)
    },
  )

  it('conserve la comparaison exacte pour les valeurs sans alias', () => {
    expect(matchesControlledResponse('Champion', 'Champion')).toBe(true)
    expect(matchesControlledResponse('Champions', 'Champion')).toBe(false)
    expect(matchesControlledResponse('Bien Champion', 'Champion')).toBe(false)
  })
})
