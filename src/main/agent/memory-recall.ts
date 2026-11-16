import type { Fact } from '../../shared/types'
import type { Embedder } from '../rag/embedder'
import { dot, rrf } from '../rag/rank'

const MAX_RECALLED = 20
const MIN_CONTEXT = 5

const STOP = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'been',
  'were',
  'they',
  'with',
  'this',
  'that',
  'from',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'why',
  'how',
  'does',
  'did',
  'done',
  'make',
  'made',
  'like',
  'just',
  'should',
  'would',
  'could',
  'will',
  'shall',
  'about',
  'into',
  'over',
  'such',
  'some',
  'than',
  'then',
  'them',
  'these',
  'those',
  'please',
  'really',
  'very',
  'much',
  'many',
  'want',
  'need',
  'know',
  'think',
  'tell',
  'say',
  'said',
  'get',
  'got',
  'let',
  'put',
  'keep',
  'take',
  'give',
  'thing',
  'things'
])

/**
 * Picks the memories worth showing the model for this message: facts sharing words with
 * what the user said, best matches first, padded with the most recent ones so Nova always
 * has some context. Keeps the prompt small as memory grows toward the 200-fact cap.
 */
export function pickFacts(facts: Fact[], query: string): Fact[] {
  if (!facts.length) return facts
  const { ranked, hasWords } = keywordRank(facts, query)
  return withRecent(ranked, facts, hasWords)
}

/** Facts that share words with the query, best match first. */
function keywordRank(facts: Fact[], query: string): { ranked: Fact[]; hasWords: boolean } {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
  const ranked = facts
    .map((f) => {
      const text = f.text.toLowerCase()
      let score = 0
      for (const w of words) if (text.includes(w)) score++
      return { f, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.id - a.f.id)
    .map((x) => x.f)
  return { ranked, hasWords: words.length > 0 }
}

/** Caps the matches, then pads with the newest memories so Nova always has some context. */
function withRecent(ranked: Fact[], facts: Fact[], hasWords: boolean): Fact[] {
  const picked = ranked.slice(0, MAX_RECALLED)
  const have = new Set(picked.map((f) => f.id))
  // A generic message ("hi", "thanks") matches nothing: fall back to recent memories.
  let needed = hasWords ? Math.max(0, MIN_CONTEXT - picked.length) : MIN_CONTEXT
  for (let i = facts.length - 1; i >= 0 && needed > 0; i--) {
    const f = facts[i]
    if (!have.has(f.id)) {
      picked.push(f)
      have.add(f.id)
      needed--
    }
  }
  return picked.sort((a, b) => a.id - b.id)
}

/** A fact must be at least this similar in meaning to count (all-minilm vectors). */
const MIN_MEANING = 0.3

/**
 * Like pickFacts, but also finds memories by meaning: "what should I cook tonight?" can surface
 * "Is vegetarian" with no shared word. Keyword and meaning matches are merged by rank.
 * Needs an embedder; if there is none, it is slow (over timeoutMs) or it fails, this is exactly
 * pickFacts, so recall never gets worse and never blocks a reply for long.
 */
export async function pickFactsSemantic(
  facts: Fact[],
  query: string,
  embedder: Embedder | null,
  vectors: Map<string, Float32Array>,
  timeoutMs = 2500
): Promise<Fact[]> {
  if (!facts.length) return facts
  const { ranked, hasWords } = keywordRank(facts, query)
  if (!embedder || !query.trim()) return withRecent(ranked, facts, hasWords)

  const work = (async (): Promise<Fact[] | null> => {
    const missing = facts.filter((f) => !vectors.has(f.text))
    const out = await embedder.embed([...missing.map((f) => f.text), query])
    if (!out) return null
    missing.forEach((f, i) => vectors.set(f.text, out[i]))
    const q = out[out.length - 1]
    return facts
      .map((f) => ({
        f,
        score: vectors.has(f.text) ? dot(q, vectors.get(f.text) as Float32Array) : 0
      }))
      .filter((x) => x.score >= MIN_MEANING)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.f)
  })().catch(() => null)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const meaning = await Promise.race([work, timeout]).finally(() => clearTimeout(timer))
  if (!meaning) return withRecent(ranked, facts, hasWords)

  const byId = new Map(facts.map((f) => [f.id, f]))
  const merged = rrf([ranked.map((f) => f.id), meaning.map((f) => f.id)])
    .map((id) => byId.get(id))
    .filter((f): f is Fact => !!f)
  return withRecent(merged, facts, hasWords || meaning.length > 0)
}
