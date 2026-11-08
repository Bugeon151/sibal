// F5 비교표: 개념 × 논문, 칸 = 그 개념 '바로 뒤'(최대 4어절)의 방향 단서어로 정한 방향 + 근거 문장.
// 개념은 사전 대표형으로 묶는다 (휴대폰·스마트폰·smartphone → 스마트폰).
// 원인 쪽 단어(최저임금)가 결과 쪽 방향(고용 감소)을 가져가지 않도록, 방향은 개념 근처에서만 읽는다.

import { config } from '../config'
import { detectDirection, outcomeClause, splitClauses, voteDirection } from '../lexicon/direction'
import { detectRole } from '../lexicon/roles'
import type { Dictionary } from '../lexicon/dictionary'
import { idfTable } from '../rank/tfidf'
import { TOPIC_STOP } from '../text/stopwords'
import type { Tokenizer } from '../text/tokenizer'
import type { Comparison, Direction, Sentence } from '../types'

export type CompareDoc = {
  paperId: string
  sentences: Sentence[]
  tokens: string[][] // 문장별 토큰
}

const WINDOW_AFTER = 4
const WINDOW_BEFORE_EN = 3
// 개념 바로 뒤에 오는 서술어 (복합명사 한 단어 "sleep quality", 조동사·부정·부사 허용)
const EN_PREDICATE =
  /^[,)]?\s*(?:(?:quality|duration|time|level|levels|score|scores|rate|rates|use|usage)\s+)?(?:(?:was|were|is|are|has|have|had|been|did|does|do|significantly|slightly|markedly|also)\s+){0,3}(?:not\s+)?(?:(?:significantly|slightly|markedly)\s+)?(?:increas|decreas|reduc|declin|improv|rose|fell|worsen|drop|lower|higher|associated|correlated|related|affected|changed|differ)/i
// 동사 뒤에 와도 목적어가 아닌 말 (부사·전치사·접속사)
const EN_AFTER_VERB_OK = new Set(['significantly', 'slightly', 'markedly', 'substantially', 'sharply', 'over', 'in', 'among', 'for', 'with', 'by', 'during', 'after', 'when', 'than', 'compared', 'as', 'and', 'but', 'from', 'to', 'at', 'across', 'between', 'within', 'only', 'more', 'less', 'over'])
// 비교할 거리가 못 되는 일반어
const GENERIC_CONCEPTS = new Set(['사용', '이용', '활용', '질', '정도', '수준', '방법', '요인', '연구', '결과', '대상', '집단', '시간'])

/** 문장 안에서 개념 바로 뒤(영어는 앞 3단어 포함)의 방향. 개념이 없거나 가까운 단서어가 없으면 none */
export function conceptDirection(text: string, isConcept: (token: string) => boolean, tokenizer: Tokenizer): Direction {
  const dirs: Direction[] = []
  for (const clause of splitClauses(text)) {
    // "A할수록 B" 문장에서 개념이 조건 쪽(A)에만 있으면 방향을 주지 않는다
    const scope = clause.includes('수록') && !tokenizer.tokens(outcomeClause(clause)).some(isConcept) ? '' : clause
    if (!scope) continue
    const words = scope.split(/\s+/)
    const en = !/[가-힣]/.test(scope)
    words.forEach((w, i) => {
      if (!tokenizer.tokens(w).some(isConcept)) return
      if (en) {
        // 영어(주어-동사-목적어): 바로 앞 수식어("reduced sleep")나 바로 뒤 서술어("sleep decreased", "was not associated")만 본다.
        // 뒤에 목적어가 오는 동사("use increased anxiety")의 방향은 주어 개념에 주지 않는다.
        const before = words.slice(Math.max(0, i - WINDOW_BEFORE_EN), i).join(' ')
        const after = words.slice(i + 1, i + 1 + WINDOW_AFTER).join(' ')
        const db = detectDirection(before)
        if (db === 'increase' || db === 'decrease') dirs.push(db)
        const pm = EN_PREDICATE.exec(after)
        if (pm) {
          // 동사 바로 뒤에 목적어(명사)가 오면 타동사("use increased anxiety") → 바뀌는 것은 목적어이므로 건너뛴다
          const rest = after.slice(pm[0].length).replace(/^[a-z]*/i, '').trim()
          const next = rest.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
          const intransitive = !next || EN_AFTER_VERB_OK.has(next) || /[.,;:)]/.test(rest.charAt(0))
          const da = detectDirection(after)
          if (intransitive && da !== 'none') dirs.push(da)
        }
        return
      }
      const windowWords = words.slice(i, i + 1 + WINDOW_AFTER)
      {
        // 개념과 방향어 사이에 목적어(~을/를)가 있으면 바뀌는 것은 그 목적어다 ("사용은 수면의 질을 낮추는")
        const after = words.slice(i + 1, i + 1 + WINDOW_AFTER)
        const cueAt = after.findIndex((_x, k) => detectDirection(after.slice(k).join(' ')) !== 'none' && detectDirection(after.slice(k + 1).join(' ')) === 'none')
        const between = cueAt === -1 ? after : after.slice(0, cueAt)
        if (between.some((x) => /[을를]$/.test(x))) return
      }
      const d = detectDirection(windowWords.join(' '))
      if (d !== 'none') dirs.push(d)
    })
  }
  return voteDirection(dirs)
}

export function buildComparison(docs: CompareDoc[], dict: Dictionary, tokenizer: Tokenizer, queryTokens: string[] = []): Comparison {
  if (docs.length < config.compare.minPapers) return { concepts: [] }

  const canon = (t: string) => dict.canonical(t)
  const usable = (t: string) => !/^\d/.test(t) && t.length >= 2 && !TOPIC_STOP.has(t) && detectDirection(t) === 'none'
  const notGeneric = (t: string) => !TOPIC_STOP.has(t) && !GENERIC_CONCEPTS.has(t)
  const docConcepts = docs.map((d) => d.tokens.flat().filter(usable).map(canon).filter(notGeneric))
  const idf = idfTable(docConcepts)
  const weight = new Map<string, number>()
  const presentIn = new Map<string, number>()
  for (const concepts of docConcepts) {
    const tf = new Map<string, number>()
    for (const t of concepts) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const [t, f] of tf) {
      weight.set(t, (weight.get(t) ?? 0) + f * (idf.get(t) ?? 1))
      presentIn.set(t, (presentIn.get(t) ?? 0) + 1)
    }
  }

  const query = new Set(queryTokens.map(canon))
  const anyKorean = docConcepts.some((c) => c.some((t) => /[가-힣]/.test(t)))
  const candidates = [...weight.entries()]
    .filter(([t]) => (presentIn.get(t) ?? 0) >= config.compare.minPapers)
    .filter(([t]) => !anyKorean || /[가-힣]/.test(t) || query.has(t))
    .sort((a, b) => Number(query.has(b[0])) - Number(query.has(a[0])) || b[1] - a[1])
    .map(([t]) => t)

  const rows: (Comparison['concepts'][number] & { known: number })[] = []
  for (const concept of candidates) {
    const isConcept = (t: string) => canon(t) === concept
    const cells = docs.map((d) => {
      // 연구 결과 문장만 비교한다 (목적·권고 문장의 "줄여야 한다"는 결과가 아님)
      const hits = d.sentences.filter((s, si) => {
        const role = detectRole(s.text)
        return role !== 'purpose' && role !== 'conclusion' && d.tokens[si]!.some(isConcept)
      })
      const dirs = hits.map((s) => conceptDirection(s.text, isConcept, tokenizer))
      const direction: Direction = voteDirection(dirs)
      const evidence = hits
        .map((s, i) => ({ s, d: dirs[i]! }))
        .sort((a, b) => Number(b.d !== 'none') - Number(a.d !== 'none'))
        .slice(0, 2)
        .map((x) => x.s.id)
      return { paperId: d.paperId, direction, evidence }
    })
    const known = cells.filter((c) => c.direction !== 'none').length
    // 방향이 하나도 없는 개념은 비교할 거리가 없으므로 뺀다
    if (known === 0) continue
    rows.push({ concept, agreement: agreementOf(cells.map((c) => c.direction)), cells, known })
  }
  // 두 편 이상에서 방향이 잡힌 개념을 먼저
  const concepts = rows
    .sort((a, b) => Number(b.known >= 2) - Number(a.known >= 2))
    .slice(0, config.compare.maxConcepts)
    .map(({ known: _known, ...row }) => row)
  return { concepts }
}

export function agreementOf(dirs: Direction[]): Comparison['concepts'][number]['agreement'] {
  const known = dirs.filter((d) => d !== 'none')
  if (known.length <= 1) return 'single'
  const hasUp = known.includes('increase')
  const hasDown = known.includes('decrease')
  // 증가↔감소, 또는 증가·감소 ↔ 효과 없음이면 상충
  if (hasUp && hasDown) return 'conflict'
  if ((hasUp || hasDown) && known.includes('no_effect')) return 'conflict'
  if (known.every((d) => d === known[0]) && known[0] !== 'conditional') return 'agree'
  return 'mixed'
}
