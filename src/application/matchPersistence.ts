import type { ScoreEngineSnapshot, SetScore } from '../core/matchTypes'
import type { FeedbackMode } from '../voice/speechTypes'
import type {
  MatchConfiguration,
  PlayerMatchConfiguration,
} from './matchConfiguration'
import type {
  PlayerPlusConfigurationDraft,
  SetupMode,
} from './setupConfiguration'

export const MATCH_PERSISTENCE_SCHEMA_VERSION = 1 as const

export interface PersistedCurrentScore {
  sets: SetScore
  games: SetScore
  points: SetScore
  isTieBreak: boolean
}

export interface MatchSessionSnapshot {
  schemaVersion: typeof MATCH_PERSISTENCE_SCHEMA_VERSION
  id: string
  status: 'IN_PROGRESS'
  mode: MatchConfiguration['mode']
  configuration: MatchConfiguration
  createdAt: string
  startedAt: string
  updatedAt: string
  engine: ScoreEngineSnapshot
  completedSets: SetScore[]
  currentScore: PersistedCurrentScore
  application: {
    feedbackMode: FeedbackMode
    actionCount: number
  }
}

export interface MatchRecord {
  schemaVersion: typeof MATCH_PERSISTENCE_SCHEMA_VERSION
  id: string
  status: 'FINISHED' | 'ABANDONED'
  mode: MatchConfiguration['mode']
  configuration: MatchConfiguration
  createdAt: string
  startedAt: string
  updatedAt: string
  closedAt: string
  durationMs: number
  completedSets: SetScore[]
  finalScore: PersistedCurrentScore
  engine: ScoreEngineSnapshot
  reopenSnapshot: MatchSessionSnapshot
}

export interface MatchSetupDraftSnapshot {
  schemaVersion: typeof MATCH_PERSISTENCE_SCHEMA_VERSION
  mode: SetupMode
  player: PlayerMatchConfiguration
  playerPlus: PlayerPlusConfigurationDraft
  updatedAt: string
}

export function isMatchSetupDraftSnapshot(
  value: unknown,
): value is MatchSetupDraftSnapshot {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<MatchSetupDraftSnapshot>
  if (
    draft.schemaVersion !== MATCH_PERSISTENCE_SCHEMA_VERSION ||
    (draft.mode !== 'PLAYER' && draft.mode !== 'PLAYERS_PLUS') ||
    !isPlayerDraft(draft.player) ||
    !isPlayerPlusDraft(draft.playerPlus) ||
    typeof draft.updatedAt !== 'string'
  ) {
    return false
  }
  return true
}

export function copyMatchSessionSnapshot(
  snapshot: MatchSessionSnapshot,
): MatchSessionSnapshot {
  return cloneSerializable(snapshot)
}

export function copyMatchRecord(record: MatchRecord): MatchRecord {
  return cloneSerializable(record)
}

export function copyMatchSetupDraft(
  snapshot: MatchSetupDraftSnapshot,
): MatchSetupDraftSnapshot {
  return cloneSerializable(snapshot)
}

export function createMatchRecord(
  session: MatchSessionSnapshot,
  status: MatchRecord['status'],
  closedAt = new Date().toISOString(),
): MatchRecord {
  const closedTime = Date.parse(closedAt)
  const startedTime = Date.parse(session.startedAt)
  return {
    schemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
    id: session.id,
    status,
    mode: session.mode,
    configuration: cloneSerializable(session.configuration),
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    updatedAt: closedAt,
    closedAt,
    durationMs:
      Number.isFinite(closedTime) && Number.isFinite(startedTime)
        ? Math.max(0, closedTime - startedTime)
        : 0,
    completedSets: cloneSerializable(session.completedSets),
    finalScore: cloneSerializable(session.currentScore),
    engine: cloneSerializable(session.engine),
    reopenSnapshot: copyMatchSessionSnapshot(session),
  }
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isConfiguredTeam(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const team = value as { displayName?: unknown; voiceName?: unknown }
  return (
    typeof team.displayName === 'string' && typeof team.voiceName === 'string'
  )
}

function isPlayerDraft(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<PlayerMatchConfiguration>
  return (
    draft.mode === 'PLAYER' &&
    isConfiguredTeam(draft.teamA) &&
    isConfiguredTeam(draft.teamB) &&
    (draft.servingTeam === 'A' || draft.servingTeam === 'B')
  )
}

function isPlayerPlusDraft(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<PlayerPlusConfigurationDraft>
  if (draft.mode !== 'PLAYERS_PLUS') return false
  return (['teamA', 'teamB'] as const).every((key, teamIndex) => {
    const team = draft[key as 'teamA' | 'teamB']
    const prefix = teamIndex === 0 ? 'A' : 'B'
    return (
      isConfiguredTeam(team) &&
      typeof team?.customDisplayName === 'boolean' &&
      Array.isArray(team.players) &&
      team.players.length === 2 &&
      team.players.every(
        (player, playerIndex) =>
          player.id === `${prefix}${playerIndex + 1}` &&
          typeof player.name === 'string' &&
          player.side === (playerIndex === 0 ? 'LEFT' : 'RIGHT'),
      )
    )
  })
}
