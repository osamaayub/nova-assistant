/** Text helpers for retrieval: split a document into passages, and split text into search words. */

const WORD = /[\p{L}\p{N}]+/gu

const STOP = new Set(
  (
    'a an and are as at be but by for from had has have he her his i if in into is it its me my ' +
    'no not of on or our she so than that the their them then there these they this to us was we ' +
    'were what when where which who why will with you your about can could do does did how just ' +
    'like please should would'
  ).split(' ')
)

/** Lower-case search words: no stop words, plain plurals folded ("notes" matches "note"). */
export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(WORD)) {
    let w = m[0]
    if (w.length < 2 || STOP.has(w)) continue
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
    out.push(w)
  }
  return out
}

export interface ChunkOptions {
  /** Target passage length in characters. */
  size?: number
  /** Characters repeated from the end of one passage at the start of the next. */
  overlap?: number
}

/**
 * Splits a document into passages of roughly `size` characters, on paragraph breaks where
 * possible. Passages overlap a little so an answer that straddles a break is still found.
 * A single huge paragraph (minified code, a long log line) is cut with a sliding window.
 */
export function chunkText(
  text: string,
  { size = 900, overlap = 150 }: ChunkOptions = {}
): string[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim()
  if (!clean) return []
  const chunks: string[] = []
  let current = ''
  const flush = (): void => {
    const t = current.trim()
    if (t && tokenize(t).length) chunks.push(t)
    current = ''
  }
  for (const raw of clean.split(/\n{2,}/)) {
    const para = raw.trim()
    if (!para) continue
    if (para.length > size) {
      flush()
      const step = Math.max(1, size - overlap)
      for (let i = 0; i < para.length; i += step) {
        const piece = para.slice(i, i + size).trim()
        if (piece && tokenize(piece).length) chunks.push(piece)
        if (i + size >= para.length) break
      }
      continue
    }
    if (current && current.length + para.length + 2 > size) {
      const tail = current.slice(-overlap)
      flush()
      // Start the next passage from a word boundary inside the overlap.
      current = tail.includes(' ') ? tail.slice(tail.indexOf(' ') + 1) : ''
    }
    current = current ? `${current}\n\n${para}` : para
  }
  flush()
  return chunks
}
