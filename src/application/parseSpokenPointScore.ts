import type { TeamNames } from '../core/matchTypes'
import { normalizeSpeech } from '../voice/normalizeSpeech'

export type PointCorrectionResult =
  | {
      ok: true
      pointsA: number
      pointsB: number
      interpretation: string
    }
  | { ok: false; reason: string }

const NORMAL_POINTS: Record<string, number> = {
  '0': 0,
  zero: 0,
  '15': 1,
  quinze: 1,
  '30': 2,
  trente: 2,
  '40': 3,
  quarante: 3,
}

const SPOKEN_NUMBERS: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  'dix sept': 17,
  'dix huit': 18,
  'dix neuf': 19,
  vingt: 20,
}

function parseTieBreakNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  return SPOKEN_NUMBERS[value] ?? null
}

function parsePair(
  normalized: string,
  values: Record<string, number>,
): [number, number] | null {
  if (normalized.endsWith(' partout')) {
    const value = normalized.slice(0, -' partout'.length)
    const parsed = values[value]
    return parsed === undefined ? null : [parsed, parsed]
  }

  const tokens = normalized.split(' ')
  if (tokens.length !== 2) return null
  const first = values[tokens[0]]
  const second = values[tokens[1]]
  return first === undefined || second === undefined ? null : [first, second]
}

function parseTieBreakPair(normalized: string): [number, number] | null {
  if (normalized.endsWith(' partout')) {
    const value = normalized.slice(0, -' partout'.length)
    const parsed = parseTieBreakNumber(value)
    return parsed === null ? null : [parsed, parsed]
  }

  const tokens = normalized.split(' ')
  if (tokens.length !== 2) return null
  const first = parseTieBreakNumber(tokens[0])
  const second = parseTieBreakNumber(tokens[1])
  return first === null || second === null ? null : [first, second]
}

export function parseSpokenPointScore(
  transcript: string,
  teamNames: TeamNames,
  isTieBreak: boolean,
): PointCorrectionResult {
  const normalized = normalizeSpeech(transcript)
  if (!normalized) return { ok: false, reason: 'Transcription vide.' }

  if (isTieBreak) {
    const pair = parseTieBreakPair(normalized)
    return pair
      ? {
          ok: true,
          pointsA: pair[0],
          pointsB: pair[1],
          interpretation: `tie-break ${pair[0]}-${pair[1]}`,
        }
      : { ok: false, reason: 'Score de tie-break non reconnu.' }
  }

  if (normalized === 'egalite') {
    return { ok: true, pointsA: 3, pointsB: 3, interpretation: 'égalité' }
  }

  if (normalized.startsWith('avantage ')) {
    const target = normalized.slice('avantage '.length)
    const normalizedA = normalizeSpeech(teamNames.A)
    const normalizedB = normalizeSpeech(teamNames.B)
    if (target === 'equipe a' || target === normalizedA) {
      return {
        ok: true,
        pointsA: 4,
        pointsB: 3,
        interpretation: `avantage ${teamNames.A}`,
      }
    }
    if (target === 'equipe b' || target === normalizedB) {
      return {
        ok: true,
        pointsA: 3,
        pointsB: 4,
        interpretation: `avantage ${teamNames.B}`,
      }
    }
    return { ok: false, reason: 'Équipe en avantage non reconnue.' }
  }

  const pair = parsePair(normalized, NORMAL_POINTS)
  return pair
    ? {
        ok: true,
        pointsA: pair[0],
        pointsB: pair[1],
        interpretation: `points ${pair[0]}-${pair[1]}`,
      }
    : { ok: false, reason: 'Score de points non reconnu.' }
}
