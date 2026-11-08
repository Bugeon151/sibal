/// <reference lib="webworker" />
// 처리 엔진을 Web Worker에서 돌린다. 화면 스레드가 계산 때문에 멈추지 않게.
import { createEngine, EngineError, type Engine } from '@suhaengcut/engine'
import { DEMO_RELAY, demoFetch } from './demo'
import type { CallMessage, InitMessage, ReplyMessage } from './protocol'

declare const self: DedicatedWorkerGlobalScope

let engine: Engine | null = null

function uuid(): string {
  // http(비보안) 출처에서는 crypto.randomUUID가 없다
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

function reply(msg: ReplyMessage) {
  self.postMessage(msg)
}

self.onmessage = async (e: MessageEvent<InitMessage | CallMessage>) => {
  const msg = e.data
  if (msg.type === 'init') {
    const demo = msg.relayBaseUrl === null
    engine = createEngine({
      relayBaseUrl: demo ? DEMO_RELAY : msg.relayBaseUrl!,
      fetch: demo ? demoFetch : undefined,
      deviceId: msg.deviceId,
      // 기본 'auto': OpenAlex는 브라우저에서 키 없이 직접 → 막히면 중계 함수로 (VITE_OPENALEX_DIRECT=true면 직접만)
      openAlexRoute: !demo && msg.openAlexDirect ? 'direct' : 'auto',
      uuid,
    })
    return
  }

  if (!engine) {
    reply({ id: msg.id, ok: false, error: { code: 'UNKNOWN', message: '아직 준비 중이에요. 잠깐 뒤에 다시 눌러 주세요.' } })
    return
  }
  try {
    const fn = engine[msg.fn] as (arg: unknown) => Promise<unknown>
    const value = await fn(msg.arg)
    reply({ id: msg.id, ok: true, value })
  } catch (err) {
    if (err instanceof EngineError) {
      reply({ id: msg.id, ok: false, error: { code: err.code, message: err.message } })
    } else {
      console.error('[engine]', err)
      reply({ id: msg.id, ok: false, error: { code: 'UNKNOWN', message: '처리하다 문제가 생겼어요. 다시 시도해 주세요.' } })
    }
  }
}
