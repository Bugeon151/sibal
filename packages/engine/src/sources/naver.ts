// 네이버 뉴스 검색. Client Secret 노출 방지를 위해 중계 함수를 거친다.
// 응답 필드(title, originallink, link, description, pubDate)는 알려진 형식이며 키 발급 후 확인한다.
// 뉴스 소스를 바꿀 때는 이 파일만 교체하고 RawNews 형식을 유지한다.

import { stripHtml } from '../text/normalize'
import { SourceError, type Fetcher, type RawNews } from './types'

type NaverItem = { title?: string; originallink?: string; link?: string; description?: string; pubDate?: string }

const PRESS_BY_DOMAIN: Record<string, string> = {
  'yna.co.kr': '연합뉴스',
  'chosun.com': '조선일보',
  'joongang.co.kr': '중앙일보',
  'donga.com': '동아일보',
  'hani.co.kr': '한겨레',
  'khan.co.kr': '경향신문',
  'hankookilbo.com': '한국일보',
  'kmib.co.kr': '국민일보',
  'mk.co.kr': '매일경제',
  'hankyung.com': '한국경제',
  'kbs.co.kr': 'KBS',
  'imbc.com': 'MBC',
  'sbs.co.kr': 'SBS',
  'ytn.co.kr': 'YTN',
  'newsis.com': '뉴시스',
  'news1.kr': '뉴스1',
  'hangyo.com': '한국교육신문',
  'veritas-a.com': '베리타스알파',
  'edaily.co.kr': '이데일리',
  'seoul.co.kr': '서울신문',
}

export function pressFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^(www|m|news|n)\./, '')
    for (const [domain, name] of Object.entries(PRESS_BY_DOMAIN)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name
    }
    return host
  } catch {
    return null
  }
}

export function parseNaverNews(body: { items?: NaverItem[] }): RawNews[] {
  return (body.items ?? [])
    .map((it) => {
      const url = it.originallink || it.link || ''
      const t = it.pubDate ? Date.parse(it.pubDate) : NaN
      return {
        title: stripHtml(it.title ?? ''),
        url,
        description: stripHtml(it.description ?? ''),
        publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : '',
        press: url ? pressFromUrl(url) : null,
      }
    })
    .filter((n) => n.title && n.url)
}

export async function searchNews(fetcher: Fetcher, relayBase: string, params: { query: string; display?: number }, headers: Record<string, string> = {}): Promise<RawNews[]> {
  const url = new URL('news', relayBase.endsWith('/') ? relayBase : `${relayBase}/`)
  url.searchParams.set('q', params.query)
  url.searchParams.set('display', String(params.display ?? 20))

  let res: Response
  try {
    res = await fetcher(url.toString(), { headers })
  } catch {
    throw new SourceError('news', 'network')
  }
  if (!res.ok) throw new SourceError('news', res.status)
  return parseNaverNews((await res.json()) as { items?: NaverItem[] })
}
