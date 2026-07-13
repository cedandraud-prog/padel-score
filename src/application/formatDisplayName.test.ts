import { describe, expect, it } from 'vitest'
import { formatRecognizedDisplayName } from './formatDisplayName'

describe('formatRecognizedDisplayName', () => {
  it.each([
    ['cedric', 'Cedric'],
    ['jean pierre', 'Jean Pierre'],
    ['marie-claire', 'Marie-Claire'],
    ['élise', 'Élise'],
    ["d'artagnan", "D'Artagnan"],
    ['l’équipe première', 'L’Équipe Première'],
  ])('capitalise %s sans perdre ses séparateurs', (spoken, expected) => {
    expect(formatRecognizedDisplayName(spoken)).toBe(expected)
  })
})
