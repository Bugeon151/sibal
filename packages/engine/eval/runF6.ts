// F6 판정 세트 채점기. 정확도, 혼동 행렬, 틀린 사례를 낸다.
// 실행: npm run eval:f6   (루트)

import { checkOne, type CheckContext, type EvidenceSentence } from '../src/features/check'
import { Dictionary } from '../src/lexicon/dictionary'
import { detectLang } from '../src/text/normalize'
import { splitSentences } from '../src/text/sentences'
import { RuleTokenizer } from '../src/text/tokenizer'
import type { Verdict } from '../src/types'

export type F6Set = {
  topics: { id: string; papers: string[]; cases: { text: string; label: Verdict; hard?: string }[] }[]
}

export type F6Report = {
  total: number
  correct: number
  accuracy: number
  /** 미지지 문장을 미지지로 잡은 비율 (PRD "미지지 탐지") */
  unsupportedRecall: number
  /** 지지라고 판정한 것 중 실제 지지 비율 */
  supportedPrecision: number
  confusion: Record<Verdict, Record<Verdict, number>>
  misses: { topic: string; text: string; label: Verdict; got: Verdict; reasonCode: string; coverage: number; hard?: string }[]
}

const VERDICTS: Verdict[] = ['supported', 'partial', 'unsupported']

export function runF6(set: F6Set, params?: CheckContext['params']): F6Report {
  const tokenizer = new RuleTokenizer()
  const dict = new Dictionary()
  const confusion = Object.fromEntries(VERDICTS.map((l) => [l, Object.fromEntries(VERDICTS.map((g) => [g, 0]))])) as F6Report['confusion']
  const misses: F6Report['misses'] = []
  let total = 0
  let correct = 0

  for (const topic of set.topics) {
    const paperSentences: EvidenceSentence[] = topic.papers.flatMap((abs, pi) =>
      splitSentences(abs).map((text, si) => ({ id: `P${pi + 1}-S${si + 1}`, text, tokens: tokenizer.tokens(text), lang: detectLang(text) })),
    )
    const ctx: CheckContext = { tokenizer, dict, paperSentences, newsSentences: [], pool: [], params }
    for (const c of topic.cases) {
      const r = checkOne(c.text, ctx)
      total++
      confusion[c.label][r.verdict]++
      if (r.verdict === c.label) correct++
      else misses.push({ topic: topic.id, text: c.text, label: c.label, got: r.verdict, reasonCode: r.reasonCode, coverage: r.scores.coverage, hard: c.hard })
    }
  }

  const unsupTotal = VERDICTS.reduce((a, g) => a + confusion.unsupported[g], 0)
  const predSupported = VERDICTS.reduce((a, l) => a + confusion[l].supported, 0)
  return {
    total,
    correct,
    accuracy: correct / total,
    unsupportedRecall: unsupTotal ? confusion.unsupported.unsupported / unsupTotal : 0,
    supportedPrecision: predSupported ? confusion.supported.supported / predSupported : 0,
    confusion,
    misses,
  }
}

export function formatReport(r: F6Report): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const lines = [
    `정확도 ${r.correct}/${r.total} = ${pct(r.accuracy)} · 미지지 탐지 ${pct(r.unsupportedRecall)} · 지지 정밀도 ${pct(r.supportedPrecision)}`,
    '',
    '정답\\판정     supported  partial  unsupported',
    ...VERDICTS.map((l) => `${l.padEnd(12)} ${VERDICTS.map((g) => String(r.confusion[l][g]).padStart(9)).join(' ')}`),
    '',
    '틀린 사례:',
    ...r.misses.map((m) => `- [${m.topic}] ${m.text}\n    정답 ${m.label} / 판정 ${m.got} (${m.reasonCode}, C=${m.coverage})${m.hard ? ` · ${m.hard}` : ''}`),
  ]
  return lines.join('\n')
}
