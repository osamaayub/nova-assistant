import initSqlJs, { type Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Fact } from '../../shared/types'

export const MAX_FACTS = 200
const MAX_FACT_LENGTH = 300

/**
 * Long-term memory: short facts about the user ("Prefers tea", "Works on a Next.js dashboard").
 * SQLite compiled to WebAssembly (sql.js), so there is nothing native to install on Windows.
 * Pass no file for an in-memory store (used by the tests).
 */
export class MemoryStore {
  private constructor(
    private db: Database,
    private file: string | null
  ) {}

  static async open(file: string | null, wasmPath?: string): Promise<MemoryStore> {
    const SQL = await initSqlJs(
      wasmPath ? { wasmBinary: readFileSync(wasmPath) as unknown as ArrayBuffer } : undefined
    )
    const db = file && existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()
    db.run(`CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    return new MemoryStore(db, file)
  }

  list(): Fact[] {
    const res = this.db.exec('SELECT id, text, created_at FROM facts ORDER BY id')
    return (res[0]?.values ?? []).map(([id, text, createdAt]) => ({
      id: Number(id),
      text: String(text),
      createdAt: String(createdAt)
    }))
  }

  /** Adds a fact. Returns false if it was already known or the memory is full. */
  add(text: string): { ok: boolean; reason?: string; fact?: Fact } {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_FACT_LENGTH)
    if (!clean) return { ok: false, reason: 'Empty fact.' }
    const known = this.list().find((f) => f.text.toLowerCase() === clean.toLowerCase())
    if (known) return { ok: false, reason: 'Already remembered.', fact: known }
    if (this.list().length >= MAX_FACTS)
      return {
        ok: false,
        reason: `Memory is full (${MAX_FACTS} facts). Ask the user to delete some in Settings.`
      }
    this.db.run('INSERT INTO facts (text) VALUES (?)', [clean])
    this.save()
    return { ok: true, fact: this.list().at(-1) }
  }

  remove(id: number): boolean {
    this.db.run('DELETE FROM facts WHERE id = ?', [id])
    const changed = this.db.getRowsModified() > 0
    if (changed) this.save()
    return changed
  }

  /** Removes facts containing the given words (case-insensitive). Returns what was removed. */
  forget(match: string): Fact[] {
    const needle = match.trim().toLowerCase()
    if (needle.length < 3) return []
    const hits = this.list().filter((f) => f.text.toLowerCase().includes(needle))
    for (const f of hits) this.db.run('DELETE FROM facts WHERE id = ?', [f.id])
    if (hits.length) this.save()
    return hits
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
