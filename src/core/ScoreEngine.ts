import type {
  DisplayState,
  MatchState,
  ScoreEngineOptions,
  SetScore,
  TeamId,
  TeamNames,
} from './matchTypes'
import {
  SETS_TO_WIN_MATCH,
  TIE_BREAK_AT_GAMES,
  displayPoint,
  otherTeam,
  tieBreakServer,
  winsGame,
  winsSet,
  winsTieBreak,
} from './padelRules'

const DEFAULT_TEAMS: TeamNames = { A: 'Équipe A', B: 'Équipe B' }

function emptyScore(): SetScore {
  return { A: 0, B: 0 }
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    teams: { ...state.teams },
    sets: { ...state.sets },
    games: { ...state.games },
    points: { ...state.points },
    service: { ...state.service },
    completedSets: state.completedSets.map((set) => ({ ...set })),
  }
}

function createState(options: ScoreEngineOptions = {}): MatchState {
  return {
    teams: { ...DEFAULT_TEAMS, ...options.teamNames },
    sets: emptyScore(),
    games: emptyScore(),
    points: emptyScore(),
    completedSets: [],
    isTieBreak: false,
    service: {
      tieBreakInitialServer: null,
      servingTeam: options.servingTeam ?? 'A',
    },
    winner: null,
  }
}

export class ScoreEngine {
  private state: MatchState
  private readonly history: MatchState[] = []
  private format: NonNullable<ScoreEngineOptions['format']>

  constructor(options: ScoreEngineOptions = {}) {
    this.format = options.format ?? 'REGULAR_MATCH'
    this.state = createState(options)
  }

  newMatch(options: ScoreEngineOptions = {}): void {
    this.rememberState()
    this.state = createState({
      teamNames: { ...this.state.teams, ...options.teamNames },
      servingTeam: options.servingTeam,
    })
    this.format = options.format ?? this.format
  }

  awardPoint(team: TeamId): void {
    if (this.state.winner) {
      throw new Error('Le match est terminé.')
    }

    this.rememberState()
    this.state.points[team] += 1

    if (this.state.isTieBreak) {
      if (winsTieBreak(this.state.points, team)) {
        this.completeTieBreak(team)
        return
      }

      const firstServer = this.state.service.tieBreakInitialServer
      if (firstServer) {
        this.state.service.servingTeam = tieBreakServer(
          firstServer,
          this.state.points.A + this.state.points.B,
        )
      }
      return
    }

    if (winsGame(this.state.points, team)) {
      this.completeGame(team)
    }
  }

  undo(): boolean {
    const previousState = this.history.pop()
    if (!previousState) return false
    this.state = previousState
    return true
  }

  correctPoints(pointsA: number, pointsB: number): void {
    this.validateCorrection(pointsA, pointsB)
    this.rememberState()
    this.state.points = { A: pointsA, B: pointsB }

    if (this.state.isTieBreak && this.state.service.tieBreakInitialServer) {
      this.state.service.servingTeam = tieBreakServer(
        this.state.service.tieBreakInitialServer,
        pointsA + pointsB,
      )
    }
  }

  correctServingTeam(team: TeamId): boolean {
    if (team !== 'A' && team !== 'B') {
      throw new Error("L'équipe au service est invalide.")
    }
    if (this.state.winner) {
      throw new Error('Le match est terminé.')
    }
    if (this.state.service.servingTeam === team) return false

    this.rememberState()
    this.state.service.servingTeam = team

    if (this.state.isTieBreak) {
      const pointsPlayed = this.state.points.A + this.state.points.B
      this.state.service.tieBreakInitialServer =
        tieBreakServer('A', pointsPlayed) === team ? 'A' : 'B'
    }

    return true
  }

  getState(): MatchState {
    return cloneState(this.state)
  }

  getDisplayState(): DisplayState {
    const pointFor = (team: TeamId) =>
      this.state.isTieBreak
        ? this.state.points[team]
        : displayPoint(this.state.points, team)

    return {
      teams: {
        A: {
          id: 'A',
          name: this.state.teams.A,
          sets: this.state.sets.A,
          games: this.state.games.A,
          points: pointFor('A'),
          isServing: this.state.service.servingTeam === 'A',
          isWinner: this.state.winner === 'A',
        },
        B: {
          id: 'B',
          name: this.state.teams.B,
          sets: this.state.sets.B,
          games: this.state.games.B,
          points: pointFor('B'),
          isServing: this.state.service.servingTeam === 'B',
          isWinner: this.state.winner === 'B',
        },
      },
      completedSets: this.state.completedSets.map((set) => ({ ...set })),
      isTieBreak: this.state.isTieBreak,
      isMatchOver: this.state.winner !== null,
      winner: this.state.winner,
    }
  }

  private rememberState(): void {
    this.history.push(cloneState(this.state))
  }

  private completeGame(team: TeamId): void {
    this.state.games[team] += 1
    this.state.points = emptyScore()
    this.state.service.servingTeam = otherTeam(this.state.service.servingTeam)

    if (winsSet(this.state.games, team)) {
      this.completeSet(team)
      return
    }

    if (
      this.state.games.A === TIE_BREAK_AT_GAMES &&
      this.state.games.B === TIE_BREAK_AT_GAMES
    ) {
      this.state.isTieBreak = true
      this.state.service.tieBreakInitialServer = this.state.service.servingTeam
    }
  }

  private completeTieBreak(team: TeamId): void {
    this.state.games[team] += 1
    const nextSetServer = this.state.service.tieBreakInitialServer
      ? otherTeam(this.state.service.tieBreakInitialServer)
      : this.state.service.servingTeam
    this.completeSet(team)
    this.state.service.servingTeam = nextSetServer
  }

  private completeSet(team: TeamId): void {
    this.state.completedSets.push({ ...this.state.games })
    this.state.sets[team] += 1
    this.state.games = emptyScore()
    this.state.points = emptyScore()
    this.state.isTieBreak = false
    this.state.service.tieBreakInitialServer = null

    if (
      this.format === 'REGULAR_MATCH' &&
      this.state.sets[team] === SETS_TO_WIN_MATCH
    ) {
      this.state.winner = team
    }
  }

  private validateCorrection(pointsA: number, pointsB: number): void {
    if (this.state.winner) {
      throw new Error('Le match est terminé.')
    }
    if (
      !Number.isInteger(pointsA) ||
      !Number.isInteger(pointsB) ||
      pointsA < 0 ||
      pointsB < 0
    ) {
      throw new Error(
        'Les points corrigés doivent être des entiers positifs ou nuls.',
      )
    }

    const corrected = { A: pointsA, B: pointsB }
    const correctionEndsCurrentGame = this.state.isTieBreak
      ? winsTieBreak(corrected, 'A') || winsTieBreak(corrected, 'B')
      : winsGame(corrected, 'A') || winsGame(corrected, 'B')

    if (correctionEndsCurrentGame) {
      throw new Error('La correction doit représenter un jeu encore en cours.')
    }
  }
}
