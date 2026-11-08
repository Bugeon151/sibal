import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agreementOf, buildComparison, conceptDirection } from '../src/features/compare'
import { Dictionary } from '../src/lexicon/dictionary'
import { splitSentences } from '../src/text/sentences'
import { RuleTokenizer } from '../src/text/tokenizer'

const tk = new RuleTokenizer()
const dict = new Dictionary()
const holdout = JSON.parse(readFileSync(new URL('../eval/f6-holdout.json', import.meta.url), 'utf8')) as { topics: { id: string; papers: string[] }[] }

function docsOf(topicId: string) {
  const t = holdout.topics.find((x) => x.id === topicId)!
  return t.papers.map((abs, i) => {
    const sentences = splitSentences(abs).map((text, j) => ({ id: `P${i + 1}-S${j + 1}`, text }))
    return { paperId: `P${i + 1}`, sentences, tokens: sentences.map((s) => tk.tokens(s.text)) }
  })
}

describe('F5 비교표', () => {
  it('실제로 엇갈리는 결과(증가 vs 관계 없음)를 상충으로 표시한다', () => {
    const c = buildComparison(docsOf('game-aggression'), dict, tk)
    const row = c.concepts.find((r) => r.concept === '공격')!
    expect(row.agreement).toBe('conflict')
    expect(row.cells.map((x) => x.direction)).toEqual(['increase', 'no_effect'])
    for (const cell of row.cells) expect(cell.evidence.length).toBeGreaterThan(0)
  })

  it('원인 쪽 단어가 서로 다른 결과의 방향을 가져가 상충으로 잘못 나오지 않는다', () => {
    // 최저임금 → (논문1) 고용 감소, (논문2) 소득 증가: 같은 대상이 아니므로 상충이 아니다
    const c = buildComparison(docsOf('min-wage'), dict, tk)
    expect(c.concepts.filter((r) => r.agreement === 'conflict')).toEqual([])
  })

  it('조사 찌꺼기·관계어·방향어는 개념이 되지 않는다', () => {
    for (const id of ['game-aggression', 'min-wage', 'en-phone-sleep']) {
      for (const r of buildComparison(docsOf(id), dict, tk).concepts) {
        expect(r.concept).not.toMatch(/(을|를|으)$/)
        expect(['관계', '영향', '증가', '감소', '미친']).not.toContain(r.concept)
      }
    }
  })

  it('개념 방향은 개념 바로 뒤에서 읽고, 목적어가 끼면 그 목적어의 방향으로 본다', () => {
    const is = (w: string) => (t: string) => t === w
    expect(conceptDirection('최저임금 인상 이후 숙박업의 청년 고용이 감소하였다.', is('고용'), tk)).toBe('decrease')
    expect(conceptDirection('최저임금 인상 이후 숙박업의 청년 고용이 감소하였다.', is('최저임금'), tk)).toBe('none')
    expect(conceptDirection('취침 전 스마트폰 사용은 수면의 질을 낮추는 것으로 나타났다.', is('사용'), tk)).toBe('none')
    expect(conceptDirection('취침 전 스마트폰 사용은 수면의 질을 낮추는 것으로 나타났다.', is('질'), tk)).toBe('decrease')
  })

  it('영어: 주어는 목적어의 방향을 가져가지 않고, 바로 앞 수식어·바로 뒤 서술어만 본다', () => {
    const tk2 = tk
    const is = (w: string) => (t: string) => t === w
    const s1 = 'Excessive smartphone use increased anxiety among teenagers.'
    expect(conceptDirection(s1, is('smartphon'), tk2)).toBe('none')
    expect(conceptDirection('Heavy users reported reduced sleep duration.', is('sleep'), tk2)).toBe('decrease')
    expect(conceptDirection('In this group, sleep quality decreased significantly.', is('sleep'), tk2)).toBe('decrease')
    expect(conceptDirection('Sleep duration was not associated with screen time.', is('sleep'), tk2)).toBe('no_effect')
    expect(conceptDirection('There is a negative relationship between the use of smartphones, and sleep, for reducing quality.', is('smartphon'), tk2)).toBe('none')
  })

  it('agreementOf', () => {
    expect(agreementOf(['increase', 'increase'])).toBe('agree')
    expect(agreementOf(['increase', 'decrease'])).toBe('conflict')
    expect(agreementOf(['increase', 'no_effect'])).toBe('conflict')
    expect(agreementOf(['increase', 'conditional'])).toBe('mixed')
    expect(agreementOf(['increase', 'none'])).toBe('single')
  })
})
