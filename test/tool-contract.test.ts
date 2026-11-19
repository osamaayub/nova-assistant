import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SPECIALISTS } from '../src/main/agent/team'
import { TOOLS } from '../src/main/agent/tools'

/**
 * The rules every tool must follow, checked in one place. "Tools are fixed" (CLAUDE.md) means the
 * model picks a tool name and validated values, never a command or an arbitrary path. A new tool
 * that skips validation fails here before it can ship.
 */

/** Strips optional, default and nullable wrappers to reach the real field type. */
function unwrap(field: z.ZodType): z.ZodType {
  let f = field as z.ZodType & { unwrap?: () => z.ZodType }
  while (typeof f.unwrap === 'function' && !(f instanceof z.ZodString)) {
    f = f.unwrap() as typeof f
  }
  return f
}

const fieldsOf = (schema: z.ZodType) =>
  Object.entries((schema as z.ZodObject).shape).map(([name, field]) => ({
    name,
    type: unwrap(field as z.ZodType)
  }))

describe('every tool declares its inputs', () => {
  it('has a unique snake_case name, a label and a description', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of TOOLS) {
      expect(t.name, t.name).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/)
      expect(t.label.trim().length, `${t.name} label`).toBeGreaterThan(0)
      expect(t.description.trim().length, `${t.name} description`).toBeGreaterThan(10)
    }
  })

  it('uses a Zod object schema that rejects anything that is not an object', () => {
    for (const t of TOOLS) {
      expect(t.schema instanceof z.ZodObject, `${t.name} schema`).toBe(true)
      for (const bad of [null, undefined, 'rm -rf /', 42, ['a']]) {
        expect(t.schema.safeParse(bad).success, `${t.name} accepted ${JSON.stringify(bad)}`).toBe(
          false
        )
      }
    }
  })

  it('caps the length of every free-text field', () => {
    for (const t of TOOLS) {
      for (const { name, type } of fieldsOf(t.schema)) {
        if (type instanceof z.ZodString) {
          expect(type.maxLength, `${t.name}.${name} has no max length`).not.toBeNull()
        }
      }
    }
  })

  it('rejects text longer than its cap', () => {
    // Tools whose only input is one text field, so the over-long value is the only fault.
    const single = TOOLS.filter((t) => fieldsOf(t.schema).length === 1)
    const withText = single.filter((t) => fieldsOf(t.schema)[0].type instanceof z.ZodString)
    expect(withText.length).toBeGreaterThan(5)
    for (const t of withText) {
      const [{ name, type }] = fieldsOf(t.schema)
      const max = (type as z.ZodString).maxLength as number
      expect(t.schema.safeParse({ [name]: 'a'.repeat(max) }).success, `${t.name} at max`).toBe(true)
      expect(
        t.schema.safeParse({ [name]: 'a'.repeat(max + 1) }).success,
        `${t.name} over max`
      ).toBe(false)
    }
  })
})

describe('tools never take a free path or command from the model', () => {
  it('limits every "folder" input to a fixed list of the user\'s folders', () => {
    const withFolder = TOOLS.filter((t) => fieldsOf(t.schema).some((f) => f.name === 'folder'))
    expect(withFolder.length).toBeGreaterThan(3)
    for (const t of withFolder) {
      const folder = fieldsOf(t.schema).find((f) => f.name === 'folder')!.type
      expect(folder instanceof z.ZodEnum, `${t.name}.folder`).toBe(true)
      expect(t.schema.safeParse({ folder: 'C:\\Windows' }).success, t.name).toBe(false)
    }
  })

  it('limits project checks to a fixed list, never a command line', () => {
    const tool = TOOLS.find((t) => t.name === 'run_project_check')!
    const check = fieldsOf(tool.schema).find((f) => f.name === 'check')!.type
    expect(check instanceof z.ZodEnum).toBe(true)
    expect(
      tool.schema.safeParse({ folder: 'documents', check: 'rm -rf /' }).success,
      'free-text check'
    ).toBe(false)
  })

  it('has no tool that deletes, wipes or runs a shell', () => {
    for (const t of TOOLS) {
      expect(t.name, t.name).not.toMatch(/delete|remove|erase|wipe|format|shell|exec|command/)
    }
  })
})

describe('specialists stay narrow', () => {
  const memoryTools = ['remember_fact', 'forget_fact']
  const all = new Set(TOOLS.map((t) => t.name))

  it('only hold tools that exist in the tool list', () => {
    for (const s of SPECIALISTS) {
      for (const t of s.tools) expect(all.has(t.name), `${s.id} has unknown ${t.name}`).toBe(true)
    }
  })

  it('never hold a hand-over tool, so they cannot pass work to each other', () => {
    for (const s of SPECIALISTS) {
      for (const t of s.tools) expect(t.name, `${s.id}`).not.toMatch(/^ask_/)
    }
  })

  it('leave no tool orphaned (every tool belongs to a specialist or is a memory tool)', () => {
    const held = new Set(SPECIALISTS.flatMap((s) => s.tools.map((t) => t.name)))
    for (const t of TOOLS) {
      expect(held.has(t.name) || memoryTools.includes(t.name), `${t.name} belongs to nobody`).toBe(
        true
      )
    }
  })

  it('gives each specialist its own hand-over tool name', () => {
    const names = SPECIALISTS.map((s) => s.tool)
    expect(new Set(names).size).toBe(names.length)
  })
})
