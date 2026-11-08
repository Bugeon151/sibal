import { describe, expect, it } from 'vitest'
import { attach, hasBatchim } from '../src/text/josa'
import { cleanInput, detectLang, normalizeDoi, stripHtml } from '../src/text/normalize'
import { splitSentences } from '../src/text/sentences'
import { extractNumbers, RuleTokenizer, stemEnglish } from '../src/text/tokenizer'

describe('josa', () => {
  it('받침 유무로 조사를 고른다', () => {
    expect(attach('수면', '은/는')).toBe('수면은')
    expect(attach('스마트폰', '이/가')).toBe('스마트폰이')
    expect(attach('청소년', '과/와')).toBe('청소년과')
    expect(attach('게임', '을/를')).toBe('게임을')
    expect(attach('SNS', '은/는')).toBe('SNS는')
    expect(attach('학교', '이/가')).toBe('학교가')
  })
  it('ㄹ 받침 뒤에는 "로"', () => {
    expect(attach('스마트폰 사용', '으로/로')).toBe('스마트폰 사용으로')
    expect(attach('학교', '으로/로')).toBe('학교로')
    expect(attach('교실', '으로/로')).toBe('교실로')
  })
  it('hasBatchim', () => {
    expect(hasBatchim('밥')).toBe(true)
    expect(hasBatchim('사과')).toBe(false)
  })
})

describe('normalize', () => {
  it('입력 정리', () => {
    expect(cleanInput('  SNS   사용\u0007 ')).toBe('SNS 사용')
  })
  it('HTML 태그와 엔티티 제거', () => {
    expect(stripHtml('<b>청소년</b> 수면 &quot;부족&quot; &amp; 스마트폰')).toBe('청소년 수면 "부족" & 스마트폰')
  })
  it('DOI 정규화', () => {
    expect(normalizeDoi('https://doi.org/10.1234/ABC')).toBe('10.1234/abc')
    expect(normalizeDoi('없음')).toBeNull()
  })
  it('언어 판별', () => {
    expect(detectLang('청소년의 스마트폰 사용')).toBe('ko')
    expect(detectLang('Smartphone use in adolescents')).toBe('en')
  })
})

describe('splitSentences', () => {
  it('한국어 종결 기준으로 나눈다', () => {
    const s = splitSentences('본 연구는 청소년의 수면을 분석하였다. 그 결과 수면 시간이 감소하였다. 이는 중요하다.')
    expect(s).toEqual(['본 연구는 청소년의 수면을 분석하였다.', '그 결과 수면 시간이 감소하였다. 이는 중요하다.'])
  })
  it('약어와 소수점은 나누지 않는다', () => {
    const s = splitSentences('Smith et al. reported a 3.5 hour decrease in sleep. The effect was large in boys.')
    expect(s).toHaveLength(2)
    expect(s[0]).toContain('et al.')
    expect(s[0]).toContain('3.5')
  })
  it('마침표 뒤 공백이 없어도 "다." 뒤에서 나눈다', () => {
    expect(splitSentences('수면 시간이 줄어들었다.스마트폰 사용 시간이 늘었다.')).toHaveLength(2)
  })
})

describe('tokenizer', () => {
  const tk = new RuleTokenizer()
  it('조사와 어미를 뗀다', () => {
    expect(tk.tokens('청소년의 스마트폰 사용이 수면 시간을 감소시켰다')).toEqual([
      '청소년', '스마트폰', '사용', '수면', '시간', '감소',
    ])
    expect(tk.tokens('학업 성취도가 향상되었다')).toEqual(['학업', '성취', '향상'])
  })
  it('단어 일부인 글자는 떼지 않는다', () => {
    expect(tk.tokens('전문가 평가 결과의 차이')).toEqual(['전문가', '평가', '차이'])
  })
  it('영어는 소문자 어간, 약어는 그대로', () => {
    expect(tk.tokens('SNS use reduced sleeping hours of adolescents')).toEqual(['sns', 'use', 'reduc', 'sleep', 'hour', 'adolescent'])
  })
  it('stemEnglish', () => {
    expect(stemEnglish('increased')).toBe(stemEnglish('increase'))
    expect(stemEnglish('studies')).toBe('study')
  })
  it('숫자 추출', () => {
    expect(extractNumbers('수면 시간이 30% 줄고 1.5 시간 감소, 1,200명 대상')).toEqual(['30%', '1.5시간', '1200명'])
  })
})
