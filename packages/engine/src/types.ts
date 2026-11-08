// 화면 ↔ 처리 엔진 공통 타입. docs/데이터-입력-명세.md "공통 데이터 모델"과 일치시킬 것.

export type Mode = 'ai' | 'search_only'
export type Lang = 'ko' | 'en' | 'other'

export type Sentence = { id: string; text: string }

export type SentenceRole = 'purpose' | 'method' | 'result' | 'conclusion'

export type Paper = {
  id: string
  source: 'kci' | 'openalex'
  sourceId: string
  doi: string | null
  title: string
  authors: string[]
  etAl: boolean
  journal: string | null
  year: number
  language: Lang
  citedBy: number | null
  isOa: boolean
  url: string
  score: number
  selectReasons: string[]
  sentences: Sentence[]
  keySentences: { sentenceId: string; role: SentenceRole | null }[]
  definitions: { term: string; sentenceId: string }[]
}

export type News = {
  id: string
  title: string
  press: string | null
  publishedAt: string
  url: string
  sentences: Sentence[]
  score: number
}

export type Direction = 'increase' | 'decrease' | 'no_effect' | 'conditional' | 'none'

export type Comparison = {
  concepts: {
    concept: string
    agreement: 'agree' | 'conflict' | 'mixed' | 'single'
    cells: { paperId: string; direction: Direction; evidence: string[] }[]
  }[]
}

export type Verdict = 'supported' | 'partial' | 'unsupported'

export type ReasonCode = 'match' | 'low_overlap' | 'direction_conflict' | 'number_mismatch' | 'scope_mismatch' | 'group_mismatch' | 'no_evidence'

export type CheckResult = {
  sentence: string
  verdict: Verdict
  evidence: string[]
  reasonCode: ReasonCode
  reason: string
  /** 근거 문장이 영어(해외 논문)라 직접 확인이 필요한 경우 */
  crossLanguage: boolean
  /** 뉴스에서 찾은 참고 문장 (판정에는 쓰지 않음) */
  newsReference: string[]
  scores: { coverage: number; bm25: number }
  suggestPaperIds: string[]
}

export type Disclosure = {
  serviceUsesAi: false
  tools: string[]
  prompts: { label: string; text: string }[]
  scope: string[]
  usedAt: string
  papers: string[]
}

export type SourceKey = 'kci' | 'openalex' | 'news'
export type SourceStatus = 'ok' | 'failed' | 'skipped'

// ── 엔진 함수 입출력 ──

export type SuggestQuestionsInput = { topic: string; subject?: string }
export type SuggestQuestionsOutput = { questions: { id: string; text: string }[]; keywords: string[] }

export type RunResearchInput = {
  mode: Mode
  topic: string
  question: string
  keywords: string[]
  keywordsEn?: string[]
  sources: Record<SourceKey, boolean>
  years: 0 | 5 | 10
}

export type RunResearchOutput = {
  researchId: string
  mode: Mode
  papers: Paper[]
  news: News[]
  comparison: Comparison
  keywordsEn: string[]
  sourceStatus: Record<SourceKey, SourceStatus>
  cached: boolean
}

export type CheckSentencesInput = { researchId: string; text: string }

/** 보완 논문 제안용 후보 (선별되지 않은 논문의 서지) */
export type CandidatePaper = Pick<Paper, 'id' | 'source' | 'title' | 'authors' | 'etAl' | 'journal' | 'year' | 'url' | 'doi'>

export type CheckSentencesOutput = {
  results: CheckResult[]
  truncated: boolean
  /** results[].suggestPaperIds가 가리키는 후보 논문 */
  candidates: CandidatePaper[]
}

export type BuildPackageInput = { researchId: string }
export type BuildPackageOutput = { text: string; promptId: string }

export type BuildDisclosureInput = {
  researchId: string
  tools: string[]
  extraPrompts: string[]
  scope: string[]
}
export type BuildDisclosureOutput = { disclosure: Disclosure; text: string }
