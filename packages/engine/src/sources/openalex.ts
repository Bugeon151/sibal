// OpenAlex (해외 논문). 브라우저에서 직접 호출. 필드는 공식 문서 기준
// https://help.openalex.org/api-entities/works/work-object

import { detectLang, normalizeDoi } from '../text/normalize'
import { SourceError, type Fetcher, type RawPaper } from './types'

const BASE = 'https://api.openalex.org/works'
const SELECT = [
  'id',
  'doi',
  'title',
  'publication_year',
  'language',
  'type',
  'authorships',
  'primary_location',
  'cited_by_count',
  'abstract_inverted_index',
  'open_access',
].join(',')

const ALLOWED_TYPES = new Set(['article', 'review', 'preprint', 'book-chapter'])

type OpenAlexWork = {
  id: string
  doi: string | null
  title: string | null
  publication_year: number | null
  language: string | null
  type: string | null
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
  open_access?: { is_oa?: boolean; oa_url?: string | null }
}

export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word
  }
  return words.filter((w) => w !== undefined).join(' ')
}

export function parseOpenAlexWork(w: OpenAlexWork): RawPaper | null {
  if (!w.title || !w.publication_year) return null
  if (w.type && !ALLOWED_TYPES.has(w.type)) return null
  const abstract = reconstructAbstract(w.abstract_inverted_index)
  const doi = normalizeDoi(w.doi)
  return {
    source: 'openalex',
    sourceId: w.id.replace('https://openalex.org/', ''),
    doi,
    title: w.title,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
    journal: w.primary_location?.source?.display_name ?? null,
    year: w.publication_year,
    language: w.language === 'ko' ? 'ko' : w.language === 'en' ? 'en' : detectLang(abstract || w.title),
    citedBy: w.cited_by_count ?? null,
    isOa: w.open_access?.is_oa ?? false,
    url: w.open_access?.oa_url ?? (doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? w.id)),
    abstract,
    keywordsKo: [],
    keywordsEn: [],
  }
}

/**
 * relayBase가 없으면 브라우저에서 OpenAlex를 직접 호출한다 (키 없음, 사용자 IP마다 하루 약 100회).
 * relayBase가 있으면 중계 함수를 거친다 (중계에서 무료 키를 붙임, 전체 사용자가 하루 약 1,000회를 나눠 씀).
 * 직접 호출에는 사용자 정의 헤더를 넣지 않는다 (OpenAlex CORS 허용 헤더에 없어 사전 요청이 실패한다).
 */
export async function searchOpenAlex(
  fetcher: Fetcher,
  params: { query: string; fromYear: number | null; perPage?: number; relayBase?: string },
  headers: Record<string, string> = {},
): Promise<RawPaper[]> {
  let url: URL
  if (params.relayBase) {
    url = new URL('openalex', params.relayBase.endsWith('/') ? params.relayBase : `${params.relayBase}/`)
    url.searchParams.set('q', params.query)
    if (params.fromYear) url.searchParams.set('fromYear', String(params.fromYear))
    url.searchParams.set('perPage', String(params.perPage ?? 25))
  } else {
    url = new URL(BASE)
    url.searchParams.set('search', params.query)
    if (params.fromYear) url.searchParams.set('filter', `publication_year:>${params.fromYear - 1}`)
    url.searchParams.set('per-page', String(params.perPage ?? 25))
    url.searchParams.set('select', SELECT)
  }

  let res: Response
  try {
    res = await fetcher(url.toString(), params.relayBase ? { headers } : undefined)
  } catch {
    throw new SourceError('openalex', 'network')
  }
  if (!res.ok) throw new SourceError('openalex', res.status)
  const body = (await res.json()) as { results?: OpenAlexWork[] }
  return (body.results ?? []).map(parseOpenAlexWork).filter((p): p is RawPaper => p !== null)
}
