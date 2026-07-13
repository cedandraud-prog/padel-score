export type ListeningStrategy = 'LEGACY' | 'CONTINUOUS'

const STORAGE_KEY = 'padel-score.listening-strategy'

interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class ListeningStrategyStore {
  constructor(private readonly storage: StorageAdapter | null) {}

  load(): ListeningStrategy {
    const value = this.storage?.getItem(STORAGE_KEY)
    return value === 'LEGACY' ? 'LEGACY' : 'CONTINUOUS'
  }

  save(strategy: ListeningStrategy): void {
    this.storage?.setItem(STORAGE_KEY, strategy)
  }
}

export function browserListeningStrategyStore(): ListeningStrategyStore {
  return new ListeningStrategyStore(
    typeof window === 'undefined' ? null : window.localStorage,
  )
}
