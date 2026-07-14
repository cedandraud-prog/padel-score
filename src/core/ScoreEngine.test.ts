import { describe, expect, it } from 'vitest'
import { ScoreEngine } from './ScoreEngine'
import type { TeamId } from './matchTypes'

function winGame(engine: ScoreEngine, team: TeamId): void {
  for (let point = 0; point < 4; point += 1) engine.awardPoint(team)
}

function winGames(engine: ScoreEngine, team: TeamId, games: number): void {
  for (let game = 0; game < games; game += 1) winGame(engine, team)
}

function reachTieBreak(engine: ScoreEngine): void {
  for (let game = 0; game < 6; game += 1) {
    winGame(engine, 'A')
    winGame(engine, 'B')
  }
}

describe('ScoreEngine', () => {
  it('suit la progression normale des points', () => {
    const engine = new ScoreEngine()

    expect(engine.getDisplayState().teams.A.points).toBe('0')
    engine.awardPoint('A')
    expect(engine.getDisplayState().teams.A.points).toBe('15')
    engine.awardPoint('A')
    expect(engine.getDisplayState().teams.A.points).toBe('30')
    engine.awardPoint('A')
    expect(engine.getDisplayState().teams.A.points).toBe('40')
  })

  it('affiche égalité à 40-40', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 3)

    expect(engine.getDisplayState().teams.A.points).toBe('Égalité')
    expect(engine.getDisplayState().teams.B.points).toBe('Égalité')
  })

  it('affiche avantage pour l’équipe en tête après égalité', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 3)
    engine.awardPoint('A')

    expect(engine.getDisplayState().teams.A.points).toBe('Avantage')
    expect(engine.getDisplayState().teams.B.points).toBe('40')
  })

  it('revient à égalité lorsque l’adversaire gagne le point', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(4, 3)
    engine.awardPoint('B')

    expect(engine.getDisplayState().teams.A.points).toBe('Égalité')
    expect(engine.getDisplayState().teams.B.points).toBe('Égalité')
  })

  it('gagne un jeu à quatre points avec deux points d’écart', () => {
    const engine = new ScoreEngine()
    winGame(engine, 'A')

    expect(engine.getState().games).toEqual({ A: 1, B: 0 })
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
  })

  it('gagne un set à six jeux avec deux jeux d’écart', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 6)

    expect(engine.getState().sets).toEqual({ A: 1, B: 0 })
    expect(engine.getState().completedSets).toEqual([{ A: 6, B: 0 }])
    expect(engine.getState().games).toEqual({ A: 0, B: 0 })
  })

  it('déclenche le tie-break à 6-6 et le gagne à deux points d’écart', () => {
    const engine = new ScoreEngine()
    reachTieBreak(engine)

    expect(engine.getState().isTieBreak).toBe(true)
    for (let point = 0; point < 5; point += 1) {
      engine.awardPoint('A')
      engine.awardPoint('B')
    }
    engine.awardPoint('A')
    engine.awardPoint('A')

    expect(engine.getState().sets).toEqual({ A: 1, B: 0 })
    expect(engine.getState().completedSets).toEqual([{ A: 7, B: 6 }])
    expect(engine.getState().isTieBreak).toBe(false)
  })

  it('déclare le vainqueur après deux sets gagnés', () => {
    const engine = new ScoreEngine({
      teamNames: { A: 'Lynx', B: 'Orques' },
    })
    winGames(engine, 'A', 12)

    const display = engine.getDisplayState()
    expect(display.winner).toBe('A')
    expect(display.isMatchOver).toBe(true)
    expect(display.teams.A.isWinner).toBe(true)
    expect(display.teams.A.name).toBe('Lynx')
    expect(() => engine.awardPoint('B')).toThrow('Le match est terminé.')
  })

  it('restaure exactement l’état précédent avec undo', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 3)
    const beforePoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforePoint)
  })

  it('corrige les points et historise la correction', () => {
    const engine = new ScoreEngine()
    engine.awardPoint('A')
    const beforeCorrection = engine.getState()
    engine.correctPoints(2, 1)

    expect(engine.getState().points).toEqual({ A: 2, B: 1 })
    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeCorrection)
    expect(() => engine.correctPoints(4, 0)).toThrow(
      'La correction doit représenter un jeu encore en cours.',
    )
  })

  it('retourne des copies qui ne permettent pas de modifier le moteur', () => {
    const engine = new ScoreEngine()
    const externalState = engine.getState()
    externalState.points.A = 99
    externalState.service.servingTeam = 'B'

    expect(engine.getState().points.A).toBe(0)
    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('permet de choisir l’équipe B comme serveur initial', () => {
    const engine = new ScoreEngine({ servingTeam: 'B' })

    expect(engine.getState().service.servingTeam).toBe('B')
    expect(engine.getDisplayState().teams.B.isServing).toBe(true)
  })

  it('change de serveur après un jeu classique', () => {
    const engine = new ScoreEngine({ servingTeam: 'B' })
    winGame(engine, 'A')

    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('corrige le serveur sans modifier le score', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    engine.correctPoints(2, 1)
    const scoreBefore = engine.getState()

    expect(engine.correctServingTeam('B')).toBe(true)

    const corrected = engine.getState()
    expect(corrected.service.servingTeam).toBe('B')
    expect(corrected.points).toEqual(scoreBefore.points)
    expect(corrected.games).toEqual(scoreBefore.games)
    expect(corrected.sets).toEqual(scoreBefore.sets)
    expect(engine.getDisplayState().teams.B.isServing).toBe(true)
  })

  it('refuse une équipe de service invalide à l’exécution', () => {
    const engine = new ScoreEngine()

    expect(() => engine.correctServingTeam('C' as TeamId)).toThrow(
      "L'équipe au service est invalide.",
    )
  })

  it('annule une correction du serveur et restaure son état exact', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    const beforeCorrection = engine.getState()

    engine.correctServingTeam('B')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeCorrection)
  })

  it('historise distinctement un point puis une correction du serveur', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    engine.awardPoint('A')
    engine.correctServingTeam('B')

    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 1, B: 0 })
    expect(engine.getState().service.servingTeam).toBe('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('conserve le serveur corrigé lorsque le point suivant est annulé', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    engine.correctServingTeam('B')
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
    expect(engine.getState().service.servingTeam).toBe('B')
  })

  it('n’historise pas une correction vers le serveur déjà actif', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    engine.awardPoint('A')

    expect(engine.correctServingTeam('A')).toBe(false)
    expect(engine.undo()).toBe(true)
    expect(engine.getState().points).toEqual({ A: 0, B: 0 })
    expect(engine.undo()).toBe(false)
  })

  it('fait tourner le service depuis le serveur corrigé après un jeu', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    engine.correctServingTeam('B')
    engine.correctPoints(3, 0)
    engine.awardPoint('A')

    expect(engine.getState().games).toEqual({ A: 1, B: 0 })
    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('respecte la séquence de service du tie-break', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)

    expect(engine.getState().service.servingTeam).toBe('A')
    engine.awardPoint('A')
    expect(engine.getState().service.servingTeam).toBe('B')
    engine.awardPoint('B')
    expect(engine.getState().service.servingTeam).toBe('B')
    engine.awardPoint('A')
    expect(engine.getState().service.servingTeam).toBe('A')
    engine.awardPoint('B')
    expect(engine.getState().service.servingTeam).toBe('A')
    engine.awardPoint('A')
    expect(engine.getState().service.servingTeam).toBe('B')
  })

  it('donne le service du set suivant au receveur initial du tie-break', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)
    for (let point = 0; point < 7; point += 1) engine.awardPoint('A')

    expect(engine.getState().service.servingTeam).toBe('B')
  })

  it('ré-ancre la séquence du tie-break sur le serveur corrigé', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)
    engine.awardPoint('A')
    expect(engine.getState().service.servingTeam).toBe('B')

    engine.correctServingTeam('A')
    expect(engine.getState().service).toEqual({
      servingTeam: 'A',
      tieBreakInitialServer: 'B',
    })

    engine.awardPoint('B')
    expect(engine.getState().service.servingTeam).toBe('A')
    engine.awardPoint('A')
    expect(engine.getState().service.servingTeam).toBe('B')
  })

  it('annule le serveur et l’ancre corrigés pendant le tie-break', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)
    engine.awardPoint('A')
    const beforeCorrection = engine.getState()

    engine.correctServingTeam('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeCorrection)
  })

  it('conserve un serveur de set suivant cohérent après correction du tie-break', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)
    engine.correctServingTeam('B')
    for (let point = 0; point < 7; point += 1) engine.awardPoint('A')

    expect(engine.getState().sets).toEqual({ A: 1, B: 0 })
    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('gagne un set 7-5', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 5)
    winGames(engine, 'B', 5)
    winGames(engine, 'A', 2)

    expect(engine.getState().completedSets).toEqual([{ A: 7, B: 5 }])
    expect(engine.getState().sets).toEqual({ A: 1, B: 0 })
  })

  it('poursuit le tie-break après 6-6', () => {
    const engine = new ScoreEngine()
    reachTieBreak(engine)
    for (let point = 0; point < 6; point += 1) {
      engine.awardPoint('A')
      engine.awardPoint('B')
    }

    expect(engine.getState().isTieBreak).toBe(true)
    expect(engine.getState().points).toEqual({ A: 6, B: 6 })
  })

  it('gagne un tie-break prolongé 10-8', () => {
    const engine = new ScoreEngine()
    reachTieBreak(engine)
    for (let point = 0; point < 8; point += 1) {
      engine.awardPoint('A')
      engine.awardPoint('B')
    }
    engine.awardPoint('A')
    engine.awardPoint('A')

    expect(engine.getState().completedSets).toEqual([{ A: 7, B: 6 }])
    expect(engine.getState().sets.A).toBe(1)
  })

  it('gagne un jeu après plusieurs égalités et avantages', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 3)
    engine.awardPoint('A')
    engine.awardPoint('B')
    engine.awardPoint('B')
    engine.awardPoint('A')
    engine.awardPoint('A')
    engine.awardPoint('A')

    expect(engine.getState().games).toEqual({ A: 1, B: 0 })
  })

  it('déclare l’équipe B vainqueure du match', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'B', 12)

    expect(engine.getState().winner).toBe('B')
  })

  it('gagne un match en trois sets', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 6)
    winGames(engine, 'B', 12)

    expect(engine.getState().completedSets).toEqual([
      { A: 6, B: 0 },
      { A: 0, B: 6 },
      { A: 0, B: 6 },
    ])
    expect(engine.getState().sets).toEqual({ A: 1, B: 2 })
    expect(engine.getState().winner).toBe('B')
  })

  it('annule un jeu remporté', () => {
    const engine = new ScoreEngine()
    engine.correctPoints(3, 0)
    const beforeWinningPoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeWinningPoint)
  })

  it('annule un set remporté', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 5)
    engine.correctPoints(3, 0)
    const beforeWinningPoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeWinningPoint)
  })

  it('annule un tie-break remporté', () => {
    const engine = new ScoreEngine()
    reachTieBreak(engine)
    engine.correctPoints(6, 5)
    const beforeWinningPoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeWinningPoint)
  })

  it('annule un match remporté', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 11)
    engine.correctPoints(3, 0)
    const beforeWinningPoint = engine.getState()
    engine.awardPoint('A')

    expect(engine.getState().winner).toBe('A')
    expect(engine.undo()).toBe(true)
    expect(engine.getState()).toEqual(beforeWinningPoint)
  })

  it('retourne false lorsque undo est appelé sans historique', () => {
    const engine = new ScoreEngine()

    expect(engine.undo()).toBe(false)
  })

  it('refuse une correction négative', () => {
    const engine = new ScoreEngine()

    expect(() => engine.correctPoints(-1, 0)).toThrow()
  })

  it('refuse une correction décimale', () => {
    const engine = new ScoreEngine()

    expect(() => engine.correctPoints(1.5, 0)).toThrow()
  })

  it('refuse une correction correspondant à un jeu terminé', () => {
    const engine = new ScoreEngine()

    expect(() => engine.correctPoints(5, 3)).toThrow(
      'La correction doit représenter un jeu encore en cours.',
    )
  })

  it('accepte les corrections représentant un avantage valide', () => {
    const engine = new ScoreEngine()

    engine.correctPoints(4, 3)
    expect(engine.getDisplayState().teams.A.points).toBe('Avantage')
    expect(engine.getDisplayState().teams.B.points).toBe('40')

    engine.correctPoints(3, 4)
    expect(engine.getDisplayState().teams.A.points).toBe('40')
    expect(engine.getDisplayState().teams.B.points).toBe('Avantage')
  })

  it('refuse une correction après la fin du match', () => {
    const engine = new ScoreEngine()
    winGames(engine, 'A', 12)

    expect(() => engine.correctPoints(0, 0)).toThrow('Le match est terminé.')
  })

  it('recalcule le serveur après une correction pendant un tie-break', () => {
    const engine = new ScoreEngine({ servingTeam: 'A' })
    reachTieBreak(engine)

    // Après trois points joués, A sert le quatrième : le premier serveur sert
    // un point, puis chaque équipe sert deux points consécutifs.
    engine.correctPoints(2, 1)

    expect(engine.getState().service.servingTeam).toBe('A')
  })

  it('démarre un nouveau match avec de nouveaux noms et un nouveau serveur', () => {
    const engine = new ScoreEngine()
    engine.awardPoint('A')
    engine.newMatch({
      teamNames: { A: 'Lynx', B: 'Orques' },
      servingTeam: 'B',
    })

    const state = engine.getState()
    expect(state.teams).toEqual({ A: 'Lynx', B: 'Orques' })
    expect(state.service.servingTeam).toBe('B')
    expect(state.points).toEqual({ A: 0, B: 0 })
    expect(state.sets).toEqual({ A: 0, B: 0 })
  })

  it('continue après deux sets gagnés en FREE_PLAY', () => {
    const engine = new ScoreEngine({ format: 'FREE_PLAY' })
    winGames(engine, 'A', 12)
    expect(engine.getState().winner).toBeNull()
    expect(() => engine.awardPoint('B')).not.toThrow()
    expect(engine.getState().points.B).toBe(1)
  })

  it('conserve tous les sets et commence un quatrième set en FREE_PLAY', () => {
    const engine = new ScoreEngine({ format: 'FREE_PLAY' })
    winGames(engine, 'A', 12)
    winGames(engine, 'B', 6)
    engine.awardPoint('A')
    expect(engine.getState().sets).toEqual({ A: 2, B: 1 })
    expect(engine.getState().completedSets).toHaveLength(3)
    expect(engine.getState().games).toEqual({ A: 0, B: 0 })
    expect(engine.getState().points.A).toBe(1)
  })

  it('conserve le blocage historique en REGULAR_MATCH', () => {
    const engine = new ScoreEngine({ format: 'REGULAR_MATCH' })
    winGames(engine, 'A', 12)
    expect(engine.getState().winner).toBe('A')
    expect(() => engine.awardPoint('B')).toThrow('Le match est terminé.')
  })
})
