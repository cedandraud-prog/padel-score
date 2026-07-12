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
      'jeu Lynx. Lynx mène 1 jeux à 0',
    )
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
