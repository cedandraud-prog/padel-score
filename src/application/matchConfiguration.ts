import type { TeamId } from '../core/matchTypes'
import { ALL_COMMAND_ALIASES } from '../voice/commandAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'

export interface TeamConfiguration {
  displayName: string
  voiceIdentifier: string
}

export interface MatchConfiguration {
  teamA: TeamConfiguration
  teamB: TeamConfiguration
  servingTeam: TeamId
}

export const DEFAULT_VOICE_IDENTIFIERS = { A: 'Alpha', B: 'Bravo' } as const

export function createDefaultMatchConfiguration(): MatchConfiguration {
  return {
    teamA: { displayName: 'Équipe A', voiceIdentifier: 'Alpha' },
    teamB: { displayName: 'Équipe B', voiceIdentifier: 'Bravo' },
    servingTeam: 'A',
  }
}

export const SETUP_COMMANDS = [
  'demarrer',
  'recommencer',
  'conserver',
  'nouveau match',
] as const

const RESERVED_IDENTIFIERS = new Set([
  ...ALL_COMMAND_ALIASES,
  ...SETUP_COMMANDS,
])

export function validateVoiceIdentifier(
  value: string,
  otherIdentifier: string,
  displayNames: readonly string[],
): string | null {
  const normalized = normalizeSpeech(value)
  if (!normalized) return 'L’identifiant vocal est obligatoire.'
  if (normalized.length > 40 || normalized.split(' ').length > 3) {
    return 'L’identifiant vocal doit être un mot ou une expression courte.'
  }
  if (RESERVED_IDENTIFIERS.has(normalized)) {
    return 'Cet identifiant vocal est une commande réservée.'
  }
  if (otherIdentifier && normalized === normalizeSpeech(otherIdentifier)) {
    return 'Les identifiants vocaux doivent être différents.'
  }
  if (
    displayNames.some(
      (displayName) => normalized === normalizeSpeech(displayName),
    )
  ) {
    return 'Cet identifiant vocal crée une ambiguïté avec un nom affiché.'
  }
  return null
}

export function validateMatchConfiguration(
  configuration: MatchConfiguration,
): string | null {
  const nameA = normalizeSpeech(configuration.teamA.displayName)
  const nameB = normalizeSpeech(configuration.teamB.displayName)
  if (!nameA || !nameB) return 'Les deux noms d’équipe sont obligatoires.'
  if (nameA === nameB) return 'Les noms d’équipe doivent être différents.'

  return (
    validateVoiceIdentifier(
      configuration.teamA.voiceIdentifier,
      configuration.teamB.voiceIdentifier,
      [configuration.teamB.displayName],
    ) ??
    validateVoiceIdentifier(
      configuration.teamB.voiceIdentifier,
      configuration.teamA.voiceIdentifier,
      [configuration.teamA.displayName],
    )
  )
}

export function copyMatchConfiguration(
  configuration: MatchConfiguration,
): MatchConfiguration {
  return {
    teamA: { ...configuration.teamA },
    teamB: { ...configuration.teamB },
    servingTeam: configuration.servingTeam,
  }
}
