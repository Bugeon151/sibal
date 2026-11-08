// 독립 코드 리뷰(2026-11-08)에서 나온 문제의 회귀 테스트
import { describe, expect, it } from 'vitest'
import { dedupePapers } from '../src/features/select'
import { kstDate, newsReference } from '../src/features/templates'
import { headingRole } from '../src/lexicon/roles'
import { parseKciXml } from '../src/sources/kci'
import type { RawPaper } from '../src/sources/types'

const paper = (o: Partial<RawPaper>): RawPaper => ({
  source: 'openalex', sourceId: 'x', doi: null, title: 't', authors: [], journal: null, year: 2020, language: 'en',
  citedBy: null, isOa: false, url: '', pageUrl: '', fullTextUrl: null, abstract: '', keywordsKo: [], keywordsEn: [], ...o,
})

describe('리뷰 수정', () => {
  it('KCI: 참고문헌 하위 트리의 서지를 가져오지 않는다', () => {
    const xml = `<MetaData><outputData><record><journalInfo><pub-year>2022</pub-year></journalInfo><articleInfo article-id="ART000000001"><title-group><article-title>본 논문 제목입니다</article-title></title-group><abstract-group><abstract>본 연구는 무엇을 분석하였다. 결과는 이렇게 나타났다.</abstract></abstract-group></articleInfo><referenceInfo><reference><doi>10.9999/other</doi><url>http://other</url><citation-count>99</citation-count><author>남의저자</author></reference></referenceInfo></record></outputData></MetaData>`
    const p = parseKciXml(xml).papers[0]!
    expect(p.doi).toBeNull()
    expect(p.citedBy).toBeNull()
    expect(p.authors).toEqual([])
    expect(p.url).not.toBe('http://other')
  })
  it('KCI: 값을 숫자로 바꾸지 않는다 (DOI 10.5000, 저자 0012 보존 여부)', () => {
    const xml = `<MetaData><outputData><record><journalInfo><pub-year>2022</pub-year><journal-name>1e3</journal-name></journalInfo><articleInfo article-id="ART000000002"><title-group><article-title>숫자 보존 확인 논문</article-title></title-group><doi>10.5000</doi></articleInfo></record></outputData></MetaData>`
    const p = parseKciXml(xml).papers[0]!
    expect(p.journal).toBe('1e3')
    expect(p.doi).toBeNull() // '10.5000'은 DOI 형식(10.xxxx/…)이 아니므로 버린다
  })
  it('KCI: 저자 소속을 저자로 넣지 않는다', () => {
    const xml = `<MetaData><outputData><record><journalInfo><pub-year>2022</pub-year></journalInfo><articleInfo article-id="ART000000003"><title-group><article-title>저자 소속 분리 확인 논문</article-title></title-group><author-group><author><name>김민수</name><affiliation>서울대학교</affiliation></author><author>이지은</author></author-group></articleInfo></record></outputData></MetaData>`
    expect(parseKciXml(xml).papers[0]!.authors).toEqual(['김민수', '이지은'])
  })
  it('KCI: MetaData/outputData가 없는 오류 응답은 valid=false', () => {
    expect(parseKciXml('<error><message>invalid key</message></error>').valid).toBe(false)
    expect(parseKciXml('<MetaData><outputData><result><total>0</total></result></outputData></MetaData>').valid).toBe(true)
  })
  it('KCI: DOI 문자열이 숫자로 바뀌지 않는다', () => {
    const xml = `<MetaData><outputData><record><journalInfo><pub-year>2022</pub-year></journalInfo><articleInfo article-id="ART000000004"><title-group><article-title>DOI 보존 확인 논문입니다</article-title></title-group><doi>10.5000/abc.0100</doi></articleInfo></record></outputData></MetaData>`
    expect(parseKciXml(xml).papers[0]!.doi).toBe('10.5000/abc.0100')
  })
  it('뉴스 날짜는 한국 날짜로', () => {
    expect(kstDate('2026-11-07T22:30:00.000Z')).toBe('2026-11-08')
    expect(newsReference({ id: 'N1', title: '기사', press: '연합뉴스', publishedAt: '2026-11-07T22:30:00.000Z', url: 'https://a', sentences: [], score: 0 })).toContain('(2026-11-08)')
  })
  it('중복 제거: 짧은 같은 제목은 합치지 않고, 다른 논문의 DOI를 붙이지 않는다', () => {
    const a = paper({ sourceId: 'A', title: 'Introduction', doi: '10.1000/a', abstract: 'short', authors: ['A'] })
    const b = paper({ sourceId: 'B', title: 'Introduction', doi: null, abstract: 'a much longer abstract here', authors: ['B'] })
    const out = dedupePapers([a, b])
    expect(out).toHaveLength(2)
    expect(out.find((p) => p.sourceId === 'B')!.doi).toBeNull()
  })
  it('중복 제거: 긴 같은 제목·같은 연도는 합치고, DOI가 서로 다르면 합치지 않는다', () => {
    const t = 'Smartphone use and sleep among adolescents'
    expect(dedupePapers([paper({ title: t, doi: '10.1000/x' }), paper({ title: t, doi: null, abstract: 'longer' })])).toHaveLength(1)
    expect(dedupePapers([paper({ title: t, doi: '10.1000/x' }), paper({ title: t, doi: '10.1000/y' })])).toHaveLength(2)
  })
  it('중복 제거: DOI로 한 그룹, 제목으로 다른 그룹에 걸리면 모두 하나로', () => {
    const t = 'Smartphone use and sleep among adolescents'
    const out = dedupePapers([paper({ sourceId: '1', title: t, doi: null }), paper({ sourceId: '2', title: 'Other long enough title', doi: '10.1000/z' }), paper({ sourceId: '3', title: t, doi: '10.1000/z' })])
    expect(out).toHaveLength(1)
  })
  it('머리말 정규식이 긴 공백에서 멈추지 않는다', () => {
    const t = performance.now()
    headingRole(`${' '.repeat(5000)}x`)
    expect(performance.now() - t).toBeLessThan(100)
    expect(headingRole('(3) Results: x')).toBe('result')
    expect(headingRole('RESULTS: x')).toBe('result')
    expect(headingRole('결과: x')).toBe('result')
  })
})
