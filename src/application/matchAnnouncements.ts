import type { DisplayState, MatchState, TeamId } from '../core/matchTypes'

export interface AnnounceableMatchState {
  match: MatchState
  display: DisplayState
}

const spokenPoint: Record<string, string> = {
  '0': 'zéro',
  '15': 'quinze',
  '30': 'trente',
  '40': 'quarante',
}

const spokenNumber = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
  'vingt',
]

function pointValue(value: string | number): string {
  return typeof value === 'number'
    ? String(value)
    : (spokenPoint[value] ?? value)
}

function numericPoint(value: string | number): string {
  if (typeof value !== 'number') return pointValue(value)
  return spokenNumber[value] ?? String(value)
}

export function buildPointScoreAnnouncement(
  state: AnnounceableMatchState,
): string {
  const { A, B } = state.display.teams
  if (state.display.isTieBreak) {
    if (A.points === B.points) return `${numericPoint(A.points)} partout`
    return `${numericPoint(A.points)} ${numericPoint(B.points)}`
  }
  if (A.points === 'Égalité' && B.points === 'Égalité') return 'égalité'
  if (A.points === 'Avantage') return `avantage ${A.name}`
  if (B.points === 'Avantage') return `avantage ${B.name}`
  if (A.points === B.points) return `${pointValue(A.points)} partout`
  return `${pointValue(A.points)} ${pointValue(B.points)}`
}

function gamesAnnouncement(state: AnnounceableMatchState): string {
  const { A, B } = state.display.teams
  if (A.games === B.games) return `${A.games} jeux partout`
  const leader = A.games > B.games ? A : B
  const follower = leader.id === 'A' ? B : A
  return `${leader.name} mène ${leader.games} jeux à ${follower.games}`
}

function setsAnnouncement(state: AnnounceableMatchState): string {
  const { A, B } = state.display.teams
  return `${A.name} ${A.sets} set, ${B.name} ${B.sets} set`
}

export function buildFullScoreAnnouncement(
  state: AnnounceableMatchState,
): string {
  return `${setsAnnouncement(state)}. ${gamesAnnouncement(state)}. ${buildPointScoreAnnouncement(state)}`
}

export function buildTransitionAnnouncement(
  previous: AnnounceableMatchState,
  next: AnnounceableMatchState,
  scoringTeam: TeamId,
  options: { suppressMatchWinner?: boolean } = {},
): string {
  const teamName = next.display.teams[scoringTeam].name

  if (
    !options.suppressMatchWinner &&
    next.match.winner &&
    !previous.match.winner
  ) {
    return `victoire des ${teamName}. Score final, ${setsAnnouncement(next)}`
  }

  if (next.match.sets[scoringTeam] > previous.match.sets[scoringTeam]) {
    const setNumber = next.match.sets[scoringTeam]
    const ordinal = setNumber === 1 ? 'premier' : 'deuxième'
    return `${ordinal} set ${teamName}. ${setsAnnouncement(next)}`
  }

  if (!previous.match.isTieBreak && next.match.isTieBreak) {
    return `tie-break. ${buildPointScoreAnnouncement(next)}`
  }

  if (next.match.games[scoringTeam] > previous.match.games[scoringTeam]) {
    return `jeu ${teamName}. ${gamesAnnouncement(next)}`
  }

  return buildPointScoreAnnouncement(next)
}
