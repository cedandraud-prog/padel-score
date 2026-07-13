import { describe, expect, it } from 'vitest'
import { ScoreEngine } from '../core/ScoreEngine'
import type { TeamId } from '../core/matchTypes'
import {
  buildFullScoreAnnouncement,
  buildPointScoreAnnouncement,
  buildTransitionAnnouncement,
  type AnnounceableMatchState,
} from './matchAnnouncements'

function capture(engine: ScoreEngine): AnnounceableMatchState {
  return { match: engine.getState(), display: engine.getDisplayState() }
}

function winGame(engine: ScoreEngine, team: TeamId): void {
  for (let point = 0; point < 4; point += 1) engine.awardPoint(team)
}

function winGames(engine: ScoreEngine, team: TeamId, games: number): void {
  for (let game = 0; game < games; game += 1) winGame(engine, team)
}

describe('matchAnnouncements', () => {
  it('annonce le point courant', () => {
    const engine = new ScoreEngine()
    engine.awardPoint('A')

    expect(buildPointScoreAnnouncement(capture(engine))).toBe('quinze zéro')
  })

  it('annonce une égalité', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 3)

    expect(buildPointScoreAnnouncement(capture(engine))).toBe('égalité')
  })

  it('annonce un avantage', () => {
    const engine = new ScoreEngine({ teamNames: { A: 'Lynx' } })
    engine.correctPoints(4, 3)

    expect(buildPointScoreAnnouncement(capture(engine))).toBe('avantage Lynx')
  })

  it('distingue explicitement le score complet du score de points', () => {
    const engine = new ScoreEngine()
    engine.awardPoint('A')

    expect(buildPointScoreAnnouncement(capture(engine))).toBe('quinze zéro')
    expect(buildFullScoreAnnouncement(capture(engine))).toContain('jeux')
    expect(buildFullScoreAnnouncement(capture(engine))).toContain('set')
  })

  it('annonce uniquement les points numériques du tie-break', () => {
    const engine = new ScoreEngine()
    for (let game = 0; game < 6; game += 1) {
      winGame(engine, 'A')
      winGame(engine, 'B')
    }
    engine.correctPoints(5, 3)

    expect(buildPointScoreAnnouncement(capture(engine))).toBe('cinq trois')
  })

  it('annonce un jeu et le score en jeux', () => {
    const engine = new ScoreEngine({ teamNames: { A: 'Lynx' } })
    engine.correctPoints(3, 0)
    const previous = capture(engine)
    engine.awardPoint('A')

    expect(buildTransitionAnnouncement(previous, capture(engine), 'A')).toBe(
      'jeu Lynx. Lynx mène un jeu à zéro',
    )
  })

  it('annonce égalités, singulier, points et prochain serveur', () => {
    const engine = new ScoreEngine({ servingTeam: 'B' })
    winGames(engine, 'A', 6)
    for (let game = 0; game < 3; game += 1) {
      winGame(engine, 'A')
      winGame(engine, 'B')
    }
    engine.correctPoints(2, 2)

    expect(buildFullScoreAnnouncement(capture(engine))).toBe(
      'Équipe A mène un set à zéro. trois jeux partout. trente partout. Prochain service : Équipe B',
    )
  })

  it('annonce naturellement les pluriels et peut omettre le prochain service', () => {
    const engine = new ScoreEngine({ format: 'FREE_PLAY' })
    winGames(engine, 'A', 6)
    winGames(engine, 'B', 6)
    winGames(engine, 'A', 6)
    for (let game = 0; game < 3; game += 1) {
      winGame(engine, 'A')
      winGame(engine, 'B')
    }
    winGame(engine, 'A')
    engine.correctPoints(1, 3)

    const state = capture(engine)
    expect(buildFullScoreAnnouncement(state)).toContain(
      'Équipe A mène deux sets à un',
    )
    expect(buildFullScoreAnnouncement(state)).toContain(
      'Équipe A mène quatre jeux à trois',
    )
    expect(buildFullScoreAnnouncement(state)).toContain('quinze quarante')
    expect(
      buildFullScoreAnnouncement(state, { includeNextServer: false }),
    ).not.toContain('Prochain service')
  })

  it('annonce un set', () => {
    const engine = new ScoreEngine({ teamNames: { A: 'Lynx' } })
    winGames(engine, 'A', 5)
    winGames(engine, 'B', 5)
    winGame(engine, 'A')
    engine.correctPoints(3, 0)
    const previous = capture(engine)
    engine.awardPoint('A')

    expect(
      buildTransitionAnnouncement(previous, capture(engine), 'A'),
    ).toContain('premier set Lynx')
  })

  it('annonce le déclenchement du tie-break', () => {
    const engine = new ScoreEngine()
    for (let game = 0; game < 5; game += 1) {
      winGame(engine, 'A')
      winGame(engine, 'B')
    }
    winGame(engine, 'A')
    engine.correctPoints(0, 3)
    const previous = capture(engine)
    engine.awardPoint('B')

    expect(
      buildTransitionAnnouncement(previous, capture(engine), 'B'),
    ).toContain('tie-break')
  })

  it('annonce la victoire', () => {
    const engine = new ScoreEngine({ teamNames: { A: 'Lynx' } })
    winGames(engine, 'A', 11)
    engine.correctPoints(3, 0)
    const previous = capture(engine)
    engine.awardPoint('A')

    expect(
      buildTransitionAnnouncement(previous, capture(engine), 'A'),
    ).toContain('victoire des Lynx')
  })
})
