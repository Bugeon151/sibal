import { describe, expect, it } from 'vitest'
import { createEngine, EngineError, MemoryStore } from '../src'
import { FORBIDDEN_REQUESTS } from '../src/features/templates'
import { parseKciXml } from '../src/sources/kci'
import { parseOpenAlexWork, reconstructAbstract } from '../src/sources/openalex'
import { KCI_XML, NAVER_JSON, OPENALEX_JSON } from './fixtures'

const RELAY = 'https://relay.test/'
const NOW = new Date('2026-11-08T12:00:00+09:00')

type Calls = string[]

function fakeFetch(calls: Calls, fail: Partial<Record<'kci' | 'openalex' | 'news', number | 'network'>> = {}) {
  return async (input: string): Promise<Response> => {
    calls.push(input)
    const which = (input.startsWith('https://api.openalex.org') || input.includes('/openalex')) ? 'openalex' : input.includes('/kci/') ? 'kci' : input.includes('/news') ? 'news' : null
    if (!which) throw new Error(`unexpected url ${input}`)
    const f = fail[which]
    if (f === 'network') throw new TypeError('Failed to fetch')
    if (typeof f === 'number') return new Response('err', { status: f })
    if (which === 'kci') return new Response(KCI_XML, { headers: { 'content-type': 'application/xml' } })
    if (which === 'openalex') return Response.json(OPENALEX_JSON)
    return Response.json(NAVER_JSON)
  }
}

function makeEngine(calls: Calls = [], fail = {}) {
  let n = 0
  return createEngine({
    relayBaseUrl: RELAY,
    fetch: fakeFetch(calls, fail),
    store: new MemoryStore(() => NOW.getTime()),
    now: () => NOW,
    uuid: () => `id-${++n}`,
  })
}

const baseInput = {
  mode: 'ai' as const,
  topic: '스마트폰 사용이 청소년 수면에 미치는 영향',
  question: '스마트폰 사용은 청소년 수면에 어떤 영향을 미치는가?',
  keywords: ['스마트폰', '청소년', '수면'],
  sources: { kci: true, openalex: true, news: true },
  years: 10 as const,
}

describe('sources', () => {
  it('KCI XML: 한·영을 내용으로 구분하고 연도·초록 없는 레코드도 파싱', () => {
    const { papers, total } = parseKciXml(KCI_XML)
    expect(total).toBe(3)
    expect(papers).toHaveLength(3)
    const p = papers[0]!
    expect(p.sourceId).toBe('ART0001')
    expect(p.title).toBe('청소년의 스마트폰 사용 시간과 수면의 관계')
    expect(p.year).toBe(2023)
    expect(p.journal).toBe('한국청소년연구')
    expect(p.authors).toEqual(['김민수', '이지은'])
    expect(p.abstract.startsWith('본 연구는')).toBe(true)
    expect(p.keywordsKo).toEqual(['스마트폰', '수면', '청소년'])
    expect(p.keywordsEn).toEqual(['smartphone', 'sleep', 'adolescent'])
    expect(p.doi).toBe('10.1000/kci.0001')
  })
  it('OpenAlex: 역색인 초록 복원, paratext 제외', () => {
    expect(reconstructAbstract({ world: [1], Hello: [0] })).toBe('Hello world')
    const works = OPENALEX_JSON.results.map((w) => parseOpenAlexWork(w as never))
    expect(works[2]).toBeNull()
    expect(works[0]!.doi).toBe('10.2000/oa.1')
    expect(works[0]!.isOa).toBe(true)
  })
})

describe('engine', () => {
  it('suggestQuestions: 영향형 주제 → 질문 3개 + 키워드', async () => {
    const e = makeEngine()
    const r = await e.suggestQuestions({ topic: '스마트폰 사용이 청소년 수면에 미치는 영향' })
    expect(r.questions.map((q) => q.text)).toEqual([
      '스마트폰 사용은 청소년 수면에 어떤 영향을 미치는가?',
      '스마트폰 사용과 청소년 수면의 관계는 어떠한가?',
      '청소년 수면에 영향을 주는 스마트폰 사용 외의 요인은 무엇인가?',
    ])
    expect(r.keywords).toEqual(['스마트폰', '사용', '청소년', '수면'])
  })

  it('runResearch: 세 소스를 합치고 중복 제거·선별·요약·비교표를 만든다', async () => {
    const calls: Calls = []
    const e = makeEngine(calls)
    const r = await e.runResearch(baseInput)

    expect(r.sourceStatus).toEqual({ kci: 'ok', openalex: 'ok', news: 'ok' })
    // KCI·OpenAlex에 같은 DOI 논문 → 1편으로 합쳐짐
    const titles = r.papers.map((p) => p.title)
    expect(titles.filter((t) => t === '청소년의 스마트폰 사용 시간과 수면의 관계')).toHaveLength(1)
    expect(r.papers.length).toBeGreaterThanOrEqual(3)
    // 초록 없는 논문은 빠지거나 맨 뒤 (여기서는 초록 있는 논문이 3편이라 선별되지 않음)
    const noAbs = r.papers.findIndex((p) => p.title === '초록 없는 오래된 논문')
    expect(noAbs === -1 || noAbs === r.papers.length - 1).toBe(true)
    expect(r.papers.every((p) => p.sentences.length >= 2)).toBe(true)
    // 모든 서지는 검색 결과에서 온다
    const known = new Set(['청소년의 스마트폰 사용 시간과 수면의 관계', '고등학생의 수면 부족과 학업 스트레스', '초록 없는 오래된 논문', 'Smartphone use and sleep duration in adolescents'])
    for (const t of titles) expect(known.has(t)).toBe(true)

    // 핵심 문장은 초록 원문 그대로
    for (const p of r.papers) {
      const texts = new Set(p.sentences.map((s) => s.text))
      for (const k of p.keySentences) expect(p.sentences.some((s) => s.id === k.sentenceId && texts.has(s.text))).toBe(true)
    }
    const p1 = r.papers.find((p) => p.sourceId === 'ART0001')!
    expect(p1.keySentences.length).toBe(3)
    expect(p1.keySentences.some((k) => k.role === 'purpose' || k.role === 'result')).toBe(true)

    // 뉴스: 무관 기사 제외, 같은 사건 중복 제거, HTML 제거
    expect(r.news).toHaveLength(1)
    expect(r.news[0]!.title.startsWith('청소년 스마트폰 사용 늘며 수면 시간 줄어')).toBe(true)
    expect(r.news[0]!.title).not.toMatch(/<\/?b>/)
    expect(['연합뉴스', '뉴스1']).toContain(r.news[0]!.press)

    // 비교표: 수면 개념에서 감소 vs 효과 없음 등 방향이 드러난다
    expect(r.comparison.concepts.length).toBeGreaterThan(0)
    for (const c of r.comparison.concepts) for (const cell of c.cells) if (cell.direction !== 'none') expect(cell.evidence.length).toBeGreaterThan(0)

    // 영문 검색어는 사전에서 자동으로 채워졌다 (외부 번역 호출 없음)
    expect(r.keywordsEn).toContain('smartphone')
    // 외부 호출은 중계 함수와 OpenAlex(키 없이 직접) 두 곳뿐
    expect(calls.every((u) => u.startsWith(RELAY) || u.startsWith('https://api.openalex.org/works'))).toBe(true)
    // 기간 필터
    expect(calls.find((u) => u.includes('openalex'))).toContain('publication_year%3A%3E2016')
  })

  it('한 소스가 실패해도 나머지로 결과를 준다', async () => {
    const e = makeEngine([], { kci: 500 })
    const r = await e.runResearch(baseInput)
    expect(r.sourceStatus.kci).toBe('failed')
    expect(r.papers.length).toBeGreaterThan(0)
  })

  it('모두 네트워크 실패면 OFFLINE, 서버 오류면 SOURCES_DOWN', async () => {
    await expect(makeEngine([], { kci: 'network', openalex: 'network', news: 'network' }).runResearch(baseInput)).rejects.toMatchObject({ code: 'OFFLINE' })
    await expect(makeEngine([], { kci: 500, openalex: 502, news: 500 }).runResearch(baseInput)).rejects.toMatchObject({ code: 'SOURCES_DOWN' })
    await expect(makeEngine([], { kci: 429, openalex: 429, news: 429 }).runResearch(baseInput)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('두 번째 같은 검색은 기기 캐시를 쓴다', async () => {
    const calls: Calls = []
    const e = makeEngine(calls)
    await e.runResearch(baseInput)
    const n = calls.length
    const r2 = await e.runResearch(baseInput)
    expect(calls.length).toBe(n)
    expect(r2.cached).toBe(true)
  })

  it('입력 검증', async () => {
    const e = makeEngine()
    await expect(e.runResearch({ ...baseInput, keywords: [] })).rejects.toBeInstanceOf(EngineError)
    await expect(e.runResearch({ ...baseInput, sources: { kci: false, openalex: false, news: false } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(e.suggestQuestions({ topic: 'a' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('checkSentences: 지지·방향 충돌·근거 없음·수치 불일치', async () => {
    const e = makeEngine()
    const { researchId } = await e.runResearch(baseInput)
    const { results, candidates } = await e.checkSentences({
      researchId,
      text: [
        '스마트폰 사용 시간이 길수록 청소년의 수면 시간은 감소한다.',
        '스마트폰 사용 시간이 길수록 청소년의 수면 시간은 증가한다.',
        '우주 탐사 예산은 매년 늘어나고 있다.',
        '고등학생 300명을 대상으로 스마트폰 사용과 수면을 조사하였다.',
      ].join(' '),
    })
    expect(results.map((r) => r.verdict)).toEqual(['supported', 'unsupported', 'unsupported', 'partial'])
    expect(results.map((r) => r.reasonCode)).toEqual(['match', 'direction_conflict', 'no_evidence', 'number_mismatch'])
    expect(results[0]!.evidence.length).toBeGreaterThan(0)
    expect(results[2]!.evidence).toEqual([])
    // 뉴스는 참고로만
    expect(results[0]!.newsReference.length).toBeGreaterThanOrEqual(0)
    for (const r of results) for (const id of r.suggestPaperIds) expect(candidates.some((c) => c.id === id)).toBe(true)
  })

  it('F7·F8은 AI 허용 모드에서만, 패키지 원문이 사용 내역에 자동 포함', async () => {
    const e = makeEngine()
    const ai = await e.runResearch(baseInput)
    const pkg = await e.buildPackage({ researchId: ai.researchId })
    for (const re of FORBIDDEN_REQUESTS) expect(re.test(pkg.text)).toBe(false)
    expect(pkg.text).toContain('대신 만들어 주지 마')

    const d = await e.buildDisclosure({ researchId: ai.researchId, tools: ['ChatGPT'], extraPrompts: ['서론 구성을 점검해 줘'], scope: ['자료 수집', '구성 점검'] })
    expect(d.disclosure.serviceUsesAi).toBe(false)
    expect(d.disclosure.prompts[0]!.text).toBe(pkg.text)
    expect(d.text).toContain(pkg.text)
    expect(d.text).toContain('서론 구성을 점검해 줘')
    expect(d.text).toContain('2026-11-08 12:00 (KST)')

    const so = await e.runResearch({ ...baseInput, mode: 'search_only' })
    await expect(e.buildPackage({ researchId: so.researchId })).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' })
    await expect(e.buildDisclosure({ researchId: so.researchId, tools: ['ChatGPT'], extraPrompts: [], scope: ['자료 수집'] })).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' })
    // 검색만 모드도 문장 검사는 가능
    await expect(e.checkSentences({ researchId: so.researchId, text: '스마트폰 사용 시간이 길수록 수면 시간은 감소한다.' })).resolves.toBeTruthy()
  })

  it('만료·삭제된 리서치는 EXPIRED', async () => {
    const e = makeEngine()
    const { researchId } = await e.runResearch(baseInput)
    await e.clearAll()
    await expect(e.checkSentences({ researchId, text: '수면 시간이 감소한다.' })).rejects.toMatchObject({ code: 'EXPIRED' })
  })
})

describe('KCI 재검색', () => {
  it('키워드 전체로 0건이면 핵심 키워드 2개로 다시 검색한다', async () => {
    const calls: string[] = []
    const empty = '<MetaData><outputData><result><total>0</total></result></outputData></MetaData>'
    const e = createEngine({
      relayBaseUrl: RELAY,
      store: new MemoryStore(),
      now: () => NOW,
      fetch: async (input: string) => {
        calls.push(input)
        if (input.includes('/kci/')) return new Response(new URL(input).searchParams.get('q')!.split(' ').length > 2 ? empty : KCI_XML)
        if (input.includes('/openalex')) return Response.json(OPENALEX_JSON)
        return Response.json(NAVER_JSON)
      },
    })
    const r = await e.runResearch(baseInput)
    const kciCalls = calls.filter((u) => u.includes('/kci/'))
    expect(kciCalls).toHaveLength(2)
    expect(new URL(kciCalls[1]!).searchParams.get('q')).toBe('스마트폰 청소년')
    expect(r.papers.some((p) => p.source === 'kci')).toBe(true)
  })
})

describe('OpenAlex 경로 (무료 공개용)', () => {
  const make = (openalex: (u: string) => Response, calls: string[]) =>
    createEngine({
      relayBaseUrl: RELAY,
      store: new MemoryStore(),
      now: () => NOW,
      fetch: async (input: string, init?: RequestInit) => {
        calls.push(input)
        if (input.startsWith('https://api.openalex.org')) {
          // 직접 호출에는 사용자 정의 헤더가 없어야 한다 (CORS 사전 요청 실패 방지)
          expect(init?.headers).toBeUndefined()
          return openalex(input)
        }
        if (input.includes('/openalex')) return Response.json(OPENALEX_JSON)
        if (input.includes('/kci/')) return new Response(KCI_XML)
        return Response.json(NAVER_JSON)
      },
    })

  it('기본은 브라우저에서 키 없이 직접 호출', async () => {
    const calls: string[] = []
    const r = await make(() => Response.json(OPENALEX_JSON), calls).runResearch(baseInput)
    expect(calls.some((u) => u.startsWith('https://api.openalex.org'))).toBe(true)
    expect(calls.some((u) => u.startsWith(`${RELAY}openalex`))).toBe(false)
    expect(r.sourceStatus.openalex).toBe('ok')
  })

  it('직접 호출이 한도(429)에 걸리면 중계 함수로 넘어간다', async () => {
    const calls: string[] = []
    const r = await make(() => new Response('limit', { status: 429 }), calls).runResearch(baseInput)
    expect(calls.some((u) => u.startsWith(`${RELAY}openalex`))).toBe(true)
    expect(r.sourceStatus.openalex).toBe('ok')
    expect(r.papers.some((p) => p.source === 'openalex')).toBe(true)
  })

  it('빈 결과는 기기 캐시에 남기지 않는다', async () => {
    const calls: string[] = []
    const e = make(() => Response.json({ results: [] }), calls)
    await e.runResearch(baseInput)
    const n = calls.filter((u) => u.startsWith('https://api.openalex.org')).length
    await e.runResearch(baseInput)
    expect(calls.filter((u) => u.startsWith('https://api.openalex.org')).length).toBe(n * 2)
  })
})
