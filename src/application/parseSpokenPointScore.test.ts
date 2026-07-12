import { describe, expect, it } from 'vitest'
import { parseSpokenPointScore } from './parseSpokenPointScore'

const teams = { A: 'Champions', B: 'Baltringues' }

describe('parseSpokenPointScore', () => {
  it.each([
    ['15 partout', 1, 1],
    ['30, 30', 2, 2],
    ['30 15', 2, 1],
    ['15-30', 1, 2],
    ['quarante partout', 3, 3],
    ['égalité', 3, 3],
    ['zéro quinze', 0, 1],
  ])('parse « %s »', (transcript, pointsA, pointsB) => {
    expect(parseSpokenPointScore(transcript, teams, false)).toMatchObject({
      ok: true,
      pointsA,
      pointsB,
    })
  })

  it('parse avantage équipe A', () => {
    expect(
      parseSpokenPointScore('avantage équipe A', teams, false),
    ).toMatchObject({ ok: true, pointsA: 4, pointsB: 3 })
  })

  it('parse avantage équipe B', () => {
    expect(
      parseSpokenPointScore('avantage équipe B', teams, false),
    ).toMatchObject({ ok: true, pointsA: 3, pointsB: 4 })
  })

  it('parse un avantage avec le nom réel de l’équipe', () => {
    expect(
      parseSpokenPointScore('avantage Champions', teams, false),
    ).toMatchObject({ ok: true, pointsA: 4, pointsB: 3 })
  })

  it('rejette une formulation inconnue', () => {
    expect(parseSpokenPointScore('un autre score', teams, false)).toEqual({
      ok: false,
      reason: 'Score de points non reconnu.',
    })
  })

  it('parse les points numériques d’un tie-break', () => {
    expect(parseSpokenPointScore('8 7', teams, true)).toMatchObject({
      ok: true,
      pointsA: 8,
      pointsB: 7,
    })
  })
})
