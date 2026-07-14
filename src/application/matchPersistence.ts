import type { ScoreEngineSnapshot, SetScore } from '../core/matchTypes'
import type { FeedbackMode } from '../voice/speechTypes'
import type { MatchConfiguration } from './matchConfiguration'

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

export function copyMatchSessionSnapshot(
  snapshot: MatchSessionSnapshot,
): MatchSessionSnapshot {
  return cloneSerializable(snapshot)
}

export function copyMatchRecord(record: MatchRecord): MatchRecord {
  return cloneSerializable(record)
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
