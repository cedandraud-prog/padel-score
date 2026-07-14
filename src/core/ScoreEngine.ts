import type {
  DisplayState,
  MatchState,
  PlayerPlusCompleteServiceState,
  ScoreEngineOptions,
  ServiceState,
  SetScore,
  TeamId,
  TeamNames,
} from './matchTypes'
import {
  cloneCompletePlayerServiceOrder,
  clonePendingPlayerServiceOrder,
  completePlayerServiceOrder,
  initializePlayerServiceOrder,
  isPlayerId,
  playerServiceOrderIndex,
  playerTeam,
  reanchorPlayerServiceOrder,
  tieBreakPlayerServiceOffset,
  type PlayerId,
} from './playerPlusService'
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
    service: cloneServiceState(state.service),
    completedSets: state.completedSets.map((set) => ({ ...set })),
  }
}

function cloneServiceState(service: ServiceState): ServiceState {
  if (service.mode === 'PLAYER') return { ...service }

  if (service.stage === 'COMPLETE') {
    return {
      ...service,
      serviceOrder: cloneCompletePlayerServiceOrder(service.serviceOrder),
    }
  }

  return {
    ...service,
    serviceOrder: clonePendingPlayerServiceOrder(service.serviceOrder),
  }
}

function createState(options: ScoreEngineOptions = {}): MatchState {
  const service: ServiceState = options.playerPlus
    ? createPlayerPlusService(options.playerPlus)
    : {
        mode: 'PLAYER',
        tieBreakInitialServer: null,
        servingTeam: options.servingTeam ?? 'A',
      }

  return {
    teams: { ...DEFAULT_TEAMS, ...options.teamNames },
    sets: emptyScore(),
    games: emptyScore(),
    points: emptyScore(),
    completedSets: [],
    isTieBreak: false,
    service,
    winner: null,
  }
}

function createPlayerPlusService(
  options: NonNullable<ScoreEngineOptions['playerPlus']>,
): ServiceState {
  const serviceOrder = initializePlayerServiceOrder(
    options.participants,
    options.firstServer,
  )
  return {
    mode: 'PLAYERS_PLUS',
    stage: 'FIRST_GAME',
    servingTeam: serviceOrder.firstServingTeam,
    currentServer: serviceOrder.firstServer,
    serviceOrder,
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
      playerPlus: options.playerPlus,
    })
    this.format = options.format ?? this.format
  }

  awardPoint(team: TeamId): void {
    if (this.state.winner) {
      throw new Error('Le match est terminé.')
    }

    if (
      this.state.service.mode === 'PLAYERS_PLUS' &&
      this.state.service.stage === 'AWAITING_SECOND_SERVER'
    ) {
      throw new Error(
        'Le serveur du deuxième jeu doit être validé avant de reprendre le score.',
      )
    }

    this.rememberState()
    this.state.points[team] += 1

    if (this.state.isTieBreak) {
      if (winsTieBreak(this.state.points, team)) {
        this.completeTieBreak(team)
        return
      }

      this.updateTieBreakServer()
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
    if (
      this.state.service.mode === 'PLAYERS_PLUS' &&
      this.state.service.stage === 'AWAITING_SECOND_SERVER'
    ) {
      throw new Error(
        'Le serveur du deuxième jeu doit être validé avant de reprendre le score.',
      )
    }
    this.validateCorrection(pointsA, pointsB)
    this.rememberState()
    this.state.points = { A: pointsA, B: pointsB }

    if (this.state.isTieBreak) this.updateTieBreakServer()
  }

  correctServingTeam(team: TeamId): boolean {
    if (team !== 'A' && team !== 'B') {
      throw new Error("L'équipe au service est invalide.")
    }
    if (this.state.winner) {
      throw new Error('Le match est terminé.')
    }
    if (this.state.service.mode !== 'PLAYER') {
      throw new Error(
        'Le serveur PLAYER+ doit être corrigé avec son identifiant joueur.',
      )
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

  confirmSecondServer(secondServer: PlayerId): void {
    const service = this.state.service
    if (
      service.mode !== 'PLAYERS_PLUS' ||
      service.stage !== 'AWAITING_SECOND_SERVER'
    ) {
      throw new Error(
        'Le second serveur peut uniquement être validé avant le deuxième jeu PLAYER+.',
      )
    }

    const completeOrder = completePlayerServiceOrder(
      service.serviceOrder,
      secondServer,
    )
    this.rememberState()
    this.state.service = {
      mode: 'PLAYERS_PLUS',
      stage: 'COMPLETE',
      servingTeam: playerTeam(secondServer),
      currentServer: secondServer,
      serviceOrder: completeOrder,
      currentOrderIndex: 1,
      tieBreakInitialServer: null,
      tieBreakInitialOrderIndex: null,
    }
  }

  correctPlayerServer(playerId: PlayerId): boolean {
    if (!isPlayerId(playerId)) {
      throw new Error('Le serveur PLAYER+ doit être un identifiant canonique.')
    }
    if (this.state.winner) throw new Error('Le match est terminé.')

    const service = this.state.service
    if (service.mode !== 'PLAYERS_PLUS') {
      throw new Error('La correction individuelle est réservée à PLAYER+.')
    }
    if (service.stage === 'AWAITING_SECOND_SERVER') {
      throw new Error(
        'Le second serveur doit être validé avant toute correction.',
      )
    }
    if (service.currentServer === playerId) return false
    if (playerTeam(playerId) !== service.servingTeam) {
      throw new Error(
        'Le serveur corrigé doit appartenir à l’équipe actuellement au service.',
      )
    }

    this.rememberState()
    if (service.stage === 'FIRST_GAME') {
      const serviceOrder = initializePlayerServiceOrder(
        service.serviceOrder.participants,
        playerId,
      )
      this.state.service = {
        ...service,
        currentServer: playerId,
        serviceOrder,
      }
      return true
    }

    const correctedOrder = reanchorPlayerServiceOrder(
      service.serviceOrder,
      service.currentOrderIndex,
      playerId,
    )
    this.state.service = this.withCurrentPlayer(service, correctedOrder)
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
    this.advanceServiceAfterGame()

    if (winsSet(this.state.games, team)) {
      this.completeSet(team)
      return
    }

    if (
      this.state.games.A === TIE_BREAK_AT_GAMES &&
      this.state.games.B === TIE_BREAK_AT_GAMES
    ) {
      this.state.isTieBreak = true
      const service = this.state.service
      if (service.mode === 'PLAYER') {
        service.tieBreakInitialServer = service.servingTeam
      } else if (service.stage === 'COMPLETE') {
        service.tieBreakInitialServer = service.currentServer
        service.tieBreakInitialOrderIndex = service.currentOrderIndex
      }
    }
  }

  private completeTieBreak(team: TeamId): void {
    this.state.games[team] += 1
    const service = this.state.service
    if (service.mode === 'PLAYER') {
      const nextSetServer = service.tieBreakInitialServer
        ? otherTeam(service.tieBreakInitialServer)
        : service.servingTeam
      this.completeSet(team)
      this.state.service.servingTeam = nextSetServer
      return
    }

    if (
      service.stage !== 'COMPLETE' ||
      service.tieBreakInitialOrderIndex === null
    ) {
      throw new Error('L’ordre de service PLAYER+ du tie-break est incomplet.')
    }
    const nextSetOrderIndex = playerServiceOrderIndex(
      service.tieBreakInitialOrderIndex,
      1,
    )
    this.completeSet(team)
    const nextService = this.state.service
    if (
      nextService.mode !== 'PLAYERS_PLUS' ||
      nextService.stage !== 'COMPLETE'
    ) {
      throw new Error('L’ordre de service PLAYER+ est indisponible.')
    }
    this.state.service = this.withCurrentPlayer(
      nextService,
      nextService.serviceOrder,
      nextSetOrderIndex,
    )
  }

  private completeSet(team: TeamId): void {
    this.state.completedSets.push({ ...this.state.games })
    this.state.sets[team] += 1
    this.state.games = emptyScore()
    this.state.points = emptyScore()
    this.state.isTieBreak = false
    if (this.state.service.mode === 'PLAYER') {
      this.state.service.tieBreakInitialServer = null
    } else if (this.state.service.stage === 'COMPLETE') {
      this.state.service.tieBreakInitialServer = null
      this.state.service.tieBreakInitialOrderIndex = null
    }

    if (
      this.format === 'REGULAR_MATCH' &&
      this.state.sets[team] === SETS_TO_WIN_MATCH
    ) {
      this.state.winner = team
    }
  }

  private advanceServiceAfterGame(): void {
    const service = this.state.service
    if (service.mode === 'PLAYER') {
      service.servingTeam = otherTeam(service.servingTeam)
      return
    }

    if (service.stage === 'FIRST_GAME') {
      this.state.service = {
        mode: 'PLAYERS_PLUS',
        stage: 'AWAITING_SECOND_SERVER',
        servingTeam: otherTeam(service.servingTeam),
        currentServer: null,
        serviceOrder: service.serviceOrder,
      }
      return
    }
    if (service.stage === 'AWAITING_SECOND_SERVER') {
      throw new Error('Le second serveur PLAYER+ doit être validé.')
    }

    this.state.service = this.withCurrentPlayer(
      service,
      service.serviceOrder,
      playerServiceOrderIndex(service.currentOrderIndex, 1),
    )
  }

  private updateTieBreakServer(): void {
    const service = this.state.service
    const pointsPlayed = this.state.points.A + this.state.points.B
    if (service.mode === 'PLAYER') {
      if (service.tieBreakInitialServer) {
        service.servingTeam = tieBreakServer(
          service.tieBreakInitialServer,
          pointsPlayed,
        )
      }
      return
    }

    if (
      service.stage !== 'COMPLETE' ||
      service.tieBreakInitialOrderIndex === null
    ) {
      throw new Error('L’ordre de service PLAYER+ du tie-break est incomplet.')
    }
    const currentOrderIndex = playerServiceOrderIndex(
      service.tieBreakInitialOrderIndex,
      tieBreakPlayerServiceOffset(pointsPlayed),
    )
    this.state.service = this.withCurrentPlayer(
      service,
      service.serviceOrder,
      currentOrderIndex,
    )
  }

  private withCurrentPlayer(
    service: PlayerPlusCompleteServiceState,
    serviceOrder = service.serviceOrder,
    currentOrderIndex = service.currentOrderIndex,
  ): PlayerPlusCompleteServiceState {
    const normalizedIndex = playerServiceOrderIndex(currentOrderIndex)
    const currentServer = serviceOrder.order[normalizedIndex]
    const tieBreakInitialServer =
      service.tieBreakInitialOrderIndex === null
        ? null
        : serviceOrder.order[service.tieBreakInitialOrderIndex]

    return {
      ...service,
      serviceOrder,
      currentOrderIndex: normalizedIndex,
      currentServer,
      servingTeam: playerTeam(currentServer),
      tieBreakInitialServer,
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
