import type { Mode, SourceKey } from '@suhaengcut/engine'

export type Subject = '국어' | '영어' | '사회' | '과학' | '정보' | '기타'
export type Years = 0 | 5 | 10
export type Sources = Record<SourceKey, boolean>

/** 시작 화면에서 정한 조건 */
export type Draft = {
  mode: Mode
  topic: string
  subject: Subject
  sources: Sources
  years: Years
}

/** 탐구 질문 화면에서 확정한 검색 조건 */
export type Query = {
  question: string
  keywords: string[]
  keywordsEn: string[]
}

export const SUBJECTS: Subject[] = ['국어', '영어', '사회', '과학', '정보', '기타']

export const MODE_LABEL: Record<Mode, string> = { ai: 'AI 허용', search_only: '검색만' }

export const SOURCE_LABEL: Record<SourceKey, string> = { kci: '국내 논문', openalex: '해외 논문', news: '뉴스' }
