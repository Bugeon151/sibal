// F2 정규화·중복 제거, F3 선별 점수

import { config } from '../config'
import { Bm25Index, normalizeByMax } from '../rank/bm25'
import type { RawNews, RawPaper } from '../sources/types'
import { normalizeDoi, titleKey } from '../text/normalize'
import type { Tokenizer } from '../text/tokenizer'

export type ScoredPaper = RawPaper & { score: number; selectReasons: string[]; sentenceCount: number; topicCoverage: number }
export type ScoredNews = RawNews & { score: number }

/**
 * 중복 제거. DOI가 같거나, (DOI가 서로 다르지 않으면서) 제목이 충분히 길고 같고 연도가 같으면 같은 논문으로 본다.
 * "Introduction" 같은 흔한 짧은 제목(한글 10자·그 외 20자 미만)은 제목만으로 합치지 않는다. 겹치면 정보가 많은 레코드를 남기고,
 * DOI는 그룹 안에서 하나로 정해질 때만 채운다 (다른 논문의 DOI를 붙이지 않는다).
 */
export function dedupePapers(papers: RawPaper[]): RawPaper[] {
  const groups: RawPaper[][] = []
  const groupDoi: (string | null)[] = []
  const byKey = new Map<string, number>()

  for (const p of papers) {
    if (!p.title.trim()) continue
    const doi = normalizeDoi(p.doi)
    const tk = titleKey(p.title)
    const hits = new Set<number>()
    if (doi && byKey.has(`doi:${doi}`)) hits.add(byKey.get(`doi:${doi}`)!)
    // 제목만으로 합칠 만큼 긴 제목인지 (한글 10자, 그 외 20자 이상)
    const longEnough = /[가-힣]/.test(tk) ? tk.length >= 10 : tk.length >= 20
    const titleK = longEnough ? `t:${tk}:${p.year}` : null
    if (titleK && byKey.has(titleK)) {
      const g = byKey.get(titleK)!
      // 제목이 같아도 DOI가 서로 다르면 다른 논문
      if (!(doi && groupDoi[g] && groupDoi[g] !== doi)) hits.add(g)
    }

    let gi: number
    const list = [...hits]
    if (list.length === 0) {
      gi = groups.length
      groups.push([p])
      groupDoi.push(doi)
    } else {
      gi = list[0]!
      groups[gi]!.push(p)
      groupDoi[gi] ??= doi
      for (const other of list.slice(1)) {
        groups[gi]!.push(...groups[other]!)
        groupDoi[gi] ??= groupDoi[other]!
        groups[other] = []
        for (const [k, v] of byKey) if (v === other) byKey.set(k, gi)
      }
    }
    if (doi) byKey.set(`doi:${doi}`, gi)
    if (titleK) byKey.set(titleK, gi)
  }

  const richness = (p: RawPaper) => p.abstract.length * 1000 + (p.citedBy ?? 0)
  return groups
    .filter((g) => g.length > 0)
    .map((g) => {
      const best = [...g].sort((a, b) => richness(b) - richness(a))[0]!
      const dois = new Set(g.map((x) => normalizeDoi(x.doi)).filter((d): d is string => d !== null))
      const doi = dois.size === 1 ? [...dois][0]! : normalizeDoi(best.doi)
      return { ...best, doi }
    })
}

export function scorePapers(
  papers: RawPaper[],
  queryTokens: string[],
  tokenizer: Tokenizer,
  sentenceCount: (p: RawPaper) => number,
  nowYear: number,
  /** 핵심 키워드별 동치 집합 (동의어·영어 포함). 제목·초록에 몇 개가 들어 있는지로 주제 포함률을 본다 */
  keywordSets: Set<string>[] = [],
): ScoredPaper[] {
  const w = config.paperScore
  const docTokens = papers.map((p) => tokenizer.tokens(`${p.title} ${p.abstract}`))
  const bm = new Bm25Index(docTokens)
  // 주제 포함률: 핵심 키워드 중 제목·초록에 나오는 비율. 인용이 많아도 주제가 빠진 논문이 뽑히지 않게 점수에 곱한다
  const coverage = docTokens.map((tokens, i) => {
    // 영어 논문에는 영어 표현이 있는 키워드만 따진다 (영어로 옮길 수 없는 키워드 때문에 모든 논문이 낮게 나오지 않게)
    const english = !/[가-힣]/.test(papers[i]!.title)
    const sets = english ? keywordSets.filter((forms) => [...forms].some((f) => /^[a-z]/.test(f))) : keywordSets
    if (sets.length === 0) return 1
    const set = new Set(tokens)
    return sets.filter((forms) => [...forms].some((f) => set.has(f))).length / sets.length
  })
  const kw = normalizeByMax(bm.scoreAll(queryTokens))
  const cites = normalizeByMax(papers.map((p) => Math.log(1 + (p.citedBy ?? 0))))
  const citeRank = papers
    .map((p, i) => ({ i, c: p.citedBy ?? 0 }))
    .sort((a, b) => b.c - a.c)
    .map((x) => x.i)

  return papers.map((p, i) => {
    const recency = Math.max(0, 1 - (nowYear - p.year) / w.recencyYears)
    const base = w.keyword * kw[i]! + w.citation * cites[i]! + w.recency * recency + w.oa * (p.isOa ? 1 : 0)
    const score = base * (0.4 + 0.6 * coverage[i]!)
    const reasons: string[] = []
    if (kw[i]! >= 0.7 && coverage[i]! >= 0.99) reasons.push('주제와 잘 맞음')
    if ((p.citedBy ?? 0) > 0 && citeRank.indexOf(i) < Math.max(1, Math.ceil(papers.length * 0.2))) reasons.push('피인용 상위')
    if (nowYear - p.year <= 5) reasons.push('최근 5년')
    if (p.isOa) reasons.push('원문 공개')
    if (p.source === 'kci') reasons.push('국내 학술지')
    return { ...p, score: Math.round(score * 10) / 10, selectReasons: reasons, sentenceCount: sentenceCount(p), topicCoverage: coverage[i]! }
  })
}

/** 상위 3~5편. 초록 문장이 부족하면 맨 뒤. 두 소스가 다 있으면 소스별 최소 1편. */
export function selectPapers(all: ScoredPaper[]): { selected: ScoredPaper[]; pool: ScoredPaper[] } {
  const s = config.paperSelect
  // 핵심 키워드를 대부분(2/3 이상) 담은 논문이 최소 편수만큼 있으면, 절반 이하만 담은 논문은 선별에서 뺀다 (후보 풀에는 남김)
  const onTopic = all.filter((p) => p.topicCoverage >= 0.66)
  const scored = onTopic.length >= s.min ? all.filter((p) => p.topicCoverage > 0.5) : all
  const ranked = [...scored].sort((a, b) => {
    const aOk = a.sentenceCount >= s.minSentences ? 1 : 0
    const bOk = b.sentenceCount >= s.minSentences ? 1 : 0
    return bOk - aOk || b.score - a.score
  })
  const high = ranked.filter((p) => p.score >= s.highScore && p.sentenceCount >= s.minSentences).length
  const n = Math.min(ranked.length, high > s.max ? s.max : Math.max(s.min, Math.min(high, s.max)))
  let selected = ranked.slice(0, n)

  for (const src of ['kci', 'openalex'] as const) {
    if (selected.some((p) => p.source === src)) continue
    const best = ranked.find((p) => p.source === src && p.sentenceCount >= s.minSentences)
    if (!best || selected.length === 0) continue
    // 같은 소스가 2편 이상인 것 중 가장 낮은 점수를 교체
    const counts = new Map<string, number>()
    for (const p of selected) counts.set(p.source, (counts.get(p.source) ?? 0) + 1)
    let replaceAt = -1
    for (let i = selected.length - 1; i >= 0; i--) {
      if ((counts.get(selected[i]!.source) ?? 0) > 1) {
        replaceAt = i
        break
      }
    }
    if (replaceAt >= 0) selected[replaceAt] = best
    else if (selected.length < s.max) selected.push(best)
  }
  selected = selected.sort(
    (a, b) => Number(b.sentenceCount >= s.minSentences) - Number(a.sentenceCount >= s.minSentences) || b.score - a.score,
  )
  const chosen = new Set(selected)
  const pool = [...all].sort((a, b) => b.score - a.score).filter((p) => !chosen.has(p)).slice(0, config.candidatePoolSize)
  return { selected, pool }
}

// ── 뉴스 ──

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

export function scoreAndSelectNews(news: RawNews[], queryTokens: string[], tokenizer: Tokenizer, now: Date): ScoredNews[] {
  const w = config.newsScore
  const bm = new Bm25Index(news.map((n) => tokenizer.tokens(`${n.title} ${n.description}`)))
  const kw = normalizeByMax(bm.scoreAll(queryTokens))
  const scored = news
    .map((n, i) => {
      const t = Date.parse(n.publishedAt)
      const days = Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 86_400_000) : 365
      const score = w.keyword * kw[i]! + w.recency * Math.pow(2, -days / w.halfLifeDays)
      return { ...n, score: Math.round(score * 10) / 10 }
    })
    .filter((_, i) => kw[i]! > 0)
    .sort((a, b) => b.score - a.score)

  // 같은 사건 기사 제거 (제목 토큰 자카드)
  const kept: { n: ScoredNews; tokens: Set<string> }[] = []
  for (const n of scored) {
    const tokens = new Set(tokenizer.tokens(n.title))
    if (kept.some((k) => k.n.url === n.url || jaccard(k.tokens, tokens) >= config.newsSelect.dedupeJaccard)) continue
    kept.push({ n, tokens })
    if (kept.length >= config.newsSelect.max) break
  }
  return kept.map((k) => k.n)
}
