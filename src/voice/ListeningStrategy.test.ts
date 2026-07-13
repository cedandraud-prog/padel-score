import { describe, expect, it } from 'vitest'
import { ListeningStrategyStore } from './ListeningStrategy'

class MemoryStorage {
  value: string | null = null
  getItem(): string | null {
    return this.value
  }
  setItem(_key: string, value: string): void {
    this.value = value
  }
}

describe('ListeningStrategyStore', () => {
  it('utilise CONTINUOUS par défaut', () => {
    expect(new ListeningStrategyStore(new MemoryStorage()).load()).toBe(
      'CONTINUOUS',
    )
  })

  it('mémorise le choix LEGACY', () => {
    const storage = new MemoryStorage()
    const store = new ListeningStrategyStore(storage)
    store.save('LEGACY')
    expect(store.load()).toBe('LEGACY')
  })
})
