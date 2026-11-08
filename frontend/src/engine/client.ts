// 화면 → 처리 엔진(Web Worker) 호출. 화면은 이 파일의 `engine`만 쓴다.
import type { Engine } from '@suhaengcut/engine'
import { getDeviceId } from '../lib/storage'
import type { CallMessage, EngineFn, ErrorPayload, InitMessage, ReplyMessage } from './protocol'

/** 엔진 오류. message는 학생에게 그대로 보여줄 수 있는 문구. */
export class UiError extends Error {
  constructor(
    readonly code: ErrorPayload['code'],
    message: string,
  ) {
    super(message)
    this.name = 'UiError'
  }
}

export function toUiError(e: unknown): UiError {
  return e instanceof UiError ? e : new UiError('UNKNOWN', '처리하다 문제가 생겼어요. 다시 시도해 주세요.')
}

const relayUrl = import.meta.env.VITE_RELAY_URL?.trim() || null

/**
 * 검색 범위
 * - 'full': 중계 함수가 있어 국내 논문·해외 논문·뉴스 모두 실제 검색
 * - 'openalex': 중계 함수가 아직 없어 해외 논문(OpenAlex)만 실제 검색 (키가 필요 없음)
 * - 'demo': VITE_DEMO=true. 엔진 테스트용 예시 자료로 동작 (개발용)
 */
export const scope: 'full' | 'openalex' | 'demo' =
  import.meta.env.VITE_DEMO === 'true' ? 'demo' : relayUrl ? 'full' : 'openalex'
export const isDemo = scope === 'demo'
/** 국내 논문·뉴스를 검색할 수 있는지 (중계 함수가 있거나 데모) */
export const relayReady = scope !== 'openalex'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'engine' })
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: UiError) => void }>()
let seq = 0

worker.postMessage({
  type: 'init',
  relayBaseUrl: relayUrl,
  demo: isDemo,
  deviceId: getDeviceId(),
  openAlexDirect: import.meta.env.VITE_OPENALEX_DIRECT === 'true',
} satisfies InitMessage)

worker.onmessage = (e: MessageEvent<ReplyMessage>) => {
  const msg = e.data
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (msg.ok) p.resolve(msg.value)
  else p.reject(new UiError(msg.error.code, msg.error.message))
}

worker.onerror = (e) => {
  console.error('[engine worker]', e.message)
  const err = new UiError('UNKNOWN', '처리 엔진을 불러오지 못했어요. 페이지를 새로고침해 주세요.')
  for (const p of pending.values()) p.reject(err)
  pending.clear()
}

function call<K extends EngineFn>(fn: K, arg: Parameters<Engine[K]>[0]): Promise<Awaited<ReturnType<Engine[K]>>> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker.postMessage({ type: 'call', id, fn, arg } satisfies CallMessage)
  })
}

export const engine = {
  suggestQuestions: (a: Parameters<Engine['suggestQuestions']>[0]) => call('suggestQuestions', a),
  runResearch: (a: Parameters<Engine['runResearch']>[0]) => call('runResearch', a),
  checkSentences: (a: Parameters<Engine['checkSentences']>[0]) => call('checkSentences', a),
  buildPackage: (a: Parameters<Engine['buildPackage']>[0]) => call('buildPackage', a),
  buildDisclosure: (a: Parameters<Engine['buildDisclosure']>[0]) => call('buildDisclosure', a),
  buildReferences: (a: Parameters<Engine['buildReferences']>[0]) => call('buildReferences', a),
  clearAll: () => call('clearAll', undefined as never),
}
