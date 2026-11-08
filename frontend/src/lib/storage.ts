import type { Draft, Query } from '../state'

// localStorage는 사생활 보호 모드나 공용 태블릿 정책으로 막힐 수 있으므로 항상 try/catch.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 저장 못 해도 앱은 동작해야 한다 */
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

const DEVICE_KEY = 'sr.deviceId'
const RECENT_KEY = 'sr.recent.v2'
const RECENT_MAX = 10
const DATA_VERSION_KEY = 'sr.dataVersion'
/** 저장 데이터 형식·출처가 바뀌면 올린다. 2026-11-09: 데모 → 실제 검색 전환 (데모 캐시의 가짜 논문 제거) */
export const DATA_VERSION = '2026-11-09-real-search'

/** 이전 버전에서 저장한 기록이면 true (한 번 비워야 함) */
export function needsDataReset(): boolean {
  return read(DATA_VERSION_KEY) !== DATA_VERSION
}
export function markDataVersion(): void {
  write(DATA_VERSION_KEY, DATA_VERSION)
}
export function clearRecentList(): void {
  remove(RECENT_KEY)
}

function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

let memoryDeviceId: string | null = null

/** 중계 함수 호출 제한용 임의 기기 ID. 학교 망은 IP를 공유하므로 IP 대신 쓴다. 개인 식별 정보 아님. */
export function getDeviceId(): string {
  const stored = read(DEVICE_KEY)
  if (stored) return stored
  if (!memoryDeviceId) {
    memoryDeviceId = randomId()
    write(DEVICE_KEY, memoryDeviceId)
  }
  return memoryDeviceId
}

/** 최근 리서치. 다시 열면 같은 조건으로 runResearch를 부르고, 엔진이 기기 캐시에서 꺼내 준다. */
export type RecentItem = Draft & Query & { at: string }

export function loadRecent(): RecentItem[] {
  const raw = read(RECENT_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? (parsed as RecentItem[]).filter((x) => x && typeof x.topic === 'string' && typeof x.question === 'string' && Array.isArray(x.keywords))
      : []
  } catch {
    return []
  }
}

export function addRecent(item: RecentItem) {
  const same = (x: RecentItem) => x.mode === item.mode && x.topic === item.topic && x.question === item.question
  write(RECENT_KEY, JSON.stringify([item, ...loadRecent().filter((x) => !same(x))].slice(0, RECENT_MAX)))
}

export function clearRecent() {
  remove(RECENT_KEY)
}
