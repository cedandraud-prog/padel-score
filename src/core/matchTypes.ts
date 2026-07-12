export type TeamId = 'A' | 'B'

export interface TeamNames {
  A: string
  B: string
}

export interface ScoreEngineOptions {
  teamNames?: Partial<TeamNames>
  servingTeam?: TeamId
  format?: MatchFormat
}

export type MatchFormat = 'FREE_PLAY' | 'REGULAR_MATCH'

export interface SetScore {
  A: number
  B: number
}

export interface MatchState {
  teams: TeamNames
  sets: SetScore
  games: SetScore
  points: SetScore
  completedSets: SetScore[]
  isTieBreak: boolean
  tieBreakInitialServer: TeamId | null
  servingTeam: TeamId
  winner: TeamId | null
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
