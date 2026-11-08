// F6 내 문장 근거 검사
// C(q,s) = Σ_{t∈T(q), t∈T⁺(s)} idf(t) / Σ_{t∈T(q)} idf(t)   (IDF 가중 포함률: 드문 핵심어가 빠지면 크게 깎인다)
// idf(t) = ln(1 + (N − n_t + 0.5) / (n_t + 0.5)), N = 근거 문장 수, n_t = t(동의어 포함)가 든 문장 수
// R(q,s) = 0.6·C + 0.4·BM25 정규화
// 판정 순서: C<0.35 미지지 → 방향·효과 충돌 미지지 → 수치 불일치 부분 → 범위 확대 부분 → C≥0.6 지지 → 그 외 부분

import { config } from '../config'
import { alignPolarity, claimsEffect, detectDirection, directionsConflict, favoredGroup, GROUP_OPPOSITES, isUniversal, splitClauses } from '../lexicon/direction'
import { keyOf } from '../lexicon/dictionary'
import { detectRole } from '../lexicon/roles'
import type { Dictionary } from '../lexicon/dictionary'
import { Bm25Index } from '../rank/bm25'
import { splitSentences } from '../text/sentences'
import { extractNumbers, uniqueTokens, type Tokenizer } from '../text/tokenizer'
import type { CheckResult, ReasonCode, Sentence, Verdict } from '../types'

export const REASON_TEXT: Record<ReasonCode, string> = {
  match: '논문 문장과 내용이 일치해요.',
  low_overlap: '일부 내용만 논문에 있어요. 근거 문장을 확인해 보세요.',
  direction_conflict: '논문은 반대 방향의 결과를 말하고 있어요.',
  number_mismatch: '문장의 숫자가 논문에서 확인되지 않아요.',
  no_evidence: '선택한 논문에서 이 내용을 찾지 못했어요.',
  scope_mismatch: '논문은 일부 집단·조건에서만 확인된 결과예요. 범위를 좁혀 써 보세요.',
  group_mismatch: '논문은 다른 집단(예: 남학생과 여학생)의 결과를 말하고 있어요.',
}

export type EvidenceSentence = Sentence & { tokens: string[]; lang: 'ko' | 'en' | 'other' }
export type PoolDoc = { paperId: string; tokens: string[] }

export type CheckParams = { [K in keyof typeof config.check]: number }

export type CheckContext = {
  /** 임계값 조정용 덮어쓰기 (판정 세트 튜닝) */
  params?: Partial<CheckParams>
  tokenizer: Tokenizer
  dict: Dictionary
  paperSentences: EvidenceSentence[]
  newsSentences: EvidenceSentence[]
  /** 미지지일 때 제안할 후보 (선별되지 않은 논문) */
  pool: PoolDoc[]
}

const hits = (forms: Set<string>, tokens: Set<string>) => {
  for (const f of forms) if (tokens.has(f)) return true
  return false
}

/** 학생 토큰별 IDF (근거 문장 모음 기준). 근거에 없는 토큰이 가장 크다. */
export function queryIdf(qSets: Set<string>[], sentences: { tokens: string[] }[]): number[] {
  const N = sentences.length
  const sets = sentences.map((s) => new Set(s.tokens))
  return qSets.map((forms) => {
    const n = sets.filter((t) => hits(forms, t)).length
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  })
}

function coverage(qSets: Set<string>[], weights: number[], sTokens: Set<string>): number {
  const total = weights.reduce((a, b) => a + b, 0)
  if (qSets.length === 0 || total === 0) return 0
  let hit = 0
  qSets.forEach((forms, i) => {
    if (hits(forms, sTokens)) hit += weights[i]!
  })
  return hit / total
}

const bareNumber = (n: string) => n.replace(/[^\d.]/g, '')
const hasUnit = (n: string) => /[^\d.]/.test(n)

/** 학생 문장의 숫자가 근거에 있는지. 단위가 같거나, 한쪽에 단위가 없거나, 근거가 영어(단위 표기가 다름)면 숫자만 비교 */
export function numbersMatch(q: string, s: string, evidenceLang: 'ko' | 'en' | 'other' = 'ko'): boolean {
  const need = extractNumbers(q)
  if (need.length === 0) return true
  const have = extractNumbers(s)
  const exact = new Set(have)
  const bareAll = new Set(have.map(bareNumber))
  const bareNoUnit = new Set(have.filter((n) => !hasUnit(n)).map(bareNumber))
  return need.every(
    (n) =>
      exact.has(n) ||
      (!hasUnit(n) && bareAll.has(n)) ||
      bareNoUnit.has(bareNumber(n)) ||
      (evidenceLang === 'en' && bareAll.has(bareNumber(n))),
  )
}

/** 규칙 토크나이저에는 품사가 없어서, 서술어·연결 어미로 끝나는 한국어 토큰을 명사가 아닌 것으로 본다 */
export function nounLike(token: string): boolean {
  if (!/[가-힣]/.test(token)) return /^[a-z]/.test(token)
  return !/(면|고|며|는|은|다|게|지|어|아|여|서|든|도록|려고|니|자|던|운|울|ㄴ|져|워|해|해서|하게|하여)$/.test(token)
}

/** 방향을 나타내는 토큰(감소, 향상 …)은 '무엇에 대한 주장인지'를 정하는 핵심어에서 뺀다 */
function isDirectional(token: string): boolean {
  const d = detectDirection(token)
  return d === 'increase' || d === 'decrease'
}

/** 절의 주제어: 주제·주격 조사(은/는/이/가)로 끝나는 첫 어절과 그 앞 어절의 토큰 ("수학 성취도는" → 수학, 성취) */
function clauseSubject(clause: string, tokenizer: Tokenizer): Set<string> {
  const words = clause.split(/\s+/)
  const i = words.findIndex((w) => /[은는이가]$/.test(w) && w.length >= 2)
  if (i === -1) return new Set()
  return new Set(tokenizer.tokens(words.slice(Math.max(0, i - 1), i + 1).join(' ')))
}

/** 근거 문장에서 학생 문장에 맞는 절 (대조 연결어로 나눔).
 *  1) 절마다 다른 주제어(수학 vs 국어) 중 학생 문장에 있는 것이 한 절에만 있으면 그 절
 *  2) 아니면 핵심어 가중 겹침이 가장 큰 절 */
function relevantClause(text: string, qSets: Set<string>[], weights: number[], tokenizer: Tokenizer): string {
  const clauses = splitClauses(text)
  if (clauses.length === 1) return text
  const subjects = clauses.map((cl) => clauseSubject(cl, tokenizer))
  const uniqueHit = clauses.filter((_, ci) => {
    const others = new Set(subjects.flatMap((sub, j) => (j === ci ? [] : [...sub])))
    const unique = new Set([...subjects[ci]!].filter((t) => !others.has(t)))
    return qSets.some((forms) => hits(forms, unique))
  })
  if (uniqueHit.length === 1) return uniqueHit[0]!
  let best = clauses[0]!
  let bestScore = -1
  for (const cl of clauses) {
    const tokens = new Set(tokenizer.tokens(cl))
    const score = qSets.reduce((a, forms, i) => a + (hits(forms, tokens) ? weights[i]! : 0), 0)
    if (score > bestScore) {
      best = cl
      bestScore = score
    }
  }
  return best
}

const GROUP_SIDE: Record<string, 'a' | 'b'> = {
  남학생: 'a', 남성: 'a', 남자: 'a', boys: 'a', male: 'a', men: 'a',
  여학생: 'b', 여성: 'b', 여자: 'b', girls: 'b', female: 'b', women: 'b',
}

/** 비교 주장에서 더 높다고 한 집단이 반대인지 (남학생에서 더 높다 vs higher in girls) */
function favoredGroupMismatch(claim: string, evidence: string): boolean {
  const q = favoredGroup(claim)
  const s = favoredGroup(evidence)
  if (!q || !s) return false
  const qs = GROUP_SIDE[q]
  const ss = GROUP_SIDE[s]
  return !!qs && !!ss && qs !== ss
}

function groupMismatch(qTokens: Set<string>, sTokens: Set<string>): boolean {
  for (const [a, b] of GROUP_OPPOSITES) {
    const ka = keyOf(a)[0]!
    const kb = keyOf(b)[0]!
    if (qTokens.has(ka) && !qTokens.has(kb) && sTokens.has(kb) && !sTokens.has(ka)) return true
    if (qTokens.has(kb) && !qTokens.has(ka) && sTokens.has(ka) && !sTokens.has(kb)) return true
  }
  return false
}

export function checkOne(sentence: string, ctx: CheckContext): CheckResult {
  const c: CheckParams = { ...config.check, ...ctx.params }
  // 방향어(감소, 개선 …)는 주제 일치(포함률)에서 빼고 방향 비교에서만 쓴다
  const allTokens = uniqueTokens(ctx.tokenizer.tokens(sentence)).filter((t) => !isDirectional(t))
  // 숫자는 수치 규칙으로 따로 보고, 포함률에서는 뺀다 (근거 문장 고르기 BM25에는 넣는다)
  const qTokens = allTokens.filter((t) => !/^\d/.test(t))
  const qNumbers = allTokens.filter((t) => /^\d/.test(t))
  const qSets = qTokens.map((t) => ctx.dict.expand(t))
  const qExpanded = [...new Set([...qSets.flatMap((s) => [...s]), ...qNumbers])]

  const ranked = rank(qSets, qExpanded, ctx.paperSentences, c)
  const stats = tokenStats(qSets, ctx.paperSentences)
  const totalIdf = stats.reduce((a, t) => a + t.idf, 0)
  // 근거 문장 어디에도 없는 '명사 같은' 학생 토큰의 무게 (폴리프로필렌처럼 바꿔 쓴 핵심어).
  // 서술어·부사(내려지면, 찾는)는 바꿔 쓰기에서 자연스럽게 생기므로 세지 않는다.
  const missingShare =
    totalIdf > 0 ? stats.filter((t, i) => t.n === 0 && nounLike(qTokens[i]!)).reduce((a, t) => a + t.idf, 0) / totalIdf : 0
  // 핵심어: 근거에 있긴 하지만 드문 토큰 (제조업, 국어). 방향어는 제외
  const N = ctx.paperSentences.length
  const focus = stats
    .map((t, i) => ({ ...t, i }))
    .filter((t) => t.n > 0 && t.n <= Math.max(1, Math.floor(N * 0.25)))

  const qDir = detectDirection(sentence)
  // 효과·방향이 '있다'는 주장인지 (효과 없음 주장은 false)
  const qClaims = claimsEffect(sentence)
  const qDirected = qDir !== 'none'

  // 절 고르기용 가중치: 핵심어는 크게, 방향어는 0 (방향어로 절을 고르면 주장 쪽 절이 뽑힌다)
  const focusIdx = new Set(focus.map((f) => f.i))
  const clauseWeights = stats.map((t, i) => (focusIdx.has(i) ? t.idf * 3 : t.idf))

  // 근거 고르기: 포함률 하한을 넘는 후보 중 (핵심어 무게 → 방향 있는 문장(주장이 방향일 때) → R) 순
  const candidates = ranked.filter((b) => b.cov >= c.noEvidenceBelow)
  const focusScore = (tokens: string[]) => {
    const set = new Set(tokens)
    return focus.reduce((a, f) => a + (hits(qSets[f.i]!, set) ? f.idf : 0), 0)
  }
  const ordered = candidates
    .map((b, order) => {
      const clause = relevantClause(b.s.text, qSets, clauseWeights, ctx.tokenizer)
      return { ...b, order, clause, fScore: focusScore(b.s.tokens), directed: detectDirection(clause) !== 'none' }
    })
    .sort((a, b) => b.fScore - a.fScore || (qDirected ? Number(b.directed) - Number(a.directed) : 0) || a.order - b.order)
  const top = ordered[0]
  const cov = top?.cov ?? ranked[0]?.cov ?? 0
  const bmNorm = top?.bmNorm ?? ranked[0]?.bmNorm ?? 0

  let verdict: Verdict
  let reasonCode: ReasonCode
  let evidence: string[] = []

  if (!top) {
    verdict = 'unsupported'
    reasonCode = 'no_evidence'
  } else {
    evidence = [top.s.id]
    const second = ordered.slice(1).find((b) => b.cov >= c.secondEvidenceAtLeast)
    if (second && evidence.length < c.maxEvidence) evidence.push(second.s.id)

    const conflictsWith = (clause: string) => {
      const d = alignPolarity(detectDirection(clause), clause, sentence)
      return directionsConflict(qDir, d) || (qDir === 'no_effect' && claimsEffect(clause)) || (d === 'no_effect' && qClaims)
    }
    // 같은 내용을 강하게 다루는 결과 문장 중 반대 방향이 있는지 (권고·목적 문장이 근거로 뽑혀 놓치는 것 방지)
    const contraResult = ordered.find(
      (b) =>
        b !== top &&
        b.cov >= c.supportAtLeast &&
        b.cov >= top.cov - 0.15 &&
        b.fScore >= top.fScore &&
        detectRole(b.s.text) === 'result' &&
        conflictsWith(b.clause),
    )
    const sDir = detectDirection(top.clause)
    if (conflictsWith(top.clause)) {
      verdict = 'unsupported'
      reasonCode = 'direction_conflict'
    } else if (contraResult && detectRole(top.s.text) !== 'result') {
      verdict = 'unsupported'
      reasonCode = 'direction_conflict'
      evidence = [contraResult.s.id]
    } else if (groupMismatch(new Set(qExpanded), new Set(top.s.tokens)) || favoredGroupMismatch(sentence, top.clause)) {
      verdict = 'unsupported'
      reasonCode = 'group_mismatch'
    } else if (!numbersMatch(sentence, top.s.text, top.s.lang)) {
      verdict = 'partial'
      reasonCode = 'number_mismatch'
    } else if (isUniversal(sentence) && sDir === 'conditional') {
      verdict = 'partial'
      reasonCode = 'scope_mismatch'
    } else if (cov >= c.supportAtLeast && missingShare < c.missingShareMax && !contraResult) {
      verdict = 'supported'
      reasonCode = 'match'
    } else {
      verdict = 'partial'
      reasonCode = 'low_overlap'
    }
  }

  const newsTop = rank(qSets, qExpanded, ctx.newsSentences, c)[0]
  const newsReference = newsTop && newsTop.cov >= c.noEvidenceBelow ? [newsTop.s.id] : []

  let suggestPaperIds: string[] = []
  if (verdict === 'unsupported' && ctx.pool.length > 0) {
    const bm = new Bm25Index(ctx.pool.map((p) => p.tokens))
    suggestPaperIds = bm
      .scoreAll(qExpanded)
      .map((score, i) => ({ score, id: ctx.pool[i]!.paperId }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, c.suggestCount)
      .map((x) => x.id)
  }

  return {
    sentence,
    verdict,
    evidence,
    reasonCode,
    reason: REASON_TEXT[reasonCode],
    crossLanguage: evidence.length > 0 && top?.s.lang === 'en' && /[가-힣]/.test(sentence),
    newsReference,
    scores: { coverage: round(cov), bm25: round(bmNorm) },
    suggestPaperIds,
  }
}

/** 학생 토큰별 문서 빈도와 IDF */
function tokenStats(qSets: Set<string>[], sentences: { tokens: string[] }[]): { n: number; idf: number }[] {
  const N = sentences.length
  const sets = sentences.map((s) => new Set(s.tokens))
  return qSets.map((forms) => {
    const n = sets.filter((t) => hits(forms, t)).length
    return { n, idf: Math.log(1 + (N - n + 0.5) / (n + 0.5)) }
  })
}

function rank(qSets: Set<string>[], qExpanded: string[], sentences: EvidenceSentence[], c: CheckParams) {
  if (sentences.length === 0) return []
  const bm = new Bm25Index(sentences.map((s) => s.tokens))
  const raw = bm.scoreAll(qExpanded)
  const max = Math.max(0, ...raw)
  const weights = queryIdf(qSets, sentences)
  return sentences
    .map((s, i) => {
      const cov = coverage(qSets, weights, new Set(s.tokens))
      const bmNorm = max > 0 ? raw[i]! / max : 0
      return { s, cov, bmNorm, r: c.coverageWeight * cov + c.bm25Weight * bmNorm }
    })
    .sort((a, b) => b.r - a.r)
}

const round = (x: number) => Math.round(x * 1000) / 1000

export function checkText(text: string, ctx: CheckContext): { results: CheckResult[]; truncated: boolean } {
  const all = splitSentences(text, 4)
  const limited = all.slice(0, config.check.maxSentences)
  return { results: limited.map((s) => checkOne(s, ctx)), truncated: all.length > limited.length }
}
