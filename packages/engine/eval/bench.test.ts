// 성능 측정 (최악 조건): 후보 논문 25편(긴 초록) + 뉴스 20건, 학생 문장 10개.
// 저사양 태블릿은 이 노트북보다 3~5배 느리다고 보고, 측정값 × 5가 목표(결과 10초, 검사 2초) 안에 들어야 한다.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createEngine, MemoryStore } from '../src'

const real = JSON.parse(readFileSync(new URL('../test/real/openalex-smartphone-sleep.json', import.meta.url), 'utf8'))
const ko = '본 연구는 청소년의 스마트폰 사용 시간과 수면의 질, 우울감, 학업 성취의 관계를 분석하였다. 전국 고등학생 1,200명을 대상으로 설문 조사를 실시하였다. 스마트폰 사용 시간이 길수록 수면 시간은 감소하였고 우울감은 높게 나타났다. 그러나 학업 성취와는 유의한 관계가 없었다. 취침 전 사용은 수면의 질을 낮추는 것으로 나타났다. 여학생에게서 이러한 경향이 더 강하게 나타났다. 따라서 사용 시간 관리 교육이 필요하다. '

function kciXml(n: number) {
  const recs = Array.from({ length: n }, (_, i) => `<record><journalInfo><journal-name>학술지${i}</journal-name><pub-year>${2016 + (i % 10)}</pub-year></journalInfo><articleInfo article-id="ART${String(i).padStart(9, '0')}"><title-group><article-title>청소년 스마트폰 사용과 수면 연구 ${i}</article-title></title-group><author-group><author>저자${i}</author></author-group><abstract-group><abstract>${ko.repeat(3)}</abstract></abstract-group><citation-count>${i * 3}</citation-count></articleInfo></record>`)
  return `<MetaData><outputData><result><total>${n}</total></result>${recs.join('')}</outputData></MetaData>`
}
const works = { results: Array.from({ length: 15 }, (_, i) => ({ ...real.results[i % real.results.length], id: `https://openalex.org/W${i}`, doi: null, title: `${real.results[i % real.results.length].title} ${i}` })) }
const news = { items: Array.from({ length: 20 }, (_, i) => ({ title: `청소년 스마트폰 사용 수면 기사 ${i}`, originallink: `https://news${i}.example.com/a`, link: `https://n.news.naver.com/${i}`, description: '청소년의 스마트폰 사용 시간이 늘면서 수면 시간은 줄어든 것으로 조사됐다. 전문가들은 취침 전 사용을 줄여야 한다고 말했다.', pubDate: 'Mon, 02 Nov 2026 09:00:00 +0900' })) }

it('성능 (최악 조건)', async () => {
  const e = createEngine({ openAlexRetryDelaysMs: [0, 0],
    relayBaseUrl: 'https://relay.test/',
    store: new MemoryStore(),
    fetch: async (u: string) => (u.includes('/kci/') ? new Response(kciXml(10)) : u.includes('/openalex') ? Response.json(works) : Response.json(news)),
  })
  const input = { mode: 'ai' as const, topic: '스마트폰 사용이 청소년 수면에 미치는 영향', question: '스마트폰 사용은 청소년 수면에 어떤 영향을 미치는가?', keywords: ['스마트폰', '청소년', '수면'], sources: { kci: true, openalex: true, news: true }, years: 0 as const }
  await e.runResearch(input) // 워밍업 (JIT)
  await e.clearAll()
  let t = performance.now()
  const r = await e.runResearch(input)
  const research = performance.now() - t
  const text = Array.from({ length: 10 }, (_, i) => (i % 2 ? '스마트폰 사용 시간이 길수록 청소년의 수면 시간은 감소한다.' : '취침 전 스마트폰 사용은 우울감을 높인다.')).join(' ')
  t = performance.now()
  await e.checkSentences({ researchId: r.researchId, text })
  const check = performance.now() - t
  console.log(`\n[성능] 검색·선별·요약·비교표 ${research.toFixed(0)}ms (×5 = ${(research * 5 / 1000).toFixed(1)}초) · 문장 10개 검사 ${check.toFixed(0)}ms (×5 = ${(check * 5 / 1000).toFixed(2)}초)\n`)
  expect(research * 5).toBeLessThan(10_000)
  expect(check * 5).toBeLessThan(2_000)
})
