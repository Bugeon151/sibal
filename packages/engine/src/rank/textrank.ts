// TextRank: 문장 그래프(가중치 = TF-IDF 코사인)에 PageRank.
// S_i = (1 - d) / N + d * Σ_j (w_ji / Σ_k w_jk) * S_j

import { config } from '../config'
import { cosine, idfTable, tfidfVector } from './tfidf'

export function textRank(
  sentencesTokens: string[][],
  params: { damping: number; maxIter: number; tolerance: number } = config.textrank,
): number[] {
  const N = sentencesTokens.length
  if (N === 0) return []
  if (N === 1) return [1]

  const idf = idfTable(sentencesTokens)
  const vecs = sentencesTokens.map((t) => tfidfVector(t, idf))
  const w: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0))
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const s = cosine(vecs[i]!, vecs[j]!)
      w[i]![j] = s
      w[j]![i] = s
    }
  }
  const outSum = w.map((row) => row.reduce((a, b) => a + b, 0))

  const d = params.damping
  let scores = new Array<number>(N).fill(1 / N)
  for (let iter = 0; iter < params.maxIter; iter++) {
    const next = new Array<number>(N).fill((1 - d) / N)
    for (let j = 0; j < N; j++) {
      const sj = scores[j]!
      const total = outSum[j]!
      if (total === 0) {
        // 연결 없는 문장은 점수를 고르게 나눈다 (dangling node)
        for (let i = 0; i < N; i++) next[i]! += (d * sj) / N
        continue
      }
      const row = w[j]!
      for (let i = 0; i < N; i++) {
        const wji = row[i]!
        if (wji > 0) next[i]! += (d * wji * sj) / total
      }
    }
    const delta = next.reduce((acc, v, i) => acc + Math.abs(v - scores[i]!), 0)
    scores = next
    if (delta < params.tolerance) break
  }

  const max = Math.max(...scores)
  return scores.map((s) => (max > 0 ? s / max : 0))
}
