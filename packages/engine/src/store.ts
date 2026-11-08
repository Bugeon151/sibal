// 기기 안 저장소. 브라우저에서는 IndexedDB, 테스트·비지원 환경에서는 메모리.
// 서버로 보내는 데이터는 없다.

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

type Entry<T> = { value: T; expiresAt: number }

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, Entry<unknown>>()
  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | undefined> {
    const e = this.map.get(key)
    if (!e) return undefined
    if (e.expiresAt <= this.now()) {
      this.map.delete(key)
      return undefined
    }
    return e.value as T
  }
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(key, { value, expiresAt: this.now() + ttlMs })
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key)
  }
  async clear(): Promise<void> {
    this.map.clear()
  }
}

const DB_NAME = 'suhaengcut'
const STORE = 'kv'

export class IndexedDbStore implements KeyValueStore {
  private dbPromise: Promise<IDBDatabase> | null = null
  constructor(private readonly now: () => number = Date.now) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.dbPromise
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async get<T>(key: string): Promise<T | undefined> {
    const e = await this.tx<Entry<T> | undefined>('readonly', (s) => s.get(key) as IDBRequest<Entry<T> | undefined>)
    if (!e) return undefined
    if (e.expiresAt <= this.now()) {
      await this.delete(key)
      return undefined
    }
    return e.value
  }
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.tx('readwrite', (s) => s.put({ value, expiresAt: this.now() + ttlMs }, key))
  }
  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key))
  }
  async clear(): Promise<void> {
    await this.tx('readwrite', (s) => s.clear())
  }
}

export function defaultStore(): KeyValueStore {
  return typeof indexedDB !== 'undefined' ? new IndexedDbStore() : new MemoryStore()
}
