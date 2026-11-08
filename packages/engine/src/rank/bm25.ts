// BM25 (Okapi). idf = ln(1 + (N - n + 0.5) / (n + 0.5))

import { config } from '../config'

export class Bm25Index {
  private readonly docs: Map<string, number>[]
  private readonly lengths: number[]
  private readonly df = new Map<string, number>()
  private readonly avgdl: number
  private readonly k1: number
  private readonly b: number

  constructor(docsTokens: string[][], params: { k1: number; b: number } = config.bm25) {
    this.k1 = params.k1
    this.b = params.b
    this.docs = docsTokens.map((tokens) => {
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
      return tf
    })
    this.lengths = docsTokens.map((t) => t.length)
    const total = this.lengths.reduce((a, b) => a + b, 0)
    this.avgdl = this.docs.length > 0 ? total / this.docs.length : 0
  }

  get size(): number {
    return this.docs.length
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0
    const N = this.docs.length
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  }

  score(queryTokens: string[], docIndex: number): number {
    const tf = this.docs[docIndex]
    if (!tf || this.avgdl === 0) return 0
    const dl = this.lengths[docIndex] ?? 0
    let s = 0
    for (const q of new Set(queryTokens)) {
      const f = tf.get(q)
      if (!f) continue
      s += (this.idf(q) * (f * (this.k1 + 1))) / (f + this.k1 * (1 - this.b + (this.b * dl) / this.avgdl))
    }
    return s
  }

  scoreAll(queryTokens: string[]): number[] {
    return this.docs.map((_, i) => this.score(queryTokens, i))
  }
}

/** 최댓값으로 나눠 0~1. 모두 0이면 0. */
export function normalizeByMax(values: number[]): number[] {
  const max = Math.max(0, ...values)
  return values.map((v) => (max > 0 ? v / max : 0))
}
