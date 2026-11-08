// F4 핵심 문장 추출: S = 0.5·TextRank + 0.3·질의 유사도 + 0.2·구조 점수. 문장은 고치지 않는다.
// 구조 점수 G(i): 머리말·단서어로 정한 역할 점수 (결과 1.0, 결론 0.9, 목적 0.6, 방법 0.3, 배경 0.1),
// 역할이 없으면 위치 점수 (첫 문장 0.5, 마지막 0.6, 나머지 0.3).

import { config } from '../config'
import { detectDefinition, detectRole, headingRole } from '../lexicon/roles'
import { Bm25Index, normalizeByMax } from '../rank/bm25'
import { textRank } from '../rank/textrank'
import type { Paper, Sentence } from '../types'

export function structureScore(text: string, i: number, n: number): number {
  const g = config.structure
  if (headingRole(text) === 'background') return g.background
  const role = detectRole(text)
  if (role) return g[role]
  if (i === 0) return g.first
  if (i === n - 1) return g.last
  return g.other
}

export function extractKeySentences(
  sentences: Sentence[],
  sentenceTokens: string[][],
  queryTokens: string[],
): Pick<Paper, 'keySentences' | 'definitions'> {
  const n = sentences.length
  const definitions: Paper['definitions'] = []
  for (const s of sentences) {
    const term = detectDefinition(s.text)
    if (term) definitions.push({ term, sentenceId: s.id })
  }
  if (n === 0) return { keySentences: [], definitions }

  const w = config.keySentence
  const tr = textRank(sentenceTokens)
  const q = normalizeByMax(new Bm25Index(sentenceTokens).scoreAll(queryTokens))
  const scored = sentences.map((s, i) => ({
    i,
    s,
    score: w.textrank * (tr[i] ?? 0) + w.query * (q[i] ?? 0) + w.structure * structureScore(s.text, i, n),
  }))
  const top = scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, w.count)
    .sort((a, b) => a.i - b.i)
  return {
    keySentences: top.map(({ s }) => ({ sentenceId: s.id, role: detectRole(s.text) })),
    definitions,
  }
}
