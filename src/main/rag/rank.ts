/** Ranking helpers: BM25 keyword scoring, vector maths, and rank fusion. No dependencies. */

/**
 * Reciprocal rank fusion: merges several best-first lists of ids into one. An id near the top
 * of several lists beats one that tops a single list, with no need to compare their scores
 * (keyword and meaning scores are on different scales).
 */
export function rrf(lists: number[][], k = 60): number[] {
  const score = new Map<number, number>()
  for (const list of lists)
    list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id)
}

/** Scales a vector to length 1, so the dot product of two of them is their cosine similarity. */
export function normalize(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length)
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const len = Math.sqrt(sum) || 1
  for (let i = 0; i < v.length; i++) out[i] = v[i] / len
  return out
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Okapi BM25 over a set of tokenized passages, kept in memory. */
export class Bm25 {
  private tf = new Map<number, Map<string, number>>()
  private len = new Map<number, number>()
  private df = new Map<string, number>()
  private avg = 0

  constructor(docs: { id: number; tokens: string[] }[]) {
    let total = 0
    for (const d of docs) {
      const counts = new Map<string, number>()
      for (const t of d.tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
      this.tf.set(d.id, counts)
      this.len.set(d.id, d.tokens.length)
      total += d.tokens.length
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
    this.avg = docs.length ? total / docs.length : 0
  }

  search(
    queryTokens: string[],
    limit: number,
    k1 = 1.5,
    b = 0.75
  ): { id: number; score: number }[] {
    const n = this.tf.size
    const terms = [...new Set(queryTokens)]
    const hits: { id: number; score: number }[] = []
    for (const [id, counts] of this.tf) {
      let score = 0
      for (const t of terms) {
        const f = counts.get(t)
        if (!f) continue
        const df = this.df.get(t) ?? 0
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
        const norm = 1 - b + (b * (this.len.get(id) ?? 0)) / (this.avg || 1)
        score += (idf * (f * (k1 + 1))) / (f + k1 * norm)
      }
      if (score > 0) hits.push({ id, score })
    }
    return hits.sort((a, b2) => b2.score - a.score || a.id - b2.id).slice(0, limit)
  }
}
