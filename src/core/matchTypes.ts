import type {
  CompletePlayerServiceOrder,
  PendingPlayerServiceOrder,
  PlayerId,
  PlayerParticipant,
} from './playerPlusService'

export type TeamId = 'A' | 'B'

export interface TeamNames {
  A: string
  B: string
}

export interface ScoreEngineOptions {
  teamNames?: Partial<TeamNames>
  servingTeam?: TeamId
  format?: MatchFormat
  playerPlus?: PlayerPlusScoreEngineConfiguration
}

export interface PlayerPlusScoreEngineConfiguration {
  participants: readonly PlayerParticipant[]
  firstServer: PlayerId
}

export type MatchFormat = 'FREE_PLAY' | 'REGULAR_MATCH'

export interface SetScore {
  A: number
  B: number
}

export interface PlayerServiceState {
  mode: 'PLAYER'
  servingTeam: TeamId
  tieBreakInitialServer: TeamId | null
}

export interface PlayerPlusFirstGameServiceState {
  mode: 'PLAYERS_PLUS'
  stage: 'FIRST_GAME'
  servingTeam: TeamId
  currentServer: PlayerId
  serviceOrder: PendingPlayerServiceOrder
}

export interface PlayerPlusAwaitingSecondServerServiceState {
  mode: 'PLAYERS_PLUS'
  stage: 'AWAITING_SECOND_SERVER'
  servingTeam: TeamId
  currentServer: null
  serviceOrder: PendingPlayerServiceOrder
}

export interface PlayerPlusCompleteServiceState {
  mode: 'PLAYERS_PLUS'
  stage: 'COMPLETE'
  servingTeam: TeamId
  currentServer: PlayerId
  serviceOrder: CompletePlayerServiceOrder
  currentOrderIndex: number
  tieBreakInitialServer: PlayerId | null
  tieBreakInitialOrderIndex: number | null
}

export type PlayerPlusServiceState =
  | PlayerPlusFirstGameServiceState
  | PlayerPlusAwaitingSecondServerServiceState
  | PlayerPlusCompleteServiceState

export type ServiceState = PlayerServiceState | PlayerPlusServiceState

export interface MatchState {
  teams: TeamNames
  sets: SetScore
  games: SetScore
  points: SetScore
  completedSets: SetScore[]
  isTieBreak: boolean
  service: ServiceState
  winner: TeamId | null
}

export interface ScoreEngineSnapshot {
  schemaVersion: 1
  format: MatchFormat
  state: MatchState
  history: MatchState[]
}

export type DisplayPoint =
  '0' | '15' | '30' | '40' | 'Égalité' | 'Avantage' | number

export interface DisplayTeamState {
  id: TeamId
  name: string
  sets: number
  games: number
  points: DisplayPoint
  isServing: boolean
  isWinner: boolean
}

export interface DisplayState {
  teams: Record<TeamId, DisplayTeamState>
  completedSets: SetScore[]
  isTieBreak: boolean
  isMatchOver: boolean
  winner: TeamId | null
}
