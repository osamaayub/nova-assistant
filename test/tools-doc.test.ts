import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOLS } from '../src/main/agent/tools'

const doc = readFileSync(join(__dirname, '..', 'docs', 'tools.md'), 'utf8')

describe('docs/tools.md', () => {
  it('lists every tool by name', () => {
    for (const t of TOOLS) {
      expect(doc, `${t.name} is missing from docs/tools.md`).toContain(`\`${t.name}\``)
    }
  })

  it('does not list a tool that no longer exists', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    const documented = [...doc.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1])
    expect(documented.length).toBeGreaterThan(10)
    for (const name of documented) {
      expect(names.has(name), `docs/tools.md lists unknown tool ${name}`).toBe(true)
    }
  })
})
