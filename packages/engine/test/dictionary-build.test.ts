import { describe, expect, it } from 'vitest'
import { buildKoEn, mergeDictionaryData } from '../src/lexicon/build'
import { parseKciXml } from '../src/sources/kci'
import { KCI_XML } from './fixtures'

describe('사전 생성', () => {
  const papers = parseKciXml(KCI_XML).papers
  it('같은 위치의 한·영 키워드 쌍을 세고 최소 등장 수로 거른다', () => {
    expect(buildKoEn(papers, 1)).toEqual({ 수면: ['sleep'], 스마트폰: ['smartphone'], 청소년: ['adolescent'], 스트레스: ['stress'] })
    expect(buildKoEn(papers, 2)).toEqual({ 수면: ['sleep'] })
    expect(buildKoEn(papers, 3)).toEqual({})
  })
  it('사전 합치기', () => {
    const m = mergeDictionaryData({ synonyms: [['a', 'b']], koEn: { 수면: ['sleep'] } }, { synonyms: [], koEn: { 수면: ['slumber'], 운동: ['exercise'] } })
    expect(m.koEn).toEqual({ 수면: ['sleep', 'slumber'], 운동: ['exercise'] })
  })
})
