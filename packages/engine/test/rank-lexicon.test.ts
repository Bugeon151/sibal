import { describe, expect, it } from 'vitest'
import { detectDirection, directionsConflict, voteDirection } from '../src/lexicon/direction'
import { Dictionary } from '../src/lexicon/dictionary'
import { detectDefinition, detectRole } from '../src/lexicon/roles'
import { Bm25Index, normalizeByMax } from '../src/rank/bm25'
import { textRank } from '../src/rank/textrank'

describe('BM25', () => {
  const idx = new Bm25Index([
    ['수면', '스마트폰', '청소년'],
    ['수면', '운동'],
    ['경제', '성장'],
  ])
  it('관련 문서가 더 높은 점수', () => {
    const s = idx.scoreAll(['스마트폰', '수면'])
    expect(s[0]).toBeGreaterThan(s[1]!)
    expect(s[2]).toBe(0)
  })
  it('드문 단어의 idf가 더 크다', () => {
    expect(idx.idf('경제')).toBeGreaterThan(idx.idf('수면'))
  })
  it('normalizeByMax', () => {
    expect(normalizeByMax([2, 1, 0])).toEqual([1, 0.5, 0])
    expect(normalizeByMax([0, 0])).toEqual([0, 0])
  })
})

describe('TextRank', () => {
  it('다른 문장과 많이 겹치는 문장이 높다', () => {
    const r = textRank([
      ['스마트폰', '수면', '청소년'],
      ['스마트폰', '수면'],
      ['수면', '청소년'],
      ['날씨', '맑음'],
    ])
    expect(r[0]).toBe(1)
    expect(r[3]).toBeLessThan(r[1]!)
  })
  it('문장 1개면 1', () => {
    expect(textRank([['a']])).toEqual([1])
  })
})

describe('direction', () => {
  it.each([
    ['스마트폰 사용 시간이 길수록 수면 시간은 감소하였다.', 'decrease'],
    ['운동은 학업 성취를 향상시키는 것으로 나타났다.', 'increase'],
    ['두 집단 간 유의한 차이가 없었다.', 'no_effect'],
    ['통계적으로 유의하지 않았다.', 'no_effect'],
    ['수면 시간은 증가하지 않았다.', 'decrease'],
    ['우울감과 부정적인 관계를 보였다.', 'decrease'],
    ['여학생 집단에서만 증가하였다.', 'conditional'],
    ['Screen time was associated with reduced sleep duration.', 'decrease'],
    ['Exercise improved academic performance.', 'increase'],
    ['There was no significant association.', 'no_effect'],
    ['본 연구는 청소년을 대상으로 설문을 실시하였다.', 'none'],
  ])('%s → %s', (text, dir) => {
    expect(detectDirection(text)).toBe(dir)
  })
  it('충돌 판정', () => {
    expect(directionsConflict('increase', 'decrease')).toBe(true)
    expect(directionsConflict('no_effect', 'increase')).toBe(true)
    expect(directionsConflict('increase', 'increase')).toBe(false)
    expect(directionsConflict('conditional', 'decrease')).toBe(false)
    expect(directionsConflict('none', 'decrease')).toBe(false)
  })
  it('다수결', () => {
    expect(voteDirection(['increase', 'increase', 'decrease'])).toBe('increase')
    expect(voteDirection(['increase', 'decrease'])).toBe('conditional')
    expect(voteDirection(['none'])).toBe('none')
  })
})

describe('roles & definitions', () => {
  it('역할 태그', () => {
    expect(detectRole('본 연구는 스마트폰 사용과 수면의 관계를 알아보고자 하였다.')).toBe('purpose')
    expect(detectRole('고등학생 500명을 대상으로 설문을 실시하였다.')).toBe('method')
    expect(detectRole('수면 시간이 유의하게 감소한 것으로 나타났다.')).toBe('result')
    expect(detectRole('따라서 사용 시간 관리 교육이 필요하다.')).toBe('conclusion')
  })
  it('정의 문장', () => {
    expect(detectDefinition('디지털 리터러시란 디지털 정보를 이해하고 활용하는 능력이다.')).toBe('디지털 리터러시')
    expect(detectDefinition('Sleep hygiene is defined as a set of behaviors.')).toBe('Sleep hygiene')
    expect(detectDefinition('수면 시간이 감소하였다.')).toBeNull()
  })
})

describe('Dictionary', () => {
  const d = new Dictionary()
  it('동의어와 영어 어간으로 확장', () => {
    const e = d.expand('휴대폰')
    expect(e.has('스마트폰')).toBe(true)
    expect(e.has('smartphon')).toBe(true)
  })
  it('검색어용 영어 표현', () => {
    expect(d.englishPhrases('수면')).toContain('sleep')
    expect(d.englishPhrases('잠')).toContain('sleep')
  })
})
