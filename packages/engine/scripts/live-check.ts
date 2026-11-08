// 실제 OpenAlex로 엔진을 돌려 보는 확인 스크립트 (중계 함수 없이, 배포된 화면과 같은 조건)
// 사용법: npx tsx packages/engine/scripts/live-check.ts "탐구 주제"
import { createEngine, MemoryStore } from '../src'

const topic = process.argv[2] ?? '스마트폰 사용이 청소년 수면에 미치는 영향'
const e = createEngine({ relayBaseUrl: null, store: new MemoryStore() })
const q = await e.suggestQuestions({ topic })
const r = await e.runResearch({ mode: 'ai', topic, question: q.questions[0]!.text, keywords: q.keywords, sources: { kci: false, openalex: true, news: false }, years: 10 })
console.log(`주제: ${topic}\n키워드: ${q.keywords.join(', ')} → 영문: ${r.keywordsEn.join(', ')}\n상태: ${JSON.stringify(r.sourceStatus)}`)
for (const p of r.papers) {
  console.log(`\n[${p.id}] ${p.title} (${p.year}, 인용 ${p.citedBy})\n  논문 보기: ${p.pageUrl}\n  원문 PDF: ${p.fullTextUrl ?? '없음'}`)
  for (const k of p.keySentences) console.log(`  · [${k.role ?? '-'}] ${p.sentences.find((s) => s.id === k.sentenceId)!.text.slice(0, 110)}`)
}
