// 처리 엔진. 화면은 createEngine()이 돌려주는 함수 6개만 부른다.
// 외부 호출은 OpenAlex(직접), KCI·네이버(중계 함수) 세 곳뿐이고, AI 호출은 없다.

import { config } from './config'
import { EngineError } from './errors'
import { buildComparison } from './features/compare'
import { checkText, type EvidenceSentence } from './features/check'
import { extractKeySentences } from './features/keySentences'
import { extractKeywords, parseTopic, questionsFor } from './features/questions'
import { dedupePapers, scoreAndSelectNews, scorePapers, selectPapers, type ScoredPaper } from './features/select'
import { apaReference, buildDisclosureText, buildPackageText, newsReference } from './features/templates'
import { Dictionary, keyOf } from './lexicon/dictionary'
import { keywordPairs, searchKci } from './sources/kci'
import { searchNews } from './sources/naver'
import { searchOpenAlex } from './sources/openalex'
import { SourceError, type Fetcher, type RawNews, type RawPaper } from './sources/types'
import { defaultStore, type KeyValueStore } from './store'
import { cleanInput, detectLang } from './text/normalize'
import { splitSentences } from './text/sentences'
import { TOPIC_STOP } from './text/stopwords'
import { defaultTokenizer, uniqueTokens, type Tokenizer } from './text/tokenizer'
import type {
  BuildDisclosureInput,
  BuildDisclosureOutput,
  BuildPackageInput,
  BuildPackageOutput,
  CandidatePaper,
  CheckSentencesInput,
  CheckSentencesOutput,
  Disclosure,
  Mode,
  News,
  Paper,
  RunResearchInput,
  RunResearchOutput,
  Sentence,
  SourceKey,
  SourceStatus,
  SuggestQuestionsInput,
  SuggestQuestionsOutput,
} from './types'

export type EngineOptions = {
  /**
   * 키 중계 함수 주소 (예: https://relay.example.com/).
   * 없으면(null) 키가 필요한 KCI·뉴스는 건너뛰고(skipped), OpenAlex만 브라우저에서 직접 검색한다.
   */
  relayBaseUrl?: string | null
  fetch?: Fetcher
  store?: KeyValueStore
  tokenizer?: Tokenizer
  dictionary?: Dictionary
  now?: () => Date
  uuid?: () => string
  /**
   * OpenAlex 호출 경로.
   * - 'auto'(기본): 브라우저에서 키 없이 직접 호출 → 한도(429·403)나 네트워크 오류면 중계 함수로 재시도.
   *   한도가 사용자 IP별이라 무료 공개로 사용자가 늘어도 각자 한도를 쓴다. 학교처럼 IP를 공유해 막히면 중계 키로 넘어간다.
   * - 'direct': 직접 호출만 / 'relay': 중계 함수만
   */
  openAlexRoute?: 'auto' | 'direct' | 'relay'
  /** 중계 함수 호출 제한용 임의 기기 ID. 화면 쪽에서 localStorage에 한 번 만들어 넘긴다. */
  deviceId?: string
}

type PoolEntry = CandidatePaper & { text: string }

type ResearchState = {
  id: string
  mode: Mode
  question: string
  papers: Paper[]
  news: News[]
  pool: PoolEntry[]
  packagePrompt?: { id: string; text: string }
}

const RESEARCH_KEY = (id: string) => `research:${id}`

export function createEngine(opts: EngineOptions) {
  const fetcher: Fetcher = opts.fetch ?? ((input, init) => fetch(input, init))
  const store = opts.store ?? defaultStore()
  const tokenizer = opts.tokenizer ?? defaultTokenizer
  const dict = opts.dictionary ?? new Dictionary()
  const now = opts.now ?? (() => new Date())
  const uuid = opts.uuid ?? (() => crypto.randomUUID())
  const relay = opts.relayBaseUrl?.trim() || null
  const relayHeaders = { 'X-Device-Id': opts.deviceId ?? uuid() }

  // ── 입력 검증 ──

  function requireText(value: unknown, min: number, max: number, field: string): string {
    if (typeof value !== 'string') throw new EngineError('INVALID_INPUT', `${field}을(를) 입력해 주세요.`)
    const v = cleanInput(value)
    if (v.length < min || v.length > max) throw new EngineError('INVALID_INPUT', `${field}은(는) ${min}~${max}자로 입력해 주세요.`)
    return v
  }

  function cleanKeywords(list: unknown, field: string, required: boolean): string[] {
    const arr = Array.isArray(list) ? list : []
    const out = [...new Set(arr.map((k) => (typeof k === 'string' ? cleanInput(k) : '')).filter(Boolean))]
    if (required && out.length === 0) throw new EngineError('INVALID_INPUT', `${field}를 1개 이상 입력해 주세요.`)
    if (out.length > config.limits.keywordsMax || out.some((k) => k.length > config.limits.keywordMaxLen)) {
      throw new EngineError('INVALID_INPUT', `${field}는 ${config.limits.keywordsMax}개까지, 각 ${config.limits.keywordMaxLen}자까지 입력해 주세요.`)
    }
    return out
  }

  async function loadState(researchId: string): Promise<ResearchState> {
    const s = await store.get<ResearchState>(RESEARCH_KEY(researchId))
    if (!s) throw new EngineError('EXPIRED')
    return s
  }

  function requireAiMode(state: ResearchState) {
    if (state.mode !== 'ai') throw new EngineError('MODE_FORBIDDEN')
  }

  // ── 소스 호출 (기기 캐시 포함) ──

  async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const hit = await store.get<T>(key)
    if (hit !== undefined) return { value: hit, cached: true }
    const value = await load()
    // 빈 결과는 캐시하지 않는다 (일시 오류로 0건이 7일간 남지 않게)
    if (!Array.isArray(value) || value.length > 0) await store.set(key, value, ttl)
    return { value, cached: false }
  }

  // 검색어로 쓰기엔 너무 일반적인 키워드 (영문 검색어에서 뺀다)
  const GENERIC_KO = new Set(['사용', '이용', '활용', '활동', '정도', '수준', '방법', '요인'])

  function englishKeywords(keywords: string[], kciPapers: RawPaper[]): string[] {
    // 한국어 키워드마다 대표 영어 1개를 먼저, 남는 자리는 두 번째 표현으로 채운다
    // (한 키워드의 여러 표현이 자리를 다 차지해 '수면' 같은 핵심어가 빠지지 않게)
    const perKeyword = keywords
      .flatMap((k) => keyOf(k))
      .filter((t) => !GENERIC_KO.has(t))
      .map((t) => dict.englishPhrases(t))
      .filter((list) => list.length > 0)
    const fromDict: string[] = []
    for (let round = 0; round < 2; round++) for (const list of perKeyword) if (list[round]) fromDict.push(list[round]!)
    // KCI 한·영 키워드 쌍에서 우리 키워드와 짝지어진 영어 키워드를 빈도순으로
    const ours = new Set(keywords.flatMap((k) => tokenizer.tokens(k)))
    const freq = new Map<string, number>()
    for (const [ko, en] of keywordPairs(kciPapers)) {
      if (tokenizer.tokens(ko).some((t) => ours.has(t))) freq.set(en.toLowerCase(), (freq.get(en.toLowerCase()) ?? 0) + 1)
    }
    const fromKci = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([en]) => en)
    return [...new Set([...fromDict, ...fromKci])].slice(0, config.limits.keywordsMax)
  }

  // ── 문장·논문 조립 ──

  function toSentences(prefix: string, text: string): Sentence[] {
    return splitSentences(text).map((t, i) => ({ id: `${prefix}-S${i + 1}`, text: t }))
  }

  function buildPaper(p: ScoredPaper, id: string, queryTokens: string[]): Paper {
    const sentences = toSentences(id, p.abstract)
    const tokens = sentences.map((s) => tokenizer.tokens(s.text))
    const { keySentences, definitions } = extractKeySentences(sentences, tokens, queryTokens.flatMap((q) => [...dict.expand(q)]))
    return {
      id,
      source: p.source,
      sourceId: p.sourceId,
      doi: p.doi,
      title: p.title,
      authors: p.authors.slice(0, 3),
      etAl: p.authors.length > 3,
      journal: p.journal,
      year: p.year,
      language: p.language,
      citedBy: p.citedBy,
      isOa: p.isOa,
      url: p.url,
      pageUrl: p.pageUrl,
      fullTextUrl: p.fullTextUrl,
      score: p.score,
      selectReasons: p.selectReasons,
      sentences,
      keySentences,
      definitions,
    }
  }

  // ── 엔진 함수 ──

  async function suggestQuestions(input: SuggestQuestionsInput): Promise<SuggestQuestionsOutput> {
    const topic = requireText(input?.topic, config.limits.topicMin, config.limits.topicMax, '탐구 주제')
    const questions = questionsFor(parseTopic(topic)).map((text, i) => ({ id: `q${i + 1}`, text }))
    return { questions, keywords: extractKeywords(topic, tokenizer) }
  }

  async function runResearch(input: RunResearchInput): Promise<RunResearchOutput> {
    if (input?.mode !== 'ai' && input?.mode !== 'search_only') throw new EngineError('INVALID_INPUT', '모드를 선택해 주세요.')
    requireText(input.topic, config.limits.topicMin, config.limits.topicMax, '탐구 주제')
    const question = requireText(input.question, config.limits.questionMin, config.limits.questionMax, '탐구 질문')
    const keywords = cleanKeywords(input.keywords, '키워드', true)
    let keywordsEn = cleanKeywords(input.keywordsEn, '영문 키워드', false)
    const sources = input.sources ?? { kci: true, openalex: true, news: true }
    if (!sources.kci && !sources.openalex && !sources.news) throw new EngineError('INVALID_INPUT', '검색 범위를 1개 이상 켜 주세요.')
    if (![0, 5, 10].includes(input.years)) throw new EngineError('INVALID_INPUT', '기간을 다시 선택해 주세요.')

    const nowDate = now()
    const nowYear = nowDate.getFullYear()
    const fromYear = input.years === 0 ? null : nowYear - input.years + 1
    const koQuery = keywords.join(' ')
    const queryTokens = uniqueTokens(tokenizer.tokens(`${question} ${keywords.join(' ')}`)).filter((t) => !TOPIC_STOP.has(t))

    const status: Record<SourceKey, SourceStatus> = { kci: 'skipped', openalex: 'skipped', news: 'skipped' }
    const errors: SourceError[] = []
    let anyCached = false

    const attempt = async <T>(key: SourceKey, run: () => Promise<{ value: T; cached: boolean }>): Promise<T | null> => {
      try {
        const r = await run()
        status[key] = 'ok'
        anyCached ||= r.cached
        return r.value
      } catch (e) {
        status[key] = 'failed'
        errors.push(e instanceof SourceError ? e : new SourceError(key, 'network'))
        return null
      }
    }

    // KCI는 제목 검색이라 키워드를 다 넣으면 0건일 수 있다 → 0건이면 앞의 핵심 키워드 2개로 한 번 더
    const kciSearch = async () => {
      const first = await searchKci(fetcher, relay!, { query: koQuery, fromYear }, relayHeaders)
      if (first.length > 0 || keywords.length <= 2) return first
      return searchKci(fetcher, relay!, { query: keywords.slice(0, 2).join(' '), fromYear }, relayHeaders)
    }
    const kciP = sources.kci && relay
      ? attempt('kci', () => cached(`cache:kci:${koQuery}:${fromYear}`, config.ttl.paperCacheMs, kciSearch))
      : Promise.resolve(null)
    const newsP = sources.news && relay
      ? attempt('news', () => cached(`cache:news:${koQuery}`, config.ttl.newsCacheMs, () => searchNews(fetcher, relay, { query: koQuery }, relayHeaders)))
      : Promise.resolve(null)

    // 영문 검색어: 학생 입력 → 사전 → (없으면) KCI 한·영 키워드
    if (keywordsEn.length === 0) keywordsEn = englishKeywords(keywords, [])
    const openAlexP = (async () => {
      if (!sources.openalex) return null
      if (keywordsEn.length === 0) keywordsEn = englishKeywords(keywords, (await kciP) ?? [])
      // 영문 검색어가 없으면 한국어 키워드로 검색한다 (OpenAlex에도 한국어 논문이 일부 있다)
      const enQuery = keywordsEn.length > 0 ? keywordsEn.join(' ') : koQuery
      // 중계 함수가 없으면 직접 호출만
      const route = relay ? (opts.openAlexRoute ?? 'auto') : 'direct'
      const viaRelay = () => searchOpenAlex(fetcher, { query: enQuery, fromYear, relayBase: relay! }, relayHeaders)
      const direct = () => searchOpenAlex(fetcher, { query: enQuery, fromYear })
      const load =
        route === 'relay'
          ? viaRelay
          : route === 'direct'
            ? direct
            : async () => {
                try {
                  return await direct()
                } catch (e) {
                  const retry = e instanceof SourceError && (e.status === 429 || e.status === 403 || e.status === 'network')
                  if (!retry) throw e
                  return viaRelay()
                }
              }
      return attempt('openalex', () => cached(`cache:openalex:${enQuery}:${fromYear}`, config.ttl.paperCacheMs, load))
    })()

    const [kciPapers, newsRaw, openAlexPapers] = await Promise.all([kciP, newsP, openAlexP])

    const enabled = (Object.keys(sources) as SourceKey[]).filter((k) => sources[k])
    if (enabled.every((k) => status[k] !== 'ok')) {
      if (errors.length > 0 && errors.every((e) => e.status === 'network')) throw new EngineError('OFFLINE')
      if (errors.some((e) => e.status === 429)) throw new EngineError('RATE_LIMITED')
      if (errors.length > 0) throw new EngineError('SOURCES_DOWN')
    }

    // 논문: 중복 제거 → 점수 → 선별 → 조립
    const rawPapers = dedupePapers([...(kciPapers ?? []), ...(openAlexPapers ?? [])])
    const sentenceCount = (p: RawPaper) => splitSentences(p.abstract).length
    const keywordSets = uniqueTokens(keywords.flatMap((k) => tokenizer.tokens(k)))
      .filter((t) => !GENERIC_KO.has(t))
      .map((t) => dict.expand(t))
    const scored = scorePapers(rawPapers, queryTokens.flatMap((q) => [...dict.expand(q)]), tokenizer, sentenceCount, nowYear, keywordSets)
    const { selected, pool } = selectPapers(scored)
    const papers = selected.map((p, i) => buildPaper(p, `P${i + 1}`, queryTokens))

    // 뉴스
    const pickedNews = scoreAndSelectNews((newsRaw ?? []) as RawNews[], queryTokens, tokenizer, nowDate)
    const news: News[] = pickedNews.map((n, i) => ({
      id: `N${i + 1}`,
      title: n.title,
      press: n.press,
      publishedAt: n.publishedAt,
      url: n.url,
      sentences: toSentences(`N${i + 1}`, n.description),
      score: n.score,
    }))

    if (papers.length === 0 && news.length === 0) throw new EngineError('NO_RESULTS')

    const comparison = buildComparison(
      papers.map((p) => ({ paperId: p.id, sentences: p.sentences, tokens: p.sentences.map((s) => tokenizer.tokens(s.text)) })),
      dict,
      tokenizer,
      queryTokens,
    )

    const id = uuid()
    const state: ResearchState = {
      id,
      mode: input.mode,
      question,
      papers,
      news,
      pool: pool.map((p, i) => ({
        id: `C${i + 1}`,
        source: p.source,
        title: p.title,
        authors: p.authors.slice(0, 3),
        etAl: p.authors.length > 3,
        journal: p.journal,
        year: p.year,
        url: p.url,
      pageUrl: p.pageUrl,
      fullTextUrl: p.fullTextUrl,
        doi: p.doi,
        text: `${p.title} ${p.abstract}`,
      })),
    }
    await store.set(RESEARCH_KEY(id), state, config.ttl.researchMs)

    return { researchId: id, mode: input.mode, papers, news, comparison, keywordsEn, sourceStatus: status, cached: anyCached }
  }

  async function checkSentences(input: CheckSentencesInput): Promise<CheckSentencesOutput> {
    const state = await loadState(input?.researchId)
    if (typeof input.text !== 'string' || !input.text.trim()) throw new EngineError('INVALID_INPUT', '검사할 문장을 입력해 주세요.')
    if (input.text.length > config.check.maxChars) {
      throw new EngineError('INVALID_INPUT', `문장은 ${config.check.maxChars}자까지 검사할 수 있어요.`)
    }
    const toEvidence = (s: Sentence): EvidenceSentence => ({ ...s, tokens: tokenizer.tokens(s.text), lang: detectLang(s.text) })
    const { results, truncated } = checkText(input.text, {
      tokenizer,
      dict,
      paperSentences: state.papers.flatMap((p) => p.sentences.map(toEvidence)),
      newsSentences: state.news.flatMap((n) => n.sentences.map(toEvidence)),
      pool: state.pool.map((c) => ({ paperId: c.id, tokens: tokenizer.tokens(c.text) })),
    })
    const used = new Set(results.flatMap((r) => r.suggestPaperIds))
    const candidates = state.pool.filter((c) => used.has(c.id)).map(({ text: _text, ...c }) => c)
    return { results, truncated, candidates }
  }

  async function buildPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
    const state = await loadState(input?.researchId)
    requireAiMode(state)
    const byId = new Map(state.papers.flatMap((p) => p.sentences).map((s) => [s.id, s.text]))
    const text = buildPackageText({ question: state.question, papers: state.papers, news: state.news, sentenceText: (id) => byId.get(id) })
    const promptId = uuid()
    state.packagePrompt = { id: promptId, text }
    await store.set(RESEARCH_KEY(state.id), state, config.ttl.researchMs)
    return { text, promptId }
  }

  async function buildDisclosure(input: BuildDisclosureInput): Promise<BuildDisclosureOutput> {
    const state = await loadState(input?.researchId)
    requireAiMode(state)
    const tools = cleanKeywords(input.tools, '사용한 AI', true)
    const scope = [...new Set((input.scope ?? []).map((s) => cleanInput(String(s))).filter(Boolean))]
    if (scope.length === 0) throw new EngineError('INVALID_INPUT', '활용 범위를 1개 이상 선택해 주세요.')
    const extra = (input.extraPrompts ?? []).map((p) => String(p).trim()).filter(Boolean)
    if (extra.some((p) => p.length > config.limits.extraPromptMax)) {
      throw new EngineError('INVALID_INPUT', `추가 프롬프트는 각 ${config.limits.extraPromptMax}자까지 입력할 수 있어요.`)
    }
    const prompts: Disclosure['prompts'] = []
    if (state.packagePrompt) prompts.push({ label: '자료 패키지 프롬프트 (본 서비스에서 복사)', text: state.packagePrompt.text })
    extra.forEach((text, i) => prompts.push({ label: `추가 프롬프트 ${i + 1}`, text }))

    const disclosure: Disclosure = {
      serviceUsesAi: false,
      tools,
      prompts,
      scope,
      usedAt: now().toISOString(),
      papers: [...state.papers.map(apaReference), ...state.news.map(newsReference)],
    }
    return { disclosure, text: buildDisclosureText(disclosure) }
  }

  async function buildReferences(input: { researchId: string; style?: 'apa' }): Promise<{ items: string[] }> {
    const state = await loadState(input?.researchId)
    return { items: [...state.papers.map(apaReference), ...state.news.map(newsReference)] }
  }

  /** "기록 지우기": 기기 안의 리서치·캐시를 모두 삭제 */
  async function clearAll(): Promise<void> {
    await store.clear()
  }

  return { suggestQuestions, runResearch, checkSentences, buildPackage, buildDisclosure, buildReferences, clearAll }
}

export type Engine = ReturnType<typeof createEngine>
