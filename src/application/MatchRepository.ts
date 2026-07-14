import {
  copyMatchRecord,
  copyMatchSetupDraft,
  copyMatchSessionSnapshot,
  type MatchRecord,
  type MatchSessionSnapshot,
  type MatchSetupDraftSnapshot,
} from './matchPersistence'

export interface MatchRepository {
  saveActiveSession(snapshot: MatchSessionSnapshot): Promise<void>
  getActiveSession(): Promise<MatchSessionSnapshot | null>
  deleteActiveSession(): Promise<void>
  saveMatch(record: MatchRecord): Promise<void>
  getMatch(id: string): Promise<MatchRecord | null>
  listMatches(): Promise<MatchRecord[]>
  saveSetupDraft(snapshot: MatchSetupDraftSnapshot): Promise<void>
  getSetupDraft(): Promise<MatchSetupDraftSnapshot | null>
  deleteSetupDraft(): Promise<void>
}

const DATABASE_NAME = 'padel-score'
const DATABASE_VERSION = 2
const ACTIVE_STORE = 'active-session'
const MATCH_STORE = 'matches'
const SETUP_STORE = 'setup-draft'
const ACTIVE_KEY = 'active'

interface StoredActiveSession {
  key: typeof ACTIVE_KEY
  snapshot: MatchSessionSnapshot
}

interface StoredSetupDraft {
  key: typeof ACTIVE_KEY
  snapshot: MatchSetupDraftSnapshot
}

export class IndexedDbMatchRepository implements MatchRepository {
  private databasePromise: Promise<IDBDatabase> | null = null

  constructor(private readonly factory: IDBFactory | undefined = indexedDb()) {}

  async saveActiveSession(snapshot: MatchSessionSnapshot): Promise<void> {
    const database = await this.database()
    await writeTransaction(database, ACTIVE_STORE, (store) => {
      store.put({
        key: ACTIVE_KEY,
        snapshot: copyMatchSessionSnapshot(snapshot),
      })
    })
  }

  async getActiveSession(): Promise<MatchSessionSnapshot | null> {
    const database = await this.database()
    const stored = await readRequest<StoredActiveSession | undefined>(
      database
        .transaction(ACTIVE_STORE, 'readonly')
        .objectStore(ACTIVE_STORE)
        .get(ACTIVE_KEY),
    )
    return stored ? copyMatchSessionSnapshot(stored.snapshot) : null
  }

  async deleteActiveSession(): Promise<void> {
    const database = await this.database()
    await writeTransaction(database, ACTIVE_STORE, (store) => {
      store.delete(ACTIVE_KEY)
    })
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    const database = await this.database()
    await writeTransaction(database, MATCH_STORE, (store) => {
      store.put(copyMatchRecord(record))
    })
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const database = await this.database()
    const record = await readRequest<MatchRecord | undefined>(
      database
        .transaction(MATCH_STORE, 'readonly')
        .objectStore(MATCH_STORE)
        .get(id),
    )
    return record ? copyMatchRecord(record) : null
  }

  async listMatches(): Promise<MatchRecord[]> {
    const database = await this.database()
    const records = await readRequest<MatchRecord[]>(
      database
        .transaction(MATCH_STORE, 'readonly')
        .objectStore(MATCH_STORE)
        .getAll(),
    )
    return records
      .map(copyMatchRecord)
      .sort((left, right) => right.closedAt.localeCompare(left.closedAt))
  }

  async saveSetupDraft(snapshot: MatchSetupDraftSnapshot): Promise<void> {
    const database = await this.database()
    await writeTransaction(database, SETUP_STORE, (store) => {
      store.put({ key: ACTIVE_KEY, snapshot: copyMatchSetupDraft(snapshot) })
    })
  }

  async getSetupDraft(): Promise<MatchSetupDraftSnapshot | null> {
    const database = await this.database()
    const stored = await readRequest<StoredSetupDraft | undefined>(
      database
        .transaction(SETUP_STORE, 'readonly')
        .objectStore(SETUP_STORE)
        .get(ACTIVE_KEY),
    )
    return stored ? copyMatchSetupDraft(stored.snapshot) : null
  }

  async deleteSetupDraft(): Promise<void> {
    const database = await this.database()
    await writeTransaction(database, SETUP_STORE, (store) => {
      store.delete(ACTIVE_KEY)
    })
  }

  private database(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new Error('Le stockage local est indisponible.'))
    }
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.factory)
    }
    return this.databasePromise
  }
}

export class InMemoryMatchRepository implements MatchRepository {
  private active: MatchSessionSnapshot | null = null
  private setupDraft: MatchSetupDraftSnapshot | null = null
  private readonly matches = new Map<string, MatchRecord>()

  async saveActiveSession(snapshot: MatchSessionSnapshot): Promise<void> {
    this.active = copyMatchSessionSnapshot(snapshot)
  }

  async getActiveSession(): Promise<MatchSessionSnapshot | null> {
    return this.active ? copyMatchSessionSnapshot(this.active) : null
  }

  async deleteActiveSession(): Promise<void> {
    this.active = null
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    this.matches.set(record.id, copyMatchRecord(record))
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const record = this.matches.get(id)
    return record ? copyMatchRecord(record) : null
  }

  async listMatches(): Promise<MatchRecord[]> {
    return [...this.matches.values()]
      .map(copyMatchRecord)
      .sort((left, right) => right.closedAt.localeCompare(left.closedAt))
  }

  async saveSetupDraft(snapshot: MatchSetupDraftSnapshot): Promise<void> {
    this.setupDraft = copyMatchSetupDraft(snapshot)
  }

  async getSetupDraft(): Promise<MatchSetupDraftSnapshot | null> {
    return this.setupDraft ? copyMatchSetupDraft(this.setupDraft) : null
  }

  async deleteSetupDraft(): Promise<void> {
    this.setupDraft = null
  }
}

function indexedDb(): IDBFactory | undefined {
  return typeof globalThis.indexedDB === 'undefined'
    ? undefined
    : globalThis.indexedDB
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ACTIVE_STORE)) {
        database.createObjectStore(ACTIVE_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(MATCH_STORE)) {
        database.createObjectStore(MATCH_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(SETUP_STORE)) {
        database.createObjectStore(SETUP_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Ouverture IndexedDB impossible.'))
  })
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Lecture IndexedDB impossible.'))
  })
}

function writeTransaction(
  database: IDBDatabase,
  storeName: string,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Écriture IndexedDB impossible.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Écriture IndexedDB annulée.'))
    operation(transaction.objectStore(storeName))
  })
}
