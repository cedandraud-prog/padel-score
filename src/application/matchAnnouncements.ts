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

function spokenScoreNumber(value: number): string {
  return spokenNumber[value] ?? String(value)
}

function unit(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural
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
  if (A.games === B.games) {
    return `${spokenScoreNumber(A.games)} ${unit(A.games, 'jeu', 'jeux')} partout`
  }
  const leader = A.games > B.games ? A : B
  const follower = leader.id === 'A' ? B : A
  return `${leader.name} mène ${spokenScoreNumber(leader.games)} ${unit(leader.games, 'jeu', 'jeux')} à ${spokenScoreNumber(follower.games)}`
}

function setsAnnouncement(state: AnnounceableMatchState): string {
  const { A, B } = state.display.teams
  if (A.sets === B.sets) {
    return `égalité, ${spokenScoreNumber(A.sets)} ${unit(A.sets, 'set', 'sets')} partout`
  }
  const leader = A.sets > B.sets ? A : B
  const follower = leader.id === 'A' ? B : A
  return `${leader.name} mène ${spokenScoreNumber(leader.sets)} ${unit(leader.sets, 'set', 'sets')} à ${spokenScoreNumber(follower.sets)}`
}

function nextServerAnnouncement(state: AnnounceableMatchState): string {
  const server = (['A', 'B'] as const)
    .map((team) => state.display.teams[team])
    .find((team) => team.isServing)
  return server ? `Prochain service : ${server.name}` : ''
}

export interface FullScoreAnnouncementOptions {
  includeNextServer?: boolean
}

export function buildFullScoreAnnouncement(
  state: AnnounceableMatchState,
  options: FullScoreAnnouncementOptions = {},
): string {
  const parts = [
    setsAnnouncement(state),
    gamesAnnouncement(state),
    buildPointScoreAnnouncement(state),
  ]
  if (options.includeNextServer !== false) {
    parts.push(nextServerAnnouncement(state))
  }
  return parts.filter(Boolean).join('. ')
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
