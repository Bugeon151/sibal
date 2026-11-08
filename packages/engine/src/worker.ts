// Web Worker 연결. 엔진은 워커 안에서 돌고, 화면은 같은 함수 모양의 클라이언트로 부른다.
//
// 워커 파일 (예: engine.worker.ts):
//   import { exposeEngine } from '@suhaengcut/engine/worker'
//   exposeEngine(self)
//
// 화면:
//   import { connectEngine } from '@suhaengcut/engine/worker'
//   const engine = connectEngine(new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }))
//   await engine.init({ relayBaseUrl, deviceId })
//   const r = await engine.runResearch({...})

import { createEngine, type Engine, type EngineOptions } from './engine'
import { EngineError, type EngineErrorCode } from './errors'

/** 워커 밖에서 넘길 수 있는 설정 (함수·저장소 객체는 워커 안에서 기본값 사용) */
export type WorkerInitOptions = Pick<EngineOptions, 'relayBaseUrl' | 'deviceId' | 'openAlexRoute'>

const METHODS = ['suggestQuestions', 'runResearch', 'checkSentences', 'buildPackage', 'buildDisclosure', 'buildReferences', 'clearAll'] as const
type Method = (typeof METHODS)[number]

type Request = { id: number; method: Method | 'init'; arg?: unknown }
type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: { code: EngineErrorCode; message: string } }

export type PortLike = {
  postMessage(message: unknown): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (e: MessageEvent) => void): void
}

export function exposeEngine(port: PortLike, makeEngine: (o: WorkerInitOptions) => Engine = (o) => createEngine(o)): void {
  let engine: Engine | null = null
  port.addEventListener('message', async (e: MessageEvent) => {
    const { id, method, arg } = e.data as Request
    const reply = (r: Response) => port.postMessage(r)
    try {
      if (method === 'init') {
        engine = makeEngine(arg as WorkerInitOptions)
        reply({ id, ok: true, result: null })
        return
      }
      if (!engine) throw new EngineError('INVALID_INPUT', '엔진이 아직 준비되지 않았어요.')
      if (!(METHODS as readonly string[]).includes(method)) throw new EngineError('INVALID_INPUT')
      const fn = engine[method] as (a: unknown) => Promise<unknown>
      reply({ id, ok: true, result: await fn(arg) })
    } catch (err) {
      const code: EngineErrorCode = err instanceof EngineError ? err.code : 'SOURCES_DOWN'
      const message = err instanceof EngineError ? err.message : '잠시 문제가 생겼어요. 다시 시도해 주세요.'
      reply({ id, ok: false, error: { code, message } })
    }
  })
  // MessagePort는 start()가 필요하다 (Worker의 self는 필요 없음)
  ;(port as { start?: () => void }).start?.()
}

export type EngineClient = { init(o: WorkerInitOptions): Promise<void> } & {
  [M in Method]: (arg: Parameters<Engine[M]>[0]) => ReturnType<Engine[M]>
}

export function connectEngine(port: PortLike): EngineClient {
  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  port.addEventListener('message', (e: MessageEvent) => {
    const r = e.data as Response
    const p = pending.get(r.id)
    if (!p) return
    pending.delete(r.id)
    if (r.ok) p.resolve(r.result)
    else p.reject(new EngineError(r.error.code, r.error.message))
  })
  // 워커가 죽거나 메시지를 못 읽으면 기다리던 호출을 모두 실패로 끝낸다 (무한 대기 방지)
  const failAll = () => {
    for (const [id, p] of pending) {
      pending.delete(id)
      p.reject(new EngineError('SOURCES_DOWN', '잠시 문제가 생겼어요. 페이지를 새로고침해 주세요.'))
    }
  }
  port.addEventListener('error', failAll)
  port.addEventListener('messageerror', failAll)
  ;(port as { start?: () => void }).start?.()

  const call = (method: Method | 'init', arg?: unknown) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      port.postMessage({ id, method, arg } satisfies Request)
    })

  const client = { init: (o: WorkerInitOptions) => call('init', o).then(() => undefined) } as Record<string, unknown>
  for (const m of METHODS) client[m] = (arg: unknown) => call(m, arg)
  return client as EngineClient
}
