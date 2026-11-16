import type { DocSearch, DocSearchResult, Platform } from '../agent/tools/types'
import { EMBED_MODEL, ollamaEmbedder, type Embedder } from './embedder'
import { DocIndex } from './store'

/** How often a search re-scans the folders for new and changed files. */
const REFRESH_MS = 5 * 60_000

/** Everything the agent needs for retrieval, created once at startup. */
export interface RagServices {
  /** Search over the user's documents (the search_documents tool). */
  docs: DocSearch
  /** The embedding model, shared by document search and memory recall. */
  embedder: Embedder
  /** Cached vectors for remembered facts, keyed by the fact's text. */
  factVectors: Map<string, Float32Array>
}

export interface RagOptions {
  platform: Platform
  /** Where the index is stored. Null keeps it in memory (tests). */
  file: string | null
  wasmPath?: string
  /** The user's Ollama address, read each time so a change in Settings takes effect. */
  ollamaUrl: () => string
  fetch?: typeof fetch
  embedder?: Embedder
}

export async function createRagServices(o: RagOptions): Promise<RagServices> {
  const index = await DocIndex.open(o.file, o.wasmPath)
  const embedder = o.embedder ?? ollamaEmbedder(o.ollamaUrl, EMBED_MODEL, o.fetch)
  let lastRefresh = 0
  let refreshing: Promise<{ partial: boolean }> | null = null
  let partial = false

  const docs: DocSearch = {
    async search(query): Promise<DocSearchResult> {
      const stale = Date.now() - lastRefresh > REFRESH_MS
      if (stale && !refreshing) {
        refreshing = index
          .refresh([
            { label: 'Documents', dir: o.platform.folders.documents },
            { label: 'Desktop', dir: o.platform.folders.desktop }
          ])
          .then((r) => {
            lastRefresh = Date.now()
            partial = r.partial
            return r
          })
          .finally(() => {
            refreshing = null
          })
      }
      // The first search waits for the scan. Later ones use the current index while it refreshes.
      if (refreshing && index.fileCount() === 0) await refreshing
      void index.embedPending(embedder).catch(() => undefined)
      const { hits, semantic } = await index.query(query, embedder, 5)
      const problem = embedder.problem()
      const hint = semantic
        ? undefined
        : problem === 'missing-model'
          ? `Searched by keywords only. For search by meaning, run "ollama pull ${EMBED_MODEL}" in a terminal.`
          : problem === 'offline'
            ? `Searched by keywords only. Start Ollama with the ${EMBED_MODEL} model for search by meaning.`
            : 'Searched by keywords only. Search by meaning is still getting ready and will be used soon.'
      return { hits, files: index.fileCount(), semantic, hint, partial }
    }
  }
  return { docs, embedder, factVectors: new Map() }
}
