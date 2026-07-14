import type { TeamId } from '../core/matchTypes'
import {
  validatePlayerParticipants,
  type PlayerId,
  type PlayerParticipant,
} from '../core/playerPlusService'
import { ALL_COMMAND_ALIASES } from '../voice/commandAliases'
import { normalizeSpeech } from '../voice/normalizeSpeech'

export interface ConfiguredTeam {
  displayName: string
  voiceName: string
}

export interface PlayerMatchConfiguration {
  mode: 'PLAYER'
  teamA: ConfiguredTeam
  teamB: ConfiguredTeam
  servingTeam: TeamId
}

export interface PlayerPlusMatchConfiguration {
  mode: 'PLAYERS_PLUS'
  teamA: ConfiguredTeam
  teamB: ConfiguredTeam
  participants: readonly PlayerParticipant[]
  firstServer: PlayerId
}

export type MatchConfiguration =
  PlayerMatchConfiguration | PlayerPlusMatchConfiguration

export type LegacyPlayerMatchConfiguration = Omit<
  PlayerMatchConfiguration,
  'mode'
> & { mode?: 'PLAYER' }

export type MatchConfigurationInput =
  MatchConfiguration | LegacyPlayerMatchConfiguration

const SETUP_COMMANDS = ['demarrer', 'recommencer'] as const
const RESERVED_VOICE_NAMES = new Set([
  ...ALL_COMMAND_ALIASES,
  ...SETUP_COMMANDS,
])
const MAX_VOICE_NAME_WORDS = 3

export function createDefaultMatchConfiguration(): PlayerMatchConfiguration {
  return {
    mode: 'PLAYER',
    teamA: { displayName: 'Équipe 1', voiceName: 'Gagné' },
    teamB: { displayName: 'Équipe 2', voiceName: 'Perdu' },
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
  configuration: MatchConfigurationInput,
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

  if (configuration.mode === 'PLAYERS_PLUS') {
    const participantError = validatePlayerParticipants(
      configuration.participants,
    )
    if (participantError) return participantError
    if (
      !configuration.participants.some(
        ({ id }) => id === configuration.firstServer,
      )
    ) {
      return 'Le premier serveur doit appartenir aux participants du match.'
    }
  }
  return null
}

export function canonicalizeMatchConfiguration(
  configuration: MatchConfigurationInput,
): MatchConfiguration {
  if (configuration.mode === 'PLAYERS_PLUS') {
    return {
      mode: 'PLAYERS_PLUS',
      teamA: { ...configuration.teamA },
      teamB: { ...configuration.teamB },
      participants: configuration.participants.map((participant) => ({
        ...participant,
      })),
      firstServer: configuration.firstServer,
    }
  }
  return {
    mode: 'PLAYER',
    teamA: { ...configuration.teamA },
    teamB: { ...configuration.teamB },
    servingTeam: configuration.servingTeam,
  }
}

export function copyMatchConfiguration(
  configuration: PlayerMatchConfiguration,
): PlayerMatchConfiguration
export function copyMatchConfiguration(
  configuration: PlayerPlusMatchConfiguration,
): PlayerPlusMatchConfiguration
export function copyMatchConfiguration(
  configuration: MatchConfiguration,
): MatchConfiguration
export function copyMatchConfiguration(
  configuration: MatchConfigurationInput,
): MatchConfiguration {
  return canonicalizeMatchConfiguration(configuration)
}
