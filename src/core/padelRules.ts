import type { DisplayPoint, SetScore, TeamId } from './matchTypes'

export const GAMES_TO_WIN_SET = 6
export const TIE_BREAK_AT_GAMES = 6
export const TIE_BREAK_POINTS_TO_WIN = 7
export const SETS_TO_WIN_MATCH = 2

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A'
}

export function hasTwoPointLead(points: SetScore, team: TeamId): boolean {
  return points[team] - points[otherTeam(team)] >= 2
}

export function winsGame(points: SetScore, team: TeamId): boolean {
  return points[team] >= 4 && hasTwoPointLead(points, team)
}

export function winsTieBreak(points: SetScore, team: TeamId): boolean {
  return (
    points[team] >= TIE_BREAK_POINTS_TO_WIN && hasTwoPointLead(points, team)
  )
}

export function winsSet(games: SetScore, team: TeamId): boolean {
  const opponent = otherTeam(team)
  return games[team] >= GAMES_TO_WIN_SET && games[team] - games[opponent] >= 2
}

export function displayPoint(points: SetScore, team: TeamId): DisplayPoint {
  const opponent = otherTeam(team)

  if (points.A >= 3 && points.B >= 3) {
    if (points.A === points.B) return 'Égalité'
    return points[team] > points[opponent] ? 'Avantage' : '40'
  }

  return (['0', '15', '30', '40'] as const)[points[team]] ?? '40'
}

export function tieBreakServer(
  initialServer: TeamId,
  pointsPlayed: number,
): TeamId {
  if (pointsPlayed === 0) return initialServer
  const servingBlock = Math.floor((pointsPlayed - 1) / 2)
  return servingBlock % 2 === 0 ? otherTeam(initialServer) : initialServer
}
