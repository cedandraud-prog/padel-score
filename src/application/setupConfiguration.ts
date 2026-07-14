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
  customDisplayName: boolean
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
  'teamA.player1',
  'teamA.player2',
  'teamA.voiceName',
  'teamB.player1',
  'teamB.player2',
  'teamB.voiceName',
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
      displayName: 'Équipe 1',
      customDisplayName: false,
      voiceName: 'Gagné',
      players: [
        { id: 'A1', name: '', side: 'LEFT' },
        { id: 'A2', name: '', side: 'RIGHT' },
      ],
    },
    teamB: {
      displayName: 'Équipe 2',
      customDisplayName: false,
      voiceName: 'Perdu',
      players: [
        { id: 'B1', name: '', side: 'LEFT' },
        { id: 'B2', name: '', side: 'RIGHT' },
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
  const teamAPlayers = [
    participant('A1'),
    participant('A2'),
  ] as PlayerPlusTeamDraft['players']
  const teamBPlayers = [
    participant('B1'),
    participant('B2'),
  ] as PlayerPlusTeamDraft['players']
  return {
    mode: 'PLAYERS_PLUS',
    teamA: {
      ...configuration.teamA,
      customDisplayName:
        configuration.teamA.displayName !==
        automaticTeamName(teamAPlayers, 'Équipe 1'),
      players: teamAPlayers,
    },
    teamB: {
      ...configuration.teamB,
      customDisplayName:
        configuration.teamB.displayName !==
        automaticTeamName(teamBPlayers, 'Équipe 2'),
      players: teamBPlayers,
    },
    servingPlayerId: configuration.firstServer,
  }
}

export function isPlayerConfigurationReady(
  configuration: PlayerMatchConfiguration,
): boolean {
  return validatePlayerSetup(configuration) === null
}

export function validatePlayerSetup(
  configuration: PlayerMatchConfiguration,
): string | null {
  const voiceErrorA = validateVoiceName(configuration.teamA.voiceName)
  if (voiceErrorA) return voiceErrorA
  const voiceErrorB = validateVoiceName(configuration.teamB.voiceName)
  if (voiceErrorB) return voiceErrorB
  return normalizeSpeech(configuration.teamA.voiceName) ===
    normalizeSpeech(configuration.teamB.voiceName)
    ? 'Les commandes de point doivent être différentes.'
    : null
}

export function toPlayerMatchConfiguration(
  draft: PlayerMatchConfiguration,
  servingTeam: 'A' | 'B',
): PlayerMatchConfiguration {
  return {
    mode: 'PLAYER',
    teamA: {
      displayName: draft.teamA.displayName.trim() || 'Équipe 1',
      voiceName: draft.teamA.voiceName.trim(),
    },
    teamB: {
      displayName: draft.teamB.displayName.trim() || 'Équipe 2',
      voiceName: draft.teamB.voiceName.trim(),
    },
    servingTeam,
  }
}

export function toPlayerPlusMatchConfiguration(
  draft: PlayerPlusConfigurationDraft,
  firstServer: PlayerId | '' = draft.servingPlayerId,
): PlayerPlusConfigurationResult {
  if (!firstServer) {
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
    firstServer,
  }
  const validationError = validateMatchConfiguration(configuration)
  return validationError
    ? { ok: false, reason: validationError }
    : { ok: true, configuration }
}

export function isPlayerPlusConfigurationReady(
  draft: PlayerPlusConfigurationDraft,
): boolean {
  return validatePlayerPlusSetup(draft) === null
}

export function validatePlayerPlusSetup(
  draft: PlayerPlusConfigurationDraft,
): string | null {
  for (const player of [...draft.teamA.players, ...draft.teamB.players]) {
    if (!player.name.trim()) return 'Les quatre prénoms sont obligatoires.'
  }
  const voiceErrorA = validateVoiceName(draft.teamA.voiceName)
  if (voiceErrorA) return voiceErrorA
  const voiceErrorB = validateVoiceName(draft.teamB.voiceName)
  if (voiceErrorB) return voiceErrorB
  if (
    normalizeSpeech(draft.teamA.voiceName) ===
    normalizeSpeech(draft.teamB.voiceName)
  ) {
    return 'Les commandes de point doivent être différentes.'
  }
  return null
}

export function automaticTeamName(
  players: readonly PlayerPlusPlayerDraft[],
  fallback: string,
): string {
  const names = players.map(({ name }) => name.trim()).filter(Boolean)
  return names.length === 0 ? fallback : names.join(' et ')
}

export function updatePlayerName(
  configuration: PlayerPlusConfigurationDraft,
  playerId: PlayerId,
  name: string,
): PlayerPlusConfigurationDraft {
  const teamKey = playerId.startsWith('A') ? 'teamA' : 'teamB'
  const teamNumber = teamKey === 'teamA' ? 1 : 2
  const team = configuration[teamKey]
  const players = team.players.map((player) =>
    player.id === playerId ? { ...player, name } : player,
  ) as PlayerPlusTeamDraft['players']
  return {
    ...configuration,
    [teamKey]: {
      ...team,
      players,
      displayName: team.customDisplayName
        ? team.displayName
        : automaticTeamName(players, `Équipe ${teamNumber}`),
    },
  }
}

export function renamePlayerPlusTeam(
  configuration: PlayerPlusConfigurationDraft,
  teamKey: 'teamA' | 'teamB',
  displayName: string,
): PlayerPlusConfigurationDraft {
  const teamNumber = teamKey === 'teamA' ? 1 : 2
  const team = configuration[teamKey]
  const value = displayName.trim()
  return {
    ...configuration,
    [teamKey]: {
      ...team,
      customDisplayName: Boolean(value),
      displayName:
        value || automaticTeamName(team.players, `Équipe ${teamNumber}`),
    },
  }
}

export function swapPlayers(
  configuration: PlayerPlusConfigurationDraft,
  firstId: PlayerId,
  secondId: PlayerId,
): PlayerPlusConfigurationDraft {
  if (firstId === secondId) {
    return copyPlayerPlusConfigurationDraft(configuration)
  }
  const players = [
    ...configuration.teamA.players,
    ...configuration.teamB.players,
  ]
  const first = players.find(({ id }) => id === firstId)
  const second = players.find(({ id }) => id === secondId)
  if (!first || !second) {
    return copyPlayerPlusConfigurationDraft(configuration)
  }
  return updatePlayerName(
    updatePlayerName(configuration, firstId, second.name),
    secondId,
    first.name,
  )
}

export function playerConfigurationHasData(
  configuration: PlayerMatchConfiguration,
): boolean {
  const defaults = createDefaultMatchConfiguration()
  return (
    configuration.teamA.displayName !== defaults.teamA.displayName ||
    configuration.teamA.voiceName !== defaults.teamA.voiceName ||
    configuration.teamB.displayName !== defaults.teamB.displayName ||
    configuration.teamB.voiceName !== defaults.teamB.voiceName ||
    configuration.servingTeam !== defaults.servingTeam
  )
}

export function playerPlusConfigurationHasData(
  configuration: PlayerPlusConfigurationDraft,
): boolean {
  const defaults = createPlayerPlusConfigurationDraft()
  return (
    configuration.teamA.displayName !== defaults.teamA.displayName ||
    configuration.teamA.voiceName !== defaults.teamA.voiceName ||
    configuration.teamB.displayName !== defaults.teamB.displayName ||
    configuration.teamB.voiceName !== defaults.teamB.voiceName ||
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
  const [first, second] = configuration[teamKey].players
  return swapPlayers(configuration, first.id, second.id)
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
    return acceptedDictation(
      updatePlayerName(configuration, team.players[playerIndex].id, value),
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
