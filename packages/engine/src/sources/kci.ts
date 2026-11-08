// KCI Open API (국내 논문). 키 노출 방지를 위해 중계 함수를 거친다.
//
// ⚠️ XML 요소 이름은 아직 확정 전이다 (키 발급 후 실제 응답으로 확정 — docs/데이터-입력-명세.md).
// 그래서 후보 이름 목록으로 찾고, 한·영 구분은 속성 대신 내용(한글 비율)으로 한다.
// 실제 응답을 받으면 FIELD_CANDIDATES를 정확한 이름 하나씩으로 줄이고 테스트 픽스처를 실제 응답으로 바꾼다.

import { XMLParser } from 'fast-xml-parser'
import { detectLang, normalizeDoi } from '../text/normalize'
import { SourceError, type Fetcher, type RawPaper } from './types'

export const FIELD_CANDIDATES = {
  record: ['record', 'article', 'articleInfo', 'item'],
  id: ['article-id', '@_article-id', 'articleId', '@_articleId', 'article_id', 'id', '@_id'],
  title: ['article-title', 'articleTitle', 'title', 'title-group'],
  abstract: ['abstract', 'abstract-group', 'abstractGroup'],
  author: ['author', 'author-group', 'authors'],
  keyword: ['keyword', 'keyword-group', 'keywords', 'kwd'],
  year: ['pub-year', 'pubi-year', 'pubYear', 'pub_year', 'year'],
  journal: ['journal-name', 'journalName', 'journal'],
  doi: ['doi'],
  citations: ['citation-count', 'citationCount', 'cited-count', 'citedCount'],
  url: ['url', 'article-url'],
  openAccess: ['orte-open-yn', 'open-yn', 'openYn', 'fulltext-open'],
} as const

type Node = unknown

// parseTagValue: false — DOI '10.5000'이 10.5로, 저자 '0012'가 숫자로 바뀌지 않게 문자열 그대로 둔다
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true, parseTagValue: false, parseAttributeValue: false })

// 레코드 안에서 들어가면 안 되는 하위 트리 (인용·참고문헌의 서지가 섞이지 않게)
const SKIP_SUBTREES = new Set(['reference', 'references', 'referenceInfo', 'reference-list', 'citation', 'citations', 'citationInfo', 'cited-by', 'citedBy'])

function pick(obj: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) if (n in obj) return obj[n]
  return undefined
}

/** 노드 안의 모든 텍스트 조각 */
function texts(node: Node): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('@_'))
      .flatMap(([, v]) => texts(v))
  }
  return []
}

function firstOfLang(node: Node, lang: 'ko' | 'en'): string {
  return texts(node).find((t) => detectLang(t) === lang)?.trim() ?? ''
}

/** 레코드 컨테이너 이름(record 등)으로 먼저 찾고, 없으면 제목 후보 키를 가진 객체로 찾는다 */
function findRecords(node: Node): Record<string, unknown>[] {
  const byName = findByRecordName(node)
  return byName.length > 0 ? byName : findByTitle(node)
}

function findByRecordName(node: Node, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const n of node) findByRecordName(n, out)
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const name = FIELD_CANDIDATES.record.find((n) => n in obj)
    if (name) {
      const v = obj[name]
      for (const r of Array.isArray(v) ? v : [v]) if (r && typeof r === 'object') out.push(r as Record<string, unknown>)
    } else {
      for (const v of Object.values(obj)) findByRecordName(v, out)
    }
  }
  return out
}

function findByTitle(node: Node, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const n of node) findByTitle(n, out)
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (pick(obj, FIELD_CANDIDATES.title) !== undefined && pick(obj, FIELD_CANDIDATES.year) !== undefined) {
      out.push(obj)
    } else if (pick(obj, FIELD_CANDIDATES.title) !== undefined && pick(obj, FIELD_CANDIDATES.abstract) !== undefined) {
      out.push(obj)
    } else {
      for (const v of Object.values(obj)) findByTitle(v, out)
    }
  }
  return out
}

/** 레코드 안쪽 어디에 있든 후보 키를 찾는다 (journalInfo 아래 pub-year 같은 경우) */
function deepPick(obj: Node, names: readonly string[], depth = 0): unknown {
  if (!obj || typeof obj !== 'object' || depth > 4) return undefined
  if (!Array.isArray(obj)) {
    const direct = pick(obj as Record<string, unknown>, names)
    if (direct !== undefined) return direct
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SKIP_SUBTREES.has(k)) continue
    const found = deepPick(v, names, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/** 저자 노드에서 이름만 (소속·이메일 등 하위 요소는 제외) */
function authorNames(node: Node): string[] {
  const list = Array.isArray(node) ? node : [node]
  const out: string[] = []
  for (const a of list) {
    if (a === null || a === undefined) continue
    if (typeof a === 'string' || typeof a === 'number') {
      out.push(String(a))
    } else if (typeof a === 'object') {
      const obj = a as Record<string, unknown>
      const inner = pick(obj, ['author', 'name', 'author-name', 'authorName', '#text'])
      if (inner !== undefined) out.push(...authorNames(inner))
    }
  }
  return out.map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x))
}

export function parseKciXml(xml: string): { papers: RawPaper[]; total: number | null; valid: boolean } {
  const doc = parser.parse(xml) as Node
  // 정상 응답은 MetaData > outputData. 없으면 오류 응답(키 오류·한도 초과 등)으로 본다
  const meta = (doc as Record<string, unknown> | null)?.MetaData as Record<string, unknown> | undefined
  const valid = !!meta && meta.outputData !== undefined
  const totalRaw = deepPick(doc, ['total', 'totalCount', 'total-count'])
  const total = totalRaw !== undefined ? Number(texts(totalRaw)[0]) : null

  const papers: RawPaper[] = []
  for (const r of findRecords(doc)) {
    const titleNode = deepPick(r, FIELD_CANDIDATES.title)
    const title = firstOfLang(titleNode, 'ko') || texts(titleNode)[0]?.trim() || ''
    if (!title) continue
    const abstractNode = deepPick(r, FIELD_CANDIDATES.abstract)
    const abstract = firstOfLang(abstractNode, 'ko') || firstOfLang(abstractNode, 'en')
    const yearText = texts(deepPick(r, FIELD_CANDIDATES.year))[0] ?? ''
    const year = Number(/\d{4}/.exec(yearText)?.[0])
    if (!Number.isFinite(year) || year < 1900) continue
    const keywords = texts(deepPick(r, FIELD_CANDIDATES.keyword)).flatMap((k) => k.split(/[;,]/)).map((k) => k.trim()).filter(Boolean)
    const id = texts(deepPick(r, FIELD_CANDIDATES.id))[0]?.trim() ?? ''
    const url = texts(deepPick(r, FIELD_CANDIDATES.url))[0]?.trim()
    const openFlag = texts(deepPick(r, FIELD_CANDIDATES.openAccess))[0]?.trim().toUpperCase()
    const cites = Number(texts(deepPick(r, FIELD_CANDIDATES.citations))[0])

    papers.push({
      source: 'kci',
      sourceId: id || title,
      doi: normalizeDoi(texts(deepPick(r, FIELD_CANDIDATES.doi))[0]),
      title,
      authors: authorNames(deepPick(r, FIELD_CANDIDATES.author)),
      journal: texts(deepPick(r, FIELD_CANDIDATES.journal))[0]?.trim() ?? null,
      year,
      language: detectLang(abstract || title),
      citedBy: Number.isFinite(cites) ? cites : null,
      isOa: openFlag === 'Y' || openFlag === 'TRUE',
      url: url || (id ? `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${encodeURIComponent(id)}` : ''),
      abstract,
      keywordsKo: keywords.filter((k) => detectLang(k) === 'ko'),
      keywordsEn: keywords.filter((k) => detectLang(k) === 'en'),
    })
  }
  return { papers, total, valid }
}

export async function searchKci(
  fetcher: Fetcher,
  relayBase: string,
  params: { query: string; fromYear: number | null; page?: number }, headers: Record<string, string> = {},
): Promise<RawPaper[]> {
  const url = new URL('kci/search', relayBase.endsWith('/') ? relayBase : `${relayBase}/`)
  url.searchParams.set('q', params.query)
  url.searchParams.set('page', String(params.page ?? 1))
  if (params.fromYear) url.searchParams.set('dateFrom', `${params.fromYear}01`)

  let res: Response
  try {
    res = await fetcher(url.toString(), { headers })
  } catch {
    throw new SourceError('kci', 'network')
  }
  if (!res.ok) throw new SourceError('kci', res.status)
  const parsed = parseKciXml(await res.text())
  if (!parsed.valid) throw new SourceError('kci', 502, 'KCI 오류 응답')
  return parsed.papers
}

/**
 * KCI 한·영 저자 키워드 쌍. 같은 위치의 한국어·영어 키워드를 짝짓는다 (개수가 같을 때만).
 * 영문 검색어 선택과 사전 자동 수집에 쓴다.
 */
export function keywordPairs(papers: RawPaper[]): [string, string][] {
  const pairs: [string, string][] = []
  for (const p of papers) {
    if (p.keywordsKo.length > 0 && p.keywordsKo.length === p.keywordsEn.length) {
      p.keywordsKo.forEach((ko, i) => pairs.push([ko, p.keywordsEn[i]!]))
    }
  }
  return pairs
}
