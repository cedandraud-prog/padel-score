import { describe, expect, it } from 'vitest'
import {
  PLAYER_IDS,
  completePlayerServiceOrder,
  initializePlayerServiceOrder,
  isPlayerId,
  playerTeam,
  validatePlayerParticipants,
  type PlayerId,
  type PlayerParticipant,
  type PlayerServiceOrder,
} from './playerPlusService'

function participants(): PlayerParticipant[] {
  return [
    { id: 'A1', teamId: 'A', name: 'Alice', side: 'RIGHT' },
    { id: 'A2', teamId: 'A', name: 'Agathe', side: 'LEFT' },
    { id: 'B1', teamId: 'B', name: 'Bruno', side: 'RIGHT' },
    { id: 'B2', teamId: 'B', name: 'Basile', side: 'LEFT' },
  ]
}

const expectedOrders: readonly [PlayerId, PlayerId, PlayerServiceOrder][] = [
  ['A1', 'B1', ['A1', 'B1', 'A2', 'B2']],
  ['A1', 'B2', ['A1', 'B2', 'A2', 'B1']],
  ['A2', 'B1', ['A2', 'B1', 'A1', 'B2']],
  ['A2', 'B2', ['A2', 'B2', 'A1', 'B1']],
  ['B1', 'A1', ['B1', 'A1', 'B2', 'A2']],
  ['B1', 'A2', ['B1', 'A2', 'B2', 'A1']],
  ['B2', 'A1', ['B2', 'A1', 'B1', 'A2']],
  ['B2', 'A2', ['B2', 'A2', 'B1', 'A1']],
]

describe('contrat pur du service PLAYER+', () => {
  it('reconnaît uniquement les quatre identifiants canoniques', () => {
    expect(PLAYER_IDS).toEqual(['A1', 'A2', 'B1', 'B2'])
    for (const playerId of PLAYER_IDS) expect(isPlayerId(playerId)).toBe(true)
    expect(isPlayerId('A3')).toBe(false)
    expect(isPlayerId('Alice')).toBe(false)
  })

  it('refuse un participant absent, dupliqué ou non canonique', () => {
    expect(
      validatePlayerParticipants(participants().slice(0, 3)),
    ).not.toBeNull()

    const duplicated = participants()
    duplicated[3] = { ...duplicated[0] }
    expect(validatePlayerParticipants(duplicated)).toBe(
      'Les identifiants des joueurs doivent être uniques.',
    )

    const nonCanonical = participants()
    nonCanonical[3] = { ...nonCanonical[3], id: 'C1' as PlayerId }
    expect(validatePlayerParticipants(nonCanonical)).toBe(
      'Un identifiant de joueur n’est pas canonique.',
    )
  })

  it('impose deux joueurs par équipe et leur rattachement canonique', () => {
    const invalidTeam = participants()
    invalidTeam[2] = { ...invalidTeam[2], teamId: 'A' }

    expect(validatePlayerParticipants(invalidTeam)).toBe(
      'Chaque joueur doit appartenir à l’équipe indiquée par son identifiant.',
    )
  })

  it('refuse les noms vides après normalisation des espaces', () => {
    const unnamed = participants()
    unnamed[1] = { ...unnamed[1], name: '  \t  ' }

    expect(validatePlayerParticipants(unnamed)).toBe(
      'Le nom de chaque joueur est obligatoire.',
    )
  })

  it('accepte les homonymes lorsque les identifiants restent distincts', () => {
    const homonyms = participants().map((player) => ({
      ...player,
      name: 'Camille',
    }))

    expect(validatePlayerParticipants(homonyms)).toBeNull()
  })

  it('exige un côté RIGHT et LEFT dans chaque équipe', () => {
    expect(validatePlayerParticipants(participants())).toBeNull()

    const sameSides = participants()
    sameSides[1] = { ...sameSides[1], side: 'RIGHT' }
    expect(validatePlayerParticipants(sameSides)).toBe(
      'Chaque équipe doit avoir un joueur à droite et un joueur à gauche.',
    )
  })

  it.each(PLAYER_IDS)(
    'initialise un état incomplet valide avec %s comme premier serveur',
    (firstServer) => {
      const pending = initializePlayerServiceOrder(participants(), firstServer)

      expect(pending.status).toBe('PENDING_SECOND_SERVER')
      expect(pending.firstServer).toBe(firstServer)
      expect(pending.firstServingTeam).toBe(playerTeam(firstServer))
      expect('order' in pending).toBe(false)
      expect(Object.isFrozen(pending)).toBe(true)
      expect(Object.isFrozen(pending.participants)).toBe(true)
    },
  )

  it('refuse un premier serveur absent des participants', () => {
    expect(() =>
      initializePlayerServiceOrder(participants(), 'C1' as PlayerId),
    ).toThrow('Le serveur doit appartenir aux participants du match.')
  })

  it('refuse un second serveur de la même équipe', () => {
    const pending = initializePlayerServiceOrder(participants(), 'A1')

    expect(() => completePlayerServiceOrder(pending, 'A2')).toThrow(
      'Le serveur du deuxième jeu doit appartenir à l’équipe adverse.',
    )
  })

  it('refuse un second serveur absent des participants', () => {
    const pending = initializePlayerServiceOrder(participants(), 'A1')

    expect(() => completePlayerServiceOrder(pending, 'C1' as PlayerId)).toThrow(
      'Le serveur doit appartenir aux participants du match.',
    )
  })

  it.each(expectedOrders)(
    'construit l’ordre %s puis %s de façon déterministe',
    (firstServer, secondServer, expected) => {
      const pending = initializePlayerServiceOrder(participants(), firstServer)
      const complete = completePlayerServiceOrder(pending, secondServer)

      expect(complete.status).toBe('COMPLETE')
      expect(complete.order).toEqual(expected)
      expect(new Set(complete.order)).toEqual(new Set(PLAYER_IDS))
      expect(Object.isFrozen(complete.order)).toBe(true)
      complete.order.forEach((playerId, index) => {
        const nextPlayerId = complete.order[(index + 1) % complete.order.length]
        expect(playerTeam(nextPlayerId)).not.toBe(playerTeam(playerId))
      })
    },
  )

  it('ne dépend ni des côtés ni de l’ordre du tableau de participants', () => {
    const source = participants()
    const swappedSides = source.map((player) => ({
      ...player,
      side: player.side === 'RIGHT' ? ('LEFT' as const) : ('RIGHT' as const),
    }))
    const permuted = [source[2], source[0], source[3], source[1]]

    const expected = completePlayerServiceOrder(
      initializePlayerServiceOrder(source, 'B2'),
      'A2',
    ).order
    expect(
      completePlayerServiceOrder(
        initializePlayerServiceOrder(swappedSides, 'B2'),
        'A2',
      ).order,
    ).toEqual(expected)
    expect(
      completePlayerServiceOrder(
        initializePlayerServiceOrder(permuted, 'B2'),
        'A2',
      ).order,
    ).toEqual(expected)
  })

  it('ne dépend ni des noms ni de leur homonymie', () => {
    const renamed = participants().map((player) => ({
      ...player,
      name: 'Même nom',
    }))

    const complete = completePlayerServiceOrder(
      initializePlayerServiceOrder(renamed, 'A2'),
      'B1',
    )
    expect(complete.order).toEqual(['A2', 'B1', 'A1', 'B2'])
  })
})
