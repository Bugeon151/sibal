// Wikidata로 한국어 용어의 영어 이름 찾기 (사전에 없는 단어만). AI가 아니라 공개 지식 DB 조회다.
// 브라우저에서 키 없이 직접 부른다 (CORS: origin=*). 한국어 이름·별칭이 '정확히' 같은 항목만 받는다
// (일자리 → "job sharing" 같은 엉뚱한 항목을 막기 위해).

import type { Fetcher } from './types'

const API = 'https://www.wikidata.org/w/api.php'

type SearchHit = { id: string; match?: { type?: string; text?: string; language?: string } }

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

async function getJson(fetcher: Fetcher, params: Record<string, string>): Promise<unknown> {
  const url = new URL(API)
  for (const [k, v] of Object.entries({ ...params, format: 'json', origin: '*' })) url.searchParams.set(k, v)
  const res = await fetcher(url.toString())
  if (!res.ok) throw new Error(`wikidata ${res.status}`)
  return res.json()
}

/** 용어마다 정확히 일치하는 Wikidata 항목의 영어 이름 (없으면 빠짐). 실패해도 빈 결과를 돌려준다 */
export async function lookupEnglish(fetcher: Fetcher, terms: string[]): Promise<Record<string, string>> {
  const idOf = new Map<string, string>()
  await Promise.all(
    terms.map(async (term) => {
      try {
        const body = (await getJson(fetcher, { action: 'wbsearchentities', search: term, language: 'ko', type: 'item', limit: '5' })) as {
          search?: SearchHit[]
        }
        const exact = (body.search ?? []).find(
          (h) => (h.match?.type === 'label' || h.match?.type === 'alias') && h.match.language === 'ko' && norm(h.match.text ?? '') === norm(term),
        )
        if (exact) idOf.set(term, exact.id)
      } catch {
        // 조회 실패는 무시한다 (사전·한국어 검색으로 계속)
      }
    }),
  )
  if (idOf.size === 0) return {}
  try {
    const body = (await getJson(fetcher, {
      action: 'wbgetentities',
      ids: [...new Set(idOf.values())].join('|'),
      props: 'labels',
      languages: 'en',
    })) as { entities?: Record<string, { labels?: { en?: { value?: string } } }> }
    const out: Record<string, string> = {}
    for (const [term, id] of idOf) {
      const en = body.entities?.[id]?.labels?.en?.value
      if (en && /^[\x20-\x7e]+$/.test(en)) out[term] = en.toLowerCase()
    }
    return out
  } catch {
    return {}
  }
}
