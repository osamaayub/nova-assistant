import { normalize } from './rank'

/** The small, fast Ollama embedding model Nova uses for search by meaning (about 45 MB). */
export const EMBED_MODEL = 'all-minilm'

export type EmbedProblem = 'offline' | 'missing-model'

/** Turns text into vectors so passages can be matched by meaning, not just shared words. */
export interface Embedder {
  readonly model: string
  /**
   * One unit-length vector per text, or null when embeddings are not available right now.
   * Never throws: callers fall back to keyword search.
   */
  embed(texts: string[]): Promise<Float32Array[] | null>
  /** Why embeddings are unavailable (for a hint to the user), or null if they work or are untried. */
  problem(): EmbedProblem | null
}

const BATCH = 32
const BACKOFF_MS = 60_000

/**
 * Embeddings from the user's own Ollama (POST /api/embed). After a failure it stays quiet for a
 * minute instead of retrying on every message, so a missing model costs nothing per turn.
 */
export function ollamaEmbedder(
  getUrl: () => string,
  model: string = EMBED_MODEL,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Embedder {
  let problem: EmbedProblem | null = null
  let failedAt = 0
  const fail = (p: EmbedProblem): null => {
    problem = p
    failedAt = now()
    return null
  }
  return {
    model,
    problem: () => problem,
    async embed(texts) {
      if (!texts.length) return []
      if (problem && now() - failedAt < BACKOFF_MS) return null
      let origin: string
      try {
        origin = new URL(getUrl().trim() || 'http://127.0.0.1:11434').origin
      } catch {
        return fail('offline')
      }
      const out: Float32Array[] = []
      try {
        for (let i = 0; i < texts.length; i += BATCH) {
          const batch = texts.slice(i, i + BATCH)
          const res = await fetchImpl(`${origin}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: batch, truncate: true }),
            signal: AbortSignal.timeout(30_000)
          })
          if (res.status === 404) return fail('missing-model')
          if (!res.ok) return fail('offline')
          const data = (await res.json()) as { embeddings?: unknown }
          const vectors = data.embeddings
          if (
            !Array.isArray(vectors) ||
            vectors.length !== batch.length ||
            !vectors.every((v) => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite))
          )
            return fail('offline')
          for (const v of vectors as number[][]) out.push(normalize(v))
        }
      } catch {
        return fail('offline')
      }
      problem = null
      return out
    }
  }
}
