// 실제 OpenAlex 응답(2026-11-08 수집)으로 파서·문장 분리·핵심 문장을 검증한다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractKeySentences } from '../src/features/keySentences'
import { parseOpenAlexWork } from '../src/sources/openalex'
import { splitSentences } from '../src/text/sentences'
import { RuleTokenizer } from '../src/text/tokenizer'

const body = JSON.parse(readFileSync(new URL('./real/openalex-smartphone-sleep.json', import.meta.url), 'utf8'))

describe('실제 OpenAlex 응답', () => {
  const papers = body.results.map(parseOpenAlexWork).filter(Boolean)
  it('모든 레코드를 파싱하고 초록을 복원한다', () => {
    expect(papers.length).toBe(body.results.length)
    for (const p of papers) {
      expect(p.title.length).toBeGreaterThan(5)
      expect(p.year).toBeGreaterThan(2016)
      expect(p.abstract.split(' ').length).toBeGreaterThan(30)
    }
  })
  it('문장 분리와 핵심 문장이 원문 그대로 나온다', () => {
    const tk = new RuleTokenizer()
    for (const p of papers) {
      const sents = splitSentences(p.abstract).map((t, i) => ({ id: `P-S${i + 1}`, text: t }))
      expect(sents.length).toBeGreaterThanOrEqual(2)
      const { keySentences } = extractKeySentences(sents, sents.map((s) => tk.tokens(s.text)), ['smartphon', 'sleep', 'adolescent'])
      expect(keySentences.length).toBe(Math.min(3, sents.length))
      for (const k of keySentences) expect(p.abstract).toContain(sents.find((s) => s.id === k.sentenceId)!.text)
    }
  })
})
