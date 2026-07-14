import type { TeamId } from './matchTypes'

export const PLAYER_IDS = ['A1', 'A2', 'B1', 'B2'] as const

export type PlayerId = (typeof PLAYER_IDS)[number]
export type PlayerSide = 'RIGHT' | 'LEFT'

export interface PlayerParticipant {
  id: PlayerId
  teamId: TeamId
  name: string
  side: PlayerSide
}

export type PlayerServiceOrder = readonly [
  PlayerId,
  PlayerId,
  PlayerId,
  PlayerId,
]

export interface PendingPlayerServiceOrder {
  readonly status: 'PENDING_SECOND_SERVER'
  readonly participants: readonly PlayerParticipant[]
  readonly firstServer: PlayerId
  readonly firstServingTeam: TeamId
}

export interface CompletePlayerServiceOrder {
  readonly status: 'COMPLETE'
  readonly participants: readonly PlayerParticipant[]
  readonly firstServer: PlayerId
  readonly secondServer: PlayerId
  readonly order: PlayerServiceOrder
}

export type ProgressivePlayerServiceOrder =
  PendingPlayerServiceOrder | CompletePlayerServiceOrder

export function isPlayerId(value: string): value is PlayerId {
  return (PLAYER_IDS as readonly string[]).includes(value)
}

export function playerTeam(playerId: PlayerId): TeamId {
  return playerId.startsWith('A') ? 'A' : 'B'
}

export function validatePlayerParticipants(
  participants: readonly PlayerParticipant[],
): string | null {
  if (participants.length !== PLAYER_IDS.length) {
    return 'PLAYER+ exige exactement quatre participants.'
  }

  if (participants.some(({ id }) => !isPlayerId(id))) {
    return 'Un identifiant de joueur n’est pas canonique.'
  }

  const playerIds = participants.map(({ id }) => id)
  if (new Set(playerIds).size !== PLAYER_IDS.length) {
    return 'Les identifiants des joueurs doivent être uniques.'
  }

  if (PLAYER_IDS.some((id) => !playerIds.includes(id))) {
    return 'Les quatre identifiants A1, A2, B1 et B2 sont obligatoires.'
  }

  if (participants.some(({ id, teamId }) => playerTeam(id) !== teamId)) {
    return 'Chaque joueur doit appartenir à l’équipe indiquée par son identifiant.'
  }

  if (participants.some(({ name }) => normalizeSpaces(name) === '')) {
    return 'Le nom de chaque joueur est obligatoire.'
  }

  for (const teamId of ['A', 'B'] as const) {
    const team = participants.filter((player) => player.teamId === teamId)
    if (team.length !== 2) {
      return 'Chaque équipe doit contenir exactement deux joueurs.'
    }
    const sides = new Set(team.map(({ side }) => side))
    if (!sides.has('RIGHT') || !sides.has('LEFT') || sides.size !== 2) {
      return 'Chaque équipe doit avoir un joueur à droite et un joueur à gauche.'
    }
  }

  return null
}

export function initializePlayerServiceOrder(
  participants: readonly PlayerParticipant[],
  firstServer: PlayerId,
): PendingPlayerServiceOrder {
  const frozenParticipants = validatedCopy(participants)
  const firstParticipant = findParticipant(frozenParticipants, firstServer)

  return Object.freeze({
    status: 'PENDING_SECOND_SERVER',
    participants: frozenParticipants,
    firstServer,
    firstServingTeam: firstParticipant.teamId,
  })
}

export function completePlayerServiceOrder(
  pending: PendingPlayerServiceOrder,
  secondServer: PlayerId,
): CompletePlayerServiceOrder {
  const participants = validatedCopy(pending.participants)
  const firstParticipant = findParticipant(participants, pending.firstServer)
  const secondParticipant = findParticipant(participants, secondServer)

  if (secondParticipant.teamId === firstParticipant.teamId) {
    throw new Error(
      'Le serveur du deuxième jeu doit appartenir à l’équipe adverse.',
    )
  }

  const firstPartner = findPartner(participants, firstParticipant)
  const secondPartner = findPartner(participants, secondParticipant)
  const order = Object.freeze([
    firstParticipant.id,
    secondParticipant.id,
    firstPartner.id,
    secondPartner.id,
  ]) as PlayerServiceOrder

  return Object.freeze({
    status: 'COMPLETE',
    participants,
    firstServer: firstParticipant.id,
    secondServer: secondParticipant.id,
    order,
  })
}

export function clonePendingPlayerServiceOrder(
  pending: PendingPlayerServiceOrder,
): PendingPlayerServiceOrder {
  return initializePlayerServiceOrder(pending.participants, pending.firstServer)
}

export function cloneCompletePlayerServiceOrder(
  complete: CompletePlayerServiceOrder,
): CompletePlayerServiceOrder {
  return completePlayerServiceOrder(
    initializePlayerServiceOrder(complete.participants, complete.order[0]),
    complete.order[1],
  )
}

export function playerServiceOrderIndex(index: number, offset = 0): number {
  if (!Number.isInteger(index) || !Number.isInteger(offset)) {
    throw new Error('La position de service doit être un entier.')
  }

  const orderLength = PLAYER_IDS.length
  return (((index + offset) % orderLength) + orderLength) % orderLength
}

export function tieBreakPlayerServiceOffset(pointsPlayed: number): number {
  if (!Number.isInteger(pointsPlayed) || pointsPlayed < 0) {
    throw new Error(
      'Le nombre de points joués au tie-break doit être un entier positif ou nul.',
    )
  }
  if (pointsPlayed === 0) return 0
  return 1 + Math.floor((pointsPlayed - 1) / 2)
}

export function reanchorPlayerServiceOrder(
  complete: CompletePlayerServiceOrder,
  currentOrderIndex: number,
  requestedServer: PlayerId,
): CompletePlayerServiceOrder {
  const currentIndex = playerServiceOrderIndex(currentOrderIndex)
  const currentServer = complete.order[currentIndex]

  findParticipant(complete.participants, requestedServer)
  if (playerTeam(requestedServer) !== playerTeam(currentServer)) {
    throw new Error(
      'Le serveur corrigé doit appartenir à l’équipe actuellement au service.',
    )
  }
  if (requestedServer === currentServer) return complete

  const requestedIndex = complete.order.indexOf(requestedServer)
  const correctedOrder = [...complete.order]
  correctedOrder[currentIndex] = requestedServer
  correctedOrder[requestedIndex] = currentServer

  return completePlayerServiceOrder(
    initializePlayerServiceOrder(complete.participants, correctedOrder[0]),
    correctedOrder[1],
  )
}

function validatedCopy(
  participants: readonly PlayerParticipant[],
): readonly PlayerParticipant[] {
  const error = validatePlayerParticipants(participants)
  if (error) throw new Error(error)
  return Object.freeze(
    participants.map((participant) => Object.freeze({ ...participant })),
  )
}

function findParticipant(
  participants: readonly PlayerParticipant[],
  playerId: PlayerId,
): PlayerParticipant {
  const participant = participants.find(({ id }) => id === playerId)
  if (!participant) {
    throw new Error('Le serveur doit appartenir aux participants du match.')
  }
  return participant
}

function findPartner(
  participants: readonly PlayerParticipant[],
  player: PlayerParticipant,
): PlayerParticipant {
  const partner = participants.find(
    ({ id, teamId }) => teamId === player.teamId && id !== player.id,
  )
  if (!partner) {
    throw new Error('Le partenaire du serveur est introuvable.')
  }
  return partner
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
