import initSqlJs, { type Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import type { DocHit } from '../agent/tools/types'
import type { Embedder } from './embedder'
import { Bm25, dot, rrf } from './rank'
import { chunkText, tokenize } from './text'

export const LIMITS = {
  files: 1500,
  depth: 5,
  fileBytes: 1_000_000,
  chunks: 20_000,
  scanMs: 15_000
}
/** Meaning matches weaker than this are noise for the all-minilm model, so they are dropped. */
const MIN_SIMILARITY = 0.3
const EMBED_BATCH = 32
const FILES_PER_STEP = 25

/** Plain-text kinds only. PDF and Word need a parser and are not indexed yet. */
const TEXT_EXTENSIONS = new Set(
  (
    '.txt .md .markdown .csv .tsv .json .log .ts .tsx .js .jsx .mjs .py .html .htm .css .sql .yml ' +
    '.yaml .xml .tex .ini .toml .java .c .cpp .h .cs .go .rs .php .rb .sh .ps1'
  ).split(' ')
)
const SKIP_DIRS = new Set([
  'node_modules',
  '__pycache__',
  'venv',
  'dist',
  'out',
  'build',
  'target',
  '$recycle.bin',
  'appdata'
])
/** Files that probably hold secrets are never indexed, because results go to the model. */
const SECRET_NAME =
  /(^\.env|\.pem$|\.key$|\.pfx$|\.p12$|\.kdbx$|\.keystore$|\.jks$|^id_(rsa|dsa|ecdsa|ed25519)|password|passwd|secret|credential|token|private[-_ ]?key)/i

export interface Root {
  /** Shown in results, e.g. "Documents". */
  label: string
  dir: string
}

interface Found {
  path: string
  display: string
  mtime: number
  size: number
}

interface Chunk {
  id: number
  path: string
  display: string
  ord: number
  text: string
  emb: Float32Array | null
  model: string | null
}

const toBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
const fromBlob = (b: Uint8Array): Float32Array => {
  const copy = b.slice()
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4))
}

/** Walks the roots without following links, skipping junk folders and likely-secret files. */
async function walk(root: Root, out: Found[], deadline: number): Promise<void> {
  const stack = [{ dir: root.dir, depth: 0 }]
  while (stack.length) {
    if (out.length >= LIMITS.files || Date.now() > deadline) return
    const { dir, depth } = stack.pop() as { dir: string; depth: number }
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue // links could lead outside the allowed folders
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        const name = e.name.toLowerCase()
        if (depth < LIMITS.depth && !name.startsWith('.') && !SKIP_DIRS.has(name))
          stack.push({ dir: full, depth: depth + 1 })
        continue
      }
      if (!e.isFile() || SECRET_NAME.test(e.name)) continue
      if (!TEXT_EXTENSIONS.has(extname(e.name).toLowerCase())) continue
      try {
        const st = await stat(full)
        if (st.size === 0 || st.size > LIMITS.fileBytes) continue
        out.push({
          path: full,
          display: `${root.label}/${relative(root.dir, full).split(sep).join('/')}`,
          mtime: Math.floor(st.mtimeMs),
          size: st.size
        })
      } catch {
        continue
      }
      if (out.length >= LIMITS.files) return
    }
  }
}

/** File text, or null for binary files and anything unreadable. */
async function readText(path: string): Promise<string | null> {
  try {
    const buf = await readFile(path)
    if (buf.subarray(0, 4096).includes(0)) return null
    return buf.toString('utf8')
  } catch {
    return null
  }
}

/**
 * A searchable index of the user's own text documents, kept in SQLite (sql.js, like memory).
 * Search is hybrid: BM25 keywords and, when an embedding model is available, meaning-based
 * matching, merged with reciprocal rank fusion. Without embeddings it still works on keywords.
 * It only reads: nothing here writes, moves or deletes the user's files.
 */
export class DocIndex {
  private chunks: Chunk[] = []
  private bm25: Bm25 | null = null
  private embedding: Promise<void> | null = null

  private constructor(
    private db: Database,
    private file: string | null
  ) {
    this.load()
  }

  /** Pass no file for an in-memory index (used by the tests). */
  static async open(file: string | null, wasmPath?: string): Promise<DocIndex> {
    const SQL = await initSqlJs(
      wasmPath ? { wasmBinary: readFileSync(wasmPath) as unknown as ArrayBuffer } : undefined
    )
    const db = file && existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()
    db.run(`CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY, display TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, display TEXT NOT NULL,
      ord INTEGER NOT NULL, text TEXT NOT NULL, emb BLOB, model TEXT
    )`)
    db.run('CREATE INDEX IF NOT EXISTS chunks_path ON chunks(path)')
    return new DocIndex(db, file)
  }

  fileCount(): number {
    return Number(this.db.exec('SELECT COUNT(*) FROM files')[0]?.values[0]?.[0] ?? 0)
  }

  chunkCount(): number {
    return this.chunks.length
  }

  private load(): void {
    const res = this.db.exec('SELECT id, path, display, ord, text, emb, model FROM chunks')
    this.chunks = (res[0]?.values ?? []).map(([id, path, display, ord, text, emb, model]) => ({
      id: Number(id),
      path: String(path),
      display: String(display),
      ord: Number(ord),
      text: String(text),
      emb: emb instanceof Uint8Array ? fromBlob(emb) : null,
      model: model == null ? null : String(model)
    }))
    this.bm25 = null
  }

  /**
   * Brings the index up to date: new and changed files are read and split into passages,
   * deleted files are dropped, unchanged files are skipped (by modified time and size).
   */
  async refresh(roots: Root[]): Promise<{ changed: boolean; partial: boolean }> {
    const deadline = Date.now() + LIMITS.scanMs
    const found: Found[] = []
    for (const r of roots) await walk(r, found, deadline)
    const partial = found.length >= LIMITS.files || Date.now() >= deadline

    const known = new Map<string, { mtime: number; size: number }>()
    for (const [path, mtime, size] of this.db.exec('SELECT path, mtime, size FROM files')[0]
      ?.values ?? [])
      known.set(String(path), { mtime: Number(mtime), size: Number(size) })

    let changed = false
    // After a partial scan we cannot tell "deleted" from "not reached", so keep what we have.
    if (!partial) {
      const present = new Set(found.map((f) => f.path))
      const gone = [...known.keys()].filter((p) => !present.has(p))
      if (gone.length) {
        this.db.run('BEGIN')
        for (const p of gone) {
          this.db.run('DELETE FROM chunks WHERE path = ?', [p])
          this.db.run('DELETE FROM files WHERE path = ?', [p])
        }
        this.db.run('COMMIT')
        changed = true
      }
    }

    const todo = found.filter((f) => {
      const k = known.get(f.path)
      return !k || k.mtime !== f.mtime || k.size !== f.size
    })
    let total = this.chunks.length
    for (let i = 0; i < todo.length; i += FILES_PER_STEP) {
      // Read first (async), then write in one synchronous block, so a background embedding
      // job can never start its own transaction in the middle of ours.
      const step: { f: Found; parts: string[] }[] = []
      for (const f of todo.slice(i, i + FILES_PER_STEP)) {
        const text = await readText(f.path)
        step.push({ f, parts: text ? chunkText(text) : [] })
      }
      this.db.run('BEGIN')
      try {
        for (const { f, parts } of step) {
          this.db.run('DELETE FROM chunks WHERE path = ?', [f.path])
          const room = Math.max(0, LIMITS.chunks - total)
          const kept = parts.slice(0, room)
          const stmt = this.db.prepare(
            'INSERT INTO chunks (path, display, ord, text) VALUES (?, ?, ?, ?)'
          )
          kept.forEach((text, ord) => stmt.run([f.path, f.display, ord + 1, text]))
          stmt.free()
          total += kept.length
          this.db.run(
            'INSERT OR REPLACE INTO files (path, display, mtime, size) VALUES (?, ?, ?, ?)',
            [f.path, f.display, f.mtime, f.size]
          )
        }
        this.db.run('COMMIT')
      } catch (e) {
        this.db.run('ROLLBACK')
        throw e
      }
      changed = true
    }
    if (changed) {
      this.load()
      this.save()
    }
    return { changed, partial }
  }

  /** Starts embedding passages that have no vector yet, in the background. One job at a time. */
  embedPending(embedder: Embedder): Promise<void> {
    if (!this.embedding)
      this.embedding = this.runEmbedding(embedder).finally(() => {
        this.embedding = null
      })
    return this.embedding
  }

  /** Resolves when background embedding is finished (for tests and shutdown). */
  idle(): Promise<void> {
    return this.embedding ?? Promise.resolve()
  }

  private async runEmbedding(embedder: Embedder): Promise<void> {
    let sinceSave = 0
    for (;;) {
      const todo = this.chunks
        .filter((c) => !c.emb || c.model !== embedder.model)
        .slice(0, EMBED_BATCH)
      if (!todo.length) break
      const vectors = await embedder.embed(todo.map((c) => c.text))
      if (!vectors || vectors.length !== todo.length) break
      this.db.run('BEGIN')
      const stmt = this.db.prepare('UPDATE chunks SET emb = ?, model = ? WHERE id = ?')
      todo.forEach((c, i) => {
        c.emb = vectors[i]
        c.model = embedder.model
        stmt.run([toBlob(vectors[i]), embedder.model, c.id])
      })
      stmt.free()
      this.db.run('COMMIT')
      if (++sinceSave >= 5) {
        this.save()
        sinceSave = 0
      }
    }
    if (sinceSave) this.save()
  }

  /**
   * The best passages for a question: BM25 keyword matches, plus meaning matches when the
   * embedder works, merged by rank. At most two passages per file so one note cannot crowd out the rest.
   */
  async query(
    text: string,
    embedder: Embedder | null,
    limit = 5
  ): Promise<{ hits: DocHit[]; semantic: boolean }> {
    const queryTokens = tokenize(text)
    this.bm25 ??= new Bm25(this.chunks.map((c) => ({ id: c.id, tokens: tokenize(c.text) })))
    const lexical = queryTokens.length ? this.bm25.search(queryTokens, 20).map((h) => h.id) : []

    let meaning: number[] = []
    let semantic = false
    if (embedder && this.chunks.some((c) => c.emb && c.model === embedder.model)) {
      const q = (await embedder.embed([text]))?.[0]
      if (q) {
        semantic = true
        meaning = this.chunks
          .filter((c) => c.emb && c.model === embedder.model && c.emb.length === q.length)
          .map((c) => ({ id: c.id, score: dot(q, c.emb as Float32Array) }))
          .filter((x) => x.score >= MIN_SIMILARITY)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .map((x) => x.id)
      }
    }

    const byId = new Map(this.chunks.map((c) => [c.id, c]))
    const perFile = new Map<string, number>()
    const hits: DocHit[] = []
    for (const id of semantic ? rrf([lexical, meaning]) : lexical) {
      const c = byId.get(id)
      if (!c) continue
      const n = perFile.get(c.path) ?? 0
      if (n >= 2) continue
      perFile.set(c.path, n + 1)
      hits.push({ display: c.display, part: c.ord, text: c.text })
      if (hits.length >= limit) break
    }
    return { hits, semantic }
  }

  /** Writes to a temporary file first, then renames, so a crash never leaves a half-written database. */
  private save(): void {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, Buffer.from(this.db.export()))
    renameSync(tmp, this.file)
  }
}
