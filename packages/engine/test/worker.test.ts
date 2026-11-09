import { describe, expect, it } from 'vitest'
import { createEngine, EngineError, MemoryStore } from '../src'
import { connectEngine, exposeEngine } from '../src/worker'
import { KCI_XML, NAVER_JSON, OPENALEX_JSON } from './fixtures'

const fakeFetch = async (input: string) => {
  if ((input.startsWith('https://api.openalex.org') || input.includes('/openalex'))) return Response.json(OPENALEX_JSON)
  if (input.includes('/kci/')) return new Response(KCI_XML)
  return Response.json(NAVER_JSON)
}

describe('worker 연결 (MessageChannel)', () => {
  it('클라이언트 → 워커 엔진 호출과 오류 전달', async () => {
    const { port1, port2 } = new MessageChannel()
    exposeEngine(port1 as never, (o) => createEngine({ openAlexRetryDelaysMs: [0, 0], ...o, fetch: fakeFetch, store: new MemoryStore(), now: () => new Date('2026-11-08T12:00:00+09:00') }))
    const engine = connectEngine(port2 as never)

    // init 전 호출은 오류
    await expect(engine.suggestQuestions({ topic: '스마트폰 사용과 수면' })).rejects.toBeInstanceOf(EngineError)

    await engine.init({ relayBaseUrl: 'https://relay.test/', deviceId: 'device-test-0001' })
    const q = await engine.suggestQuestions({ topic: '스마트폰 사용이 청소년 수면에 미치는 영향' })
    expect(q.questions).toHaveLength(3)

    const r = await engine.runResearch({
      mode: 'search_only',
      topic: '스마트폰 사용이 청소년 수면에 미치는 영향',
      question: q.questions[0]!.text,
      keywords: q.keywords,
      sources: { kci: true, openalex: true, news: true },
      years: 10,
    })
    expect(r.papers.length).toBeGreaterThan(0)

    // EngineError 코드가 그대로 넘어온다
    await expect(engine.buildPackage({ researchId: r.researchId })).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' })
    port1.close()
    port2.close()
  })
})
