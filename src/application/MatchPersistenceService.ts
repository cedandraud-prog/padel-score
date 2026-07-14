import type {
  MatchRecord,
  MatchSessionSnapshot,
  MatchSetupDraftSnapshot,
} from './matchPersistence'
import type { MatchRepository } from './MatchRepository'

export type PersistenceErrorListener = (message: string) => void

export class MatchPersistenceService {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly repository: MatchRepository,
    private readonly onError: PersistenceErrorListener = () => undefined,
  ) {}

  loadActiveSession(): Promise<MatchSessionSnapshot | null> {
    return this.read(() => this.repository.getActiveSession(), null)
  }

  listMatches(): Promise<MatchRecord[]> {
    return this.read(() => this.repository.listMatches(), [])
  }

  getMatch(id: string): Promise<MatchRecord | null> {
    return this.read(() => this.repository.getMatch(id), null)
  }

  loadSetupDraft(): Promise<MatchSetupDraftSnapshot | null> {
    return this.read(() => this.repository.getSetupDraft(), null)
  }

  saveActiveSession(snapshot: MatchSessionSnapshot): Promise<boolean> {
    return this.write(() => this.repository.saveActiveSession(snapshot))
  }

  deleteActiveSession(): Promise<boolean> {
    return this.write(() => this.repository.deleteActiveSession())
  }

  saveSetupDraft(snapshot: MatchSetupDraftSnapshot): Promise<boolean> {
    return this.write(() => this.repository.saveSetupDraft(snapshot))
  }

  deleteSetupDraft(): Promise<boolean> {
    return this.write(() => this.repository.deleteSetupDraft())
  }

  archive(record: MatchRecord): Promise<boolean> {
    return this.write(async () => {
      await this.repository.saveMatch(record)
      await this.repository.deleteActiveSession()
    })
  }

  reopen(record: MatchRecord): Promise<boolean> {
    return this.write(() =>
      this.repository.saveActiveSession(record.reopenSnapshot),
    )
  }

  waitForIdle(): Promise<void> {
    return this.queue
  }

  private write(operation: () => Promise<void>): Promise<boolean> {
    const result = this.queue.then(operation).then(
      () => true,
      (error: unknown) => {
        this.report(error)
        return false
      },
    )
    this.queue = result.then(() => undefined)
    return result
  }

  private async read<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    await this.queue
    try {
      return await operation()
    } catch (error) {
      this.report(error)
      return fallback
    }
  }

  private report(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error)
    this.onError(
      `La sauvegarde locale est temporairement indisponible. ${detail}`,
    )
  }
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = globalThis.navigator?.storage
  if (!storage?.persist) return null
  try {
    return await storage.persist()
  } catch {
    return false
  }
}
