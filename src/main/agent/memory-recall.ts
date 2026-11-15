import type { Fact } from '../../shared/types'

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
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))

  const scored = facts
    .map((f) => {
      const text = f.text.toLowerCase()
      let score = 0
      for (const w of words) if (text.includes(w)) score++
      return { f, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.id - a.f.id)

  const picked: Fact[] = []
  const have = new Set<number>()
  for (const { f } of scored) {
    if (picked.length >= MAX_RECALLED) break
    picked.push(f)
    have.add(f.id)
  }
  // A generic message ("hi", "thanks") matches nothing: fall back to recent memories.
  let needed = words.length ? Math.max(0, MIN_CONTEXT - picked.length) : MIN_CONTEXT
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
