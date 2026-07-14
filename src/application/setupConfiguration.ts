import {
  createDefaultMatchConfiguration,
  type PlayerPlusMatchConfiguration,
  validateDisplayName,
  validateMatchConfiguration,
  validateVoiceName,
  type PlayerMatchConfiguration,
} from './matchConfiguration'
import { normalizeSpeech } from '../voice/normalizeSpeech'
import { matchesControlledResponse } from '../voice/controlledResponseAliases'
import type {
  PlayerId,
  PlayerParticipant,
  PlayerSide,
} from '../core/playerPlusService'

export type SetupMode = 'PLAYER' | 'PLAYERS_PLUS'
export type { PlayerSide } from '../core/playerPlusService'

export interface PlayerPlusPlayerDraft {
  id: PlayerId
  name: string
  side: PlayerSide
}

export interface PlayerPlusTeamDraft {
  displayName: string
  voiceName: string
  players: [PlayerPlusPlayerDraft, PlayerPlusPlayerDraft]
}

export interface PlayerPlusConfigurationDraft {
  mode: 'PLAYERS_PLUS'
  teamA: PlayerPlusTeamDraft
  teamB: PlayerPlusTeamDraft
  servingPlayerId: PlayerPlusPlayerDraft['id'] | ''
}

export type SetupDictationField =
  | 'teamA.displayName'
  | 'teamA.voiceName'
  | 'teamA.player1'
  | 'teamA.player2'
  | 'teamB.displayName'
  | 'teamB.voiceName'
  | 'teamB.player1'
  | 'teamB.player2'
  | 'servingPlayerId'

export interface SetupDictationResult {
  accepted: boolean
  draft: PlayerPlusConfigurationDraft
  normalizedTranscript: string
  modifiedField: SetupDictationField | null
  rejectionReason: string
  nextMissingField: SetupDictationField | null
  ambiguousPlayerIds?: readonly PlayerId[]
}

export type PlayerPlusConfigurationResult =
  | { ok: true; configuration: PlayerPlusMatchConfiguration }
  | { ok: false; reason: string }

export interface SetupDictationTrace {
  at: number
  attemptId: number
  targetedField: SetupDictationField
  stepBefore: SetupDictationField | null
  draftBefore: PlayerPlusConfigurationDraft
  rawTranscript: string
  normalizedTranscript: string
  modifiedField: SetupDictationField | null
  rejectionReason: string
  stepAfter: SetupDictationField | null
}

export const PLAYER_PLUS_SETUP_FIELDS: readonly SetupDictationField[] = [
  'teamA.displayName',
  'teamA.player1',
  'teamA.player2',
  'teamA.voiceName',
  'teamB.displayName',
  'teamB.player1',
  'teamB.player2',
  'teamB.voiceName',
  'servingPlayerId',
]

export const SETUP_FIELD_LABELS: Record<SetupDictationField, string> = {
  'teamA.displayName': 'nom de l’équipe A',
  'teamA.player1': 'joueur A1',
  'teamA.player2': 'joueur A2',
  'teamA.voiceName': 'consigne vocale A',
  'teamB.displayName': 'nom de l’équipe B',
  'teamB.player1': 'joueur B1',
  'teamB.player2': 'joueur B2',
  'teamB.voiceName': 'consigne vocale B',
  servingPlayerId: 'premier serveur',
}

export function createPlayerPlusConfigurationDraft(): PlayerPlusConfigurationDraft {
  return {
    mode: 'PLAYERS_PLUS',
    teamA: {
      displayName: '',
      voiceName: '',
      players: [
        { id: 'A1', name: '', side: 'RIGHT' },
        { id: 'A2', name: '', side: 'LEFT' },
      ],
    },
    teamB: {
      displayName: '',
      voiceName: '',
      players: [
        { id: 'B1', name: '', side: 'RIGHT' },
        { id: 'B2', name: '', side: 'LEFT' },
      ],
    },
    servingPlayerId: '',
  }
}

export function copyPlayerPlusConfigurationDraft(
  configuration: PlayerPlusConfigurationDraft,
): PlayerPlusConfigurationDraft {
  return {
    ...configuration,
    teamA: {
      ...configuration.teamA,
      players: configuration.teamA.players.map((player) => ({
        ...player,
      })) as PlayerPlusTeamDraft['players'],
    },
    teamB: {
      ...configuration.teamB,
      players: configuration.teamB.players.map((player) => ({
        ...player,
      })) as PlayerPlusTeamDraft['players'],
    },
  }
}

export function playerPlusConfigurationToDraft(
  configuration: PlayerPlusMatchConfiguration,
): PlayerPlusConfigurationDraft {
  const participant = (id: PlayerId) => {
    const found = configuration.participants.find((player) => player.id === id)
    if (!found) throw new Error(`Le participant ${id} est introuvable.`)
    return { id: found.id, name: found.name, side: found.side }
  }
  return {
    mode: 'PLAYERS_PLUS',
    teamA: {
      ...configuration.teamA,
      players: [participant('A1'), participant('A2')],
    },
    teamB: {
      ...configuration.teamB,
      players: [participant('B1'), participant('B2')],
    },
    servingPlayerId: configuration.firstServer,
  }
}

export function isPlayerConfigurationReady(
  configuration: PlayerMatchConfiguration,
): boolean {
  return validateMatchConfiguration(configuration) === null
}

export function toPlayerPlusMatchConfiguration(
  draft: PlayerPlusConfigurationDraft,
): PlayerPlusConfigurationResult {
  if (!draft.servingPlayerId) {
    return { ok: false, reason: 'Le premier serveur est obligatoire.' }
  }

  const participants: PlayerParticipant[] = [
    ...draft.teamA.players.map((player) => ({
      ...player,
      name: player.name.trim(),
      teamId: 'A' as const,
    })),
    ...draft.teamB.players.map((player) => ({
      ...player,
      name: player.name.trim(),
      teamId: 'B' as const,
    })),
  ]
  const configuration: PlayerPlusMatchConfiguration = {
    mode: 'PLAYERS_PLUS',
    teamA: {
      displayName: draft.teamA.displayName.trim(),
      voiceName: draft.teamA.voiceName.trim(),
    },
    teamB: {
      displayName: draft.teamB.displayName.trim(),
      voiceName: draft.teamB.voiceName.trim(),
    },
    participants,
    firstServer: draft.servingPlayerId,
  }
  const validationError = validateMatchConfiguration(configuration)
  return validationError
    ? { ok: false, reason: validationError }
    : { ok: true, configuration }
}

export function isPlayerPlusConfigurationReady(
  draft: PlayerPlusConfigurationDraft,
): boolean {
  return toPlayerPlusMatchConfiguration(draft).ok
}

export function playerConfigurationHasData(
  configuration: PlayerMatchConfiguration,
): boolean {
  const defaults = createDefaultMatchConfiguration()
  return (
    configuration.teamA.displayName !== defaults.teamA.displayName ||
    configuration.teamA.voiceName.trim() !== '' ||
    configuration.teamB.displayName !== defaults.teamB.displayName ||
    configuration.teamB.voiceName.trim() !== '' ||
    configuration.servingTeam !== defaults.servingTeam
  )
}

export function playerPlusConfigurationHasData(
  configuration: PlayerPlusConfigurationDraft,
): boolean {
  return (
    configuration.teamA.displayName.trim() !== '' ||
    configuration.teamA.voiceName.trim() !== '' ||
    configuration.teamB.displayName.trim() !== '' ||
    configuration.teamB.voiceName.trim() !== '' ||
    configuration.teamA.players.some(({ name }) => name.trim() !== '') ||
    configuration.teamB.players.some(({ name }) => name.trim() !== '') ||
    configuration.servingPlayerId !== ''
  )
}

export function setupModeHasData(
  mode: SetupMode,
  playerConfiguration: PlayerMatchConfiguration,
  playerPlusConfiguration: PlayerPlusConfigurationDraft,
): boolean {
  return mode === 'PLAYER'
    ? playerConfigurationHasData(playerConfiguration)
    : playerPlusConfigurationHasData(playerPlusConfiguration)
}

export function getNextMissingSetupField(
  configuration: PlayerPlusConfigurationDraft,
): SetupDictationField | null {
  return (
    PLAYER_PLUS_SETUP_FIELDS.find(
      (field) => validatePlayerPlusField(configuration, field) !== null,
    ) ?? null
  )
}

export function swapPlayerSides(
  configuration: PlayerPlusConfigurationDraft,
  team: 'A' | 'B',
): PlayerPlusConfigurationDraft {
  const teamKey = team === 'A' ? 'teamA' : 'teamB'
  const currentTeam = configuration[teamKey]
  return {
    ...configuration,
    [teamKey]: {
      ...currentTeam,
      players: [
        { ...currentTeam.players[0], side: currentTeam.players[1].side },
        { ...currentTeam.players[1], side: currentTeam.players[0].side },
      ],
    },
  }
}

export function applyPlayerPlusDictation(
  configuration: PlayerPlusConfigurationDraft,
  field: SetupDictationField,
  transcript: string,
  ambiguousPlayerIds: readonly PlayerId[] = [],
): SetupDictationResult {
  const value = transcript.trim()
  const normalizedTranscript = normalizeSpeech(transcript)
  if (!value) {
    return rejectedDictation(
      configuration,
      normalizedTranscript,
      'Aucune transcription exploitable reçue.',
    )
  }

  if (field === 'servingPlayerId') {
    const players = [
      ...configuration.teamA.players,
      ...configuration.teamB.players,
    ]
    if (ambiguousPlayerIds.length > 1) {
      const expectedSide = matchesControlledResponse(
        normalizedTranscript,
        'droite',
      )
        ? 'RIGHT'
        : matchesControlledResponse(normalizedTranscript, 'gauche')
          ? 'LEFT'
          : null
      const sideMatches = expectedSide
        ? players.filter(
            ({ id, side }) =>
              ambiguousPlayerIds.includes(id) && side === expectedSide,
          )
        : []
      if (sideMatches.length !== 1) {
        return {
          ...rejectedDictation(
            configuration,
            normalizedTranscript,
            'Réponse ambiguë : dites droite ou gauche.',
          ),
          ambiguousPlayerIds,
        }
      }
      return acceptedDictation(
        { ...configuration, servingPlayerId: sideMatches[0].id },
        field,
        normalizedTranscript,
      )
    }

    const matches = players.filter(
      ({ name }) => normalizeSpeech(name) === normalizedTranscript,
    )
    if (matches.length === 0) {
      return rejectedDictation(
        configuration,
        normalizedTranscript,
        'Le serveur doit correspondre exactement à un joueur renseigné.',
      )
    }
    if (matches.length > 1) {
      return {
        ...rejectedDictation(
          configuration,
          normalizedTranscript,
          'Plusieurs joueurs portent ce nom. Dites droite ou gauche.',
        ),
        ambiguousPlayerIds: matches.map(({ id }) => id),
      }
    }
    return acceptedDictation(
      { ...configuration, servingPlayerId: matches[0].id },
      field,
      normalizedTranscript,
    )
  }

  const [teamKey, property] = field.split('.') as [
    'teamA' | 'teamB',
    'displayName' | 'voiceName' | 'player1' | 'player2',
  ]
  const team = configuration[teamKey]
  if (property === 'player1' || property === 'player2') {
    const playerIndex = property === 'player1' ? 0 : 1
    const players = team.players.map((player, index) =>
      index === playerIndex ? { ...player, name: value } : player,
    ) as PlayerPlusTeamDraft['players']
    return acceptedDictation(
      { ...configuration, [teamKey]: { ...team, players } },
      field,
      normalizedTranscript,
    )
  }

  const updated = {
    ...configuration,
    [teamKey]: { ...team, [property]: value },
  }
  const validationError = validatePlayerPlusField(updated, field)
  return validationError
    ? rejectedDictation(configuration, normalizedTranscript, validationError)
    : acceptedDictation(updated, field, normalizedTranscript)
}

function validatePlayerPlusField(
  configuration: PlayerPlusConfigurationDraft,
  field: SetupDictationField,
): string | null {
  if (field === 'servingPlayerId') {
    const playerIds = [
      ...configuration.teamA.players,
      ...configuration.teamB.players,
    ].map(({ id }) => id)
    return configuration.servingPlayerId &&
      playerIds.includes(configuration.servingPlayerId)
      ? null
      : 'Le premier serveur est obligatoire.'
  }

  const [teamKey, property] = field.split('.') as [
    'teamA' | 'teamB',
    'displayName' | 'voiceName' | 'player1' | 'player2',
  ]
  const team = configuration[teamKey]
  if (property === 'displayName') return validateDisplayName(team.displayName)
  if (property === 'player1' || property === 'player2') {
    const playerIndex = property === 'player1' ? 0 : 1
    return team.players[playerIndex].name.trim()
      ? null
      : 'Le nom du joueur est obligatoire.'
  }

  const voiceError = validateVoiceName(team.voiceName)
  if (voiceError) return voiceError
  const otherTeam =
    teamKey === 'teamA' ? configuration.teamB : configuration.teamA
  return otherTeam.voiceName.trim() &&
    matchesControlledResponse(team.voiceName, otherTeam.voiceName)
    ? 'Les consignes vocales doivent être différentes.'
    : null
}

function acceptedDictation(
  configuration: PlayerPlusConfigurationDraft,
  field: SetupDictationField,
  normalizedTranscript: string,
): SetupDictationResult {
  return {
    accepted: true,
    draft: configuration,
    normalizedTranscript,
    modifiedField: field,
    rejectionReason: '',
    nextMissingField: getNextMissingSetupField(configuration),
  }
}

function rejectedDictation(
  configuration: PlayerPlusConfigurationDraft,
  normalizedTranscript: string,
  rejectionReason: string,
): SetupDictationResult {
  return {
    accepted: false,
    draft: configuration,
    normalizedTranscript,
    modifiedField: null,
    rejectionReason,
    nextMissingField: getNextMissingSetupField(configuration),
  }
}
