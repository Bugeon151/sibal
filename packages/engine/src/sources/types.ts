// 소스 어댑터가 돌려주는 정규화 전 레코드. 엔진 밖으로 나가지 않는다.

import type { Lang } from '../types'

export type RawPaper = {
  source: 'kci' | 'openalex'
  sourceId: string
  doi: string | null
  title: string
  authors: string[]
  journal: string | null
  year: number
  language: Lang
  citedBy: number | null
  isOa: boolean
  url: string
  abstract: string
  keywordsKo: string[]
  keywordsEn: string[]
}

export type RawNews = {
  title: string
  url: string
  description: string
  publishedAt: string
  press: string | null
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly status: number | 'network',
    message?: string,
  ) {
    super(message ?? `${source} 요청 실패 (${status})`)
    this.name = 'SourceError'
  }
}
