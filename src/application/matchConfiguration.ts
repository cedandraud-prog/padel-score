import type { TeamId } from '../core/matchTypes'
import { ALL_COMMAND_ALIASES } from '../voice/commandAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'

export interface ConfiguredTeam {
  displayName: string
  voiceName: string
}

export interface MatchConfiguration {
  teamA: ConfiguredTeam
  teamB: ConfiguredTeam
  servingTeam: TeamId
}

const SETUP_COMMANDS = ['demarrer', 'recommencer'] as const
const RESERVED_VOICE_NAMES = new Set([
  ...ALL_COMMAND_ALIASES,
  ...SETUP_COMMANDS,
])
const MAX_VOICE_NAME_WORDS = 3

export function createDefaultMatchConfiguration(): MatchConfiguration {
  return {
    teamA: { displayName: 'Équipe A', voiceName: '' },
    teamB: { displayName: 'Équipe B', voiceName: '' },
    servingTeam: 'A',
  }
}

export function validateDisplayName(value: string): string | null {
  return value.trim() ? null : 'Le nom affiché est obligatoire.'
}

export function validateVoiceName(value: string): string | null {
  const normalized = normalizeSpeech(value)
  if (!normalized) return 'La consigne vocale est obligatoire.'
  if (normalized.split(' ').length > MAX_VOICE_NAME_WORDS) {
    return `La consigne vocale doit contenir au maximum ${MAX_VOICE_NAME_WORDS} mots.`
  }
  if (RESERVED_VOICE_NAMES.has(normalized)) {
    return 'Cette consigne vocale est une commande réservée.'
  }
  return null
}

export function validateMatchConfiguration(
  configuration: MatchConfiguration,
): string | null {
  const displayErrorA = validateDisplayName(configuration.teamA.displayName)
  if (displayErrorA) return displayErrorA
  const voiceErrorA = validateVoiceName(configuration.teamA.voiceName)
  if (voiceErrorA) return voiceErrorA
  const displayErrorB = validateDisplayName(configuration.teamB.displayName)
  if (displayErrorB) return displayErrorB
  const voiceErrorB = validateVoiceName(configuration.teamB.voiceName)
  if (voiceErrorB) return voiceErrorB
  if (
    normalizeSpeech(configuration.teamA.voiceName) ===
    normalizeSpeech(configuration.teamB.voiceName)
  ) {
    return 'Les consignes vocales doivent être différentes.'
  }
  return null
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
