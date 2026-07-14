import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScoreEngine } from '../core/ScoreEngine'
import { createDefaultMatchConfiguration } from '../application/matchConfiguration'
import {
  createMatchRecord,
  type MatchSessionSnapshot,
} from '../application/matchPersistence'
import { MatchHistory } from './MatchHistory'
import { MatchRecap } from './MatchRecap'
import { RestoreSessionPrompt } from './RestoreSessionPrompt'

function session(): MatchSessionSnapshot {
  const engine = new ScoreEngine({ format: 'FREE_PLAY' })
  engine.awardPoint('A')
  const state = engine.getState()
  return {
    schemaVersion: 1,
    id: 'match-1',
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
    completedSets: [{ A: 6, B: 4 }],
    currentScore: {
      sets: { A: 1, B: 0 },
      games: { A: 2, B: 3 },
      points: state.points,
      isTieBreak: false,
    },
    application: { feedbackMode: 'NONE', actionCount: 1 },
  }
}

const callbacks = {
  onResume: () => undefined,
  onAbandon: () => undefined,
  onNewWithPlayers: () => undefined,
  onBackToSetup: () => undefined,
  onClose: () => undefined,
}

describe('vues de persistance', () => {
  it('propose explicitement Reprendre ou Abandonner', () => {
    const html = renderToStaticMarkup(
      <RestoreSessionPrompt
        session={session()}
        onResume={callbacks.onResume}
        onAbandon={callbacks.onAbandon}
      />,
    )
    expect(html).toContain('Match en cours retrouvé')
    expect(html).toContain('Reprendre')
    expect(html).toContain('Abandonner')
  })

  it('affiche le récapitulatif, les sets et les trois actions', () => {
    const record = createMatchRecord(session(), 'FINISHED')
    const html = renderToStaticMarkup(
      <MatchRecap
        record={record}
        onResume={callbacks.onResume}
        onNewWithPlayers={callbacks.onNewWithPlayers}
        onBackToSetup={callbacks.onBackToSetup}
      />,
    )
    expect(html).toContain('Set 1 : 6–4')
    expect(html).toContain('Set en cours : 2–3')
    expect(html).toContain('Reprendre le match')
    expect(html).toContain('Nouveau match avec ces joueurs')
    expect(html).toContain('Retour à la configuration')
  })

  it('liste l’historique local et son statut', () => {
    const record = createMatchRecord(session(), 'ABANDONED')
    const html = renderToStaticMarkup(
      <MatchHistory
        records={[record]}
        onOpen={() => undefined}
        onClose={callbacks.onClose}
      />,
    )
    expect(html).toContain('Historique des matchs')
    expect(html).toContain('Rouges')
    expect(html).toContain('6–4')
    expect(html).toContain('Abandonné')
  })
})
