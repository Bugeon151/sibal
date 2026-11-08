// TF-IDF 벡터와 코사인 유사도. idf = ln((N + 1) / (n + 1)) + 1

export type SparseVector = Map<string, number>

export function idfTable(docsTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>()
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = docsTokens.length
  const idf = new Map<string, number>()
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1)
  return idf
}

export function tfidfVector(tokens: string[], idf: Map<string, number>): SparseVector {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  const v: SparseVector = new Map()
  for (const [t, f] of tf) v.set(t, f * (idf.get(t) ?? 1))
  return v
}

export function cosine(a: SparseVector, b: SparseVector): number {
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let dot = 0
  for (const [t, w] of small) {
    const o = large.get(t)
    if (o) dot += w * o
  }
  if (dot === 0) return 0
  let na = 0
  let nb = 0
  for (const w of a.values()) na += w * w
  for (const w of b.values()) nb += w * w
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
