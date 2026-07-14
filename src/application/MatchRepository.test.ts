import { describe, expect, it, vi } from 'vitest'
import { ScoreEngine } from '../core/ScoreEngine'
import { createDefaultMatchConfiguration } from './matchConfiguration'
import {
  createMatchRecord,
  isMatchSetupDraftSnapshot,
  MATCH_PERSISTENCE_SCHEMA_VERSION,
  type MatchSessionSnapshot,
} from './matchPersistence'
import { createPlayerPlusConfigurationDraft } from './setupConfiguration'
import {
  InMemoryMatchRepository,
  type MatchRepository,
} from './MatchRepository'
import { MatchPersistenceService } from './MatchPersistenceService'

function session(id = 'match-1', pointsA = 0): MatchSessionSnapshot {
  const engine = new ScoreEngine({ format: 'FREE_PLAY' })
  for (let point = 0; point < pointsA; point += 1) engine.awardPoint('A')
  const state = engine.getState()
  return {
    schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
    id,
    status: 'IN_PROGRESS',
    mode: 'PLAYER',
    configuration: {
      ...createDefaultMatchConfiguration(),
      teamA: { displayName: 'Rouges', voiceName: 'Rouge' },
      teamB: { displayName: 'Bleus', voiceName: 'Bleu' },
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    startedAt: '2026-07-14T10:01:00.000Z',
    updatedAt: '2026-07-14T10:02:00.000Z',
    engine: engine.exportSnapshot(),
    completedSets: state.completedSets,
    currentScore: {
      sets: state.sets,
      games: state.games,
      points: state.points,
      isTieBreak: state.isTieBreak,
    },
    application: { feedbackMode: 'NONE', actionCount: pointsA },
  }
}

describe('MatchRepository', () => {
  it('conserve puis supprime les deux brouillons et le mode sélectionné', async () => {
    const repository = new InMemoryMatchRepository()
    const player = createDefaultMatchConfiguration()
    const playerPlus = createPlayerPlusConfigurationDraft()
    playerPlus.teamA.players[0].name = 'Alice'

    await repository.saveSetupDraft({
      schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
      mode: 'PLAYERS_PLUS',
      player,
      playerPlus,
      updatedAt: '2026-07-14T10:00:00.000Z',
    })
    playerPlus.teamA.players[0].name = 'Modifié après sauvegarde'

    const loaded = await repository.getSetupDraft()
    expect(loaded?.mode).toBe('PLAYERS_PLUS')
    expect(loaded?.playerPlus.teamA.players[0].name).toBe('Alice')
    await repository.deleteSetupDraft()
    expect(await repository.getSetupDraft()).toBeNull()
  })

  it('rejette proprement un ancien brouillon de configuration invalide', () => {
    expect(
      isMatchSetupDraftSnapshot({
        schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
        mode: 'PLAYERS_PLUS',
        player: createDefaultMatchConfiguration(),
        playerPlus: { mode: 'PLAYERS_PLUS' },
        updatedAt: '2026-07-14T10:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('crée, remplace puis supprime la session active', async () => {
    const repository = new InMemoryMatchRepository()
    await repository.saveActiveSession(session('same', 1))
    await repository.saveActiveSession(session('same', 2))

    expect((await repository.getActiveSession())?.currentScore.points.A).toBe(2)
    await repository.deleteActiveSession()
    expect(await repository.getActiveSession()).toBeNull()
  })

  it('crée et met à jour une archive sans doublon', async () => {
    const repository = new InMemoryMatchRepository()
    const first = createMatchRecord(session('same', 1), 'FINISHED')
    const reopened = createMatchRecord(session('same', 2), 'FINISHED')
    await repository.saveMatch(first)
    await repository.saveMatch(reopened)

    expect(await repository.listMatches()).toHaveLength(1)
    expect((await repository.getMatch('same'))?.finalScore.points.A).toBe(2)
  })

  it('retourne des copies indépendantes et conserve la version de schéma', async () => {
    const repository = new InMemoryMatchRepository()
    const saved = session()
    await repository.saveActiveSession(saved)
    saved.currentScore.games.A = 4

    const loaded = await repository.getActiveSession()
    expect(loaded?.schemaVersion).toBe(1)
    expect(loaded?.currentScore.games.A).toBe(0)
  })
})

describe('MatchPersistenceService', () => {
  it('archive avant de supprimer la session active', async () => {
    const calls: string[] = []
    const repository = new InMemoryMatchRepository()
    await repository.saveActiveSession(session())
    const controlled: MatchRepository = {
      ...repository,
      saveActiveSession: (value) => repository.saveActiveSession(value),
      getActiveSession: () => repository.getActiveSession(),
      getMatch: (id) => repository.getMatch(id),
      listMatches: () => repository.listMatches(),
      saveSetupDraft: (draft) => repository.saveSetupDraft(draft),
      getSetupDraft: () => repository.getSetupDraft(),
      deleteSetupDraft: () => repository.deleteSetupDraft(),
      saveMatch: async (record) => {
        calls.push('archive')
        await repository.saveMatch(record)
      },
      deleteActiveSession: async () => {
        calls.push('delete')
        await repository.deleteActiveSession()
      },
    }
    const service = new MatchPersistenceService(controlled)

    expect(
      await service.archive(createMatchRecord(session(), 'FINISHED')),
    ).toBe(true)
    expect(calls).toEqual(['archive', 'delete'])
    expect(await repository.getActiveSession()).toBeNull()
  })

  it('séquence les sauvegardes concurrentes dans leur ordre de demande', async () => {
    const repository = new InMemoryMatchRepository()
    const order: number[] = []
    const controlled: MatchRepository = {
      ...repository,
      getActiveSession: () => repository.getActiveSession(),
      deleteActiveSession: () => repository.deleteActiveSession(),
      saveMatch: (record) => repository.saveMatch(record),
      getMatch: (id) => repository.getMatch(id),
      listMatches: () => repository.listMatches(),
      saveSetupDraft: (draft) => repository.saveSetupDraft(draft),
      getSetupDraft: () => repository.getSetupDraft(),
      deleteSetupDraft: () => repository.deleteSetupDraft(),
      saveActiveSession: async (value) => {
        await Promise.resolve()
        order.push(value.currentScore.points.A)
        await repository.saveActiveSession(value)
      },
    }
    const service = new MatchPersistenceService(controlled)

    await Promise.all([
      service.saveActiveSession(session('same', 1)),
      service.saveActiveSession(session('same', 2)),
      service.saveActiveSession(session('same', 3)),
    ])

    expect(order).toEqual([1, 2, 3])
    expect((await repository.getActiveSession())?.currentScore.points.A).toBe(3)
  })

  it('rend une erreur de stockage non bloquante et visible', async () => {
    const onError = vi.fn()
    const repository = new InMemoryMatchRepository()
    const failing: MatchRepository = {
      saveActiveSession: async () => {
        throw new Error('quota')
      },
      getActiveSession: () => repository.getActiveSession(),
      deleteActiveSession: () => repository.deleteActiveSession(),
      saveMatch: (record) => repository.saveMatch(record),
      getMatch: (id) => repository.getMatch(id),
      listMatches: () => repository.listMatches(),
      saveSetupDraft: (draft) => repository.saveSetupDraft(draft),
      getSetupDraft: () => repository.getSetupDraft(),
      deleteSetupDraft: () => repository.deleteSetupDraft(),
    }
    const service = new MatchPersistenceService(failing, onError)

    expect(await service.saveActiveSession(session())).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('quota'))
  })

  it('réouvre un match avec le même identifiant', async () => {
    const repository = new InMemoryMatchRepository()
    const service = new MatchPersistenceService(repository)
    const record = createMatchRecord(session('stable-id'), 'FINISHED')
    await repository.saveMatch(record)

    expect(await service.reopen(record)).toBe(true)
    expect((await service.loadActiveSession())?.id).toBe('stable-id')
    expect(await service.listMatches()).toHaveLength(1)
  })
})
