import { describe, expect, it } from 'vitest'
import { ScoreEngine } from './ScoreEngine'
import type { TeamId } from './matchTypes'
import {
  PLAYER_IDS,
  type PlayerId,
  type PlayerParticipant,
  type PlayerServiceOrder,
} from './playerPlusService'

function participants(homonym = false): PlayerParticipant[] {
  const name = (value: string) => (homonym ? 'Camille' : value)
  return [
    { id: 'A1', teamId: 'A', name: name('Alice'), side: 'RIGHT' },
    { id: 'A2', teamId: 'A', name: name('Agathe'), side: 'LEFT' },
    { id: 'B1', teamId: 'B', name: name('Bruno'), side: 'RIGHT' },
    { id: 'B2', teamId: 'B', name: name('Basile'), side: 'LEFT' },
  ]
}

function playerPlusEngine(firstServer: PlayerId = 'A1'): ScoreEngine {
  return new ScoreEngine({
    format: 'FREE_PLAY',
    playerPlus: { participants: participants(), firstServer },
  })
}

function winGame(engine: ScoreEngine, team: TeamId): void {
  for (let point = 0; point < 4; point += 1) engine.awardPoint(team)
}

function startCompleteOrder(
  firstServer: PlayerId = 'A1',
  secondServer: PlayerId = 'B1',
): ScoreEngine {
  const engine = playerPlusEngine(firstServer)
  winGame(engine, firstServer.startsWith('A') ? 'A' : 'B')
  engine.confirmSecondServer(secondServer)
  return engine
}

function reachPlayerPlusTieBreak(engine: ScoreEngine): void {
  winGame(engine, 'B')
  for (let game = 1; game < 6; game += 1) {
    winGame(engine, 'A')
    winGame(engine, 'B')
  }
}

function completeService(engine: ScoreEngine) {
  const service = engine.getState().service
  if (service.mode !== 'PLAYERS_PLUS' || service.stage !== 'COMPLETE') {
    throw new Error('Le service PLAYER+ complet était attendu dans le test.')
  }
  return service
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

describe('ScoreEngine PLAYER+', () => {
  it.each(PLAYER_IDS)(
    'démarre avec %s comme premier serveur dans un ordre incomplet',
    (firstServer) => {
      const service = playerPlusEngine(firstServer).getState().service

      expect(service).toMatchObject({
        mode: 'PLAYERS_PLUS',
        stage: 'FIRST_GAME',
        servingTeam: firstServer.startsWith('A') ? 'A' : 'B',
        currentServer: firstServer,
      })
      if (service.mode !== 'PLAYERS_PLUS') {
        throw new Error('Le service PLAYER+ était attendu dans le test.')
      }
      expect(service.serviceOrder.status).toBe('PENDING_SECOND_SERVER')
    },
  )

  it('conserve l’ordre incomplet pendant tout le premier jeu', () => {
    const engine = playerPlusEngine()
    engine.awardPoint('B')

    const service = engine.getState().service
    expect(service.mode).toBe('PLAYERS_PLUS')
    if (service.mode !== 'PLAYERS_PLUS') return
    expect(service.stage).toBe('FIRST_GAME')
    expect(service.currentServer).toBe('A1')
  })

  it('bloque le deuxième jeu jusqu’à la validation du second serveur', () => {
    const engine = playerPlusEngine()
    winGame(engine, 'A')

    expect(engine.getState().service).toMatchObject({
      mode: 'PLAYERS_PLUS',
      stage: 'AWAITING_SECOND_SERVER',
      servingTeam: 'B',
      currentServer: null,
    })
    expect(() => engine.awardPoint('B')).toThrow(
      'Le serveur du deuxième jeu doit être validé avant de reprendre le score.',
    )
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
  })

  it('refuse un second serveur de la mauvaise équipe sans historiser le refus', () => {
    const engine = playerPlusEngine()
    winGame(engine, 'A')
    const beforeRefusal = engine.getState()

    expect(() => engine.confirmSecondServer('A2')).toThrow(
      'Le serveur du deuxième jeu doit appartenir à l’équipe adverse.',
    )
    expect(engine.getState()).toEqual(beforeRefusal)
  })

  it.each(expectedOrders)(
    'construit et active l’ordre %s puis %s',
    (firstServer, secondServer, expectedOrder) => {
      const service = completeService(
        startCompleteOrder(firstServer, secondServer),
      )

      expect(service.serviceOrder.order).toEqual(expectedOrder)
      expect(service.currentOrderIndex).toBe(1)
      expect(service.currentServer).toBe(secondServer)
    },
  )

  it('fait tourner les quatre joueurs puis reprend au premier', () => {
    const engine = startCompleteOrder()
    const expectedServers: PlayerId[] = ['A2', 'B2', 'A1', 'B1']

    for (const expectedServer of expectedServers) {
      winGame(engine, 'A')
      expect(completeService(engine).currentServer).toBe(expectedServer)
    }
  })

  it('applique la séquence individuelle du tie-break, y compris prolongé', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)

    expect(engine.getState().isTieBreak).toBe(true)
    expect(completeService(engine).currentServer).toBe('A1')
    const expectedAfterPoint: PlayerId[] = [
      'B1',
      'B1',
      'A2',
      'A2',
      'B2',
      'B2',
      'A1',
      'A1',
      'B1',
      'B1',
      'A2',
      'A2',
      'B2',
      'B2',
      'A1',
      'A1',
    ]

    for (let point = 0; point < expectedAfterPoint.length; point += 1) {
      engine.awardPoint(point % 2 === 0 ? 'A' : 'B')
      expect(completeService(engine).currentServer).toBe(
        expectedAfterPoint[point],
      )
    }
    expect(engine.getState().points).toEqual({ A: 8, B: 8 })
  })

  it('poursuit l’ordre au set suivant sans tie-break', () => {
    const engine = startCompleteOrder()
    winGame(engine, 'B')
    for (let game = 0; game < 5; game += 1) winGame(engine, 'A')

    expect(engine.getState().completedSets).toEqual([{ A: 6, B: 1 }])
    expect(completeService(engine)).toMatchObject({
      currentServer: 'B2',
      currentOrderIndex: 3,
    })
  })

  it('donne le set suivant au joueur suivant l’ancre du tie-break', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)
    for (let point = 0; point < 7; point += 1) engine.awardPoint('A')

    expect(engine.getState().completedSets).toEqual([{ A: 7, B: 6 }])
    expect(completeService(engine)).toMatchObject({
      currentServer: 'B1',
      currentOrderIndex: 1,
      tieBreakInitialServer: null,
      tieBreakInitialOrderIndex: null,
    })
  })

  it('ré-ancre l’ordre de l’équipe sans changer le score', () => {
    const engine = startCompleteOrder()
    const scoreBefore = engine.getState()

    expect(engine.correctPlayerServer('B2')).toBe(true)

    const corrected = completeService(engine)
    expect(corrected.currentServer).toBe('B2')
    expect(corrected.serviceOrder.order).toEqual(['A1', 'B2', 'A2', 'B1'])
    expect(engine.getState().points).toEqual(scoreBefore.points)
    expect(engine.getState().games).toEqual(scoreBefore.games)
    expect(engine.getState().sets).toEqual(scoreBefore.sets)
  })

  it('permet de changer le premier serveur d’une équipe au nouveau set', () => {
    const engine = startCompleteOrder()
    winGame(engine, 'B')
    for (let game = 0; game < 5; game += 1) winGame(engine, 'A')
    expect(completeService(engine).currentServer).toBe('B2')

    engine.correctPlayerServer('B1')

    expect(completeService(engine).currentServer).toBe('B1')
    expect(completeService(engine).serviceOrder.order).toEqual([
      'A1',
      'B2',
      'A2',
      'B1',
    ])
  })

  it('refuse une correction vers l’autre équipe et ignore un no-op', () => {
    const engine = startCompleteOrder()
    engine.awardPoint('A')

    expect(() => engine.correctPlayerServer('A1')).toThrow(
      'Le serveur corrigé doit appartenir à l’équipe actuellement au service.',
    )
    expect(engine.correctPlayerServer('B1')).toBe(false)
    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
  })

  it('refuse aussi une correction de points avant le second serveur', () => {
    const engine = playerPlusEngine()
    winGame(engine, 'A')

    expect(() => engine.correctPoints(1, 0)).toThrow(
      'Le serveur du deuxième jeu doit être validé avant de reprendre le score.',
    )
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
  })

  it('annule la validation du second serveur', () => {
    const engine = playerPlusEngine()
    winGame(engine, 'A')
    const awaiting = engine.getState()
    engine.confirmSecondServer('B1')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(awaiting)
  })

  it('annule une correction individuelle', () => {
    const engine = startCompleteOrder()
    const beforeCorrection = engine.getState()
    engine.correctPlayerServer('B2')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeCorrection)
  })

  it('historise distinctement point puis correction', () => {
    const engine = startCompleteOrder()
    engine.awardPoint('A')
    const afterPoint = engine.getState()
    engine.correctPlayerServer('B2')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(afterPoint)
    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
  })

  it('conserve la correction lorsque le point suivant est annulé', () => {
    const engine = startCompleteOrder()
    engine.correctPlayerServer('B2')
    const corrected = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(corrected)
  })

  it('annule exactement un point de tie-break avec son serveur', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)
    const beforePoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforePoint)
  })

  it('re-ancre et annule une correction pendant le tie-break', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)
    engine.awardPoint('A')
    const beforeCorrection = engine.getState()

    engine.correctPlayerServer('B2')
    const corrected = completeService(engine)
    expect(corrected.currentServer).toBe('B2')
    expect(corrected.tieBreakInitialServer).toBe('A1')

    engine.awardPoint('B')
    expect(completeService(engine).currentServer).toBe('B2')
    expect(engine.undo()).toBe(true)
    expect(completeService(engine).currentServer).toBe('B2')
    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeCorrection)
  })

  it('termine un tie-break prolonge 10-8 en conservant la rotation', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)
    for (let point = 0; point < 8; point += 1) {
      engine.awardPoint('A')
      engine.awardPoint('B')
    }
    engine.awardPoint('A')
    engine.awardPoint('A')

    expect(engine.getState().completedSets).toEqual([{ A: 7, B: 6 }])
    expect(completeService(engine).currentServer).toBe('B1')
  })

  it('annule exactement un changement de set', () => {
    const engine = startCompleteOrder()
    reachPlayerPlusTieBreak(engine)
    for (let point = 0; point < 6; point += 1) engine.awardPoint('A')
    const beforeSetPoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeSetPoint)
  })

  it('clone profondément les participants et l’ordre exposés', () => {
    const engine = startCompleteOrder()
    const first = completeService(engine)
    const second = completeService(engine)

    expect(first.serviceOrder).not.toBe(second.serviceOrder)
    expect(first.serviceOrder.order).not.toBe(second.serviceOrder.order)
    expect(first.serviceOrder.participants).not.toBe(
      second.serviceOrder.participants,
    )
    expect(first.serviceOrder.participants[0]).not.toBe(
      second.serviceOrder.participants[0],
    )
  })

  it('distingue les joueurs homonymes par leur identifiant', () => {
    const engine = new ScoreEngine({
      format: 'FREE_PLAY',
      playerPlus: { participants: participants(true), firstServer: 'A2' },
    })
    winGame(engine, 'A')
    engine.confirmSecondServer('B2')

    expect(completeService(engine).serviceOrder.order).toEqual([
      'A2',
      'B2',
      'A1',
      'B1',
    ])
  })

  it('reinitialise un nouveau match PLAYER+ avec sa configuration canonique', () => {
    const engine = playerPlusEngine()
    engine.awardPoint('A')

    engine.newMatch({
      format: 'FREE_PLAY',
      playerPlus: { participants: participants(), firstServer: 'B2' },
    })

    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
    expect(engine.getState().service).toMatchObject({
      mode: 'PLAYERS_PLUS',
      stage: 'FIRST_GAME',
      currentServer: 'B2',
      servingTeam: 'B',
    })
  })
})
