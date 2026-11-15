import { describe, expect, it } from 'vitest'
import { pickFacts } from '../src/main/agent/memory-recall'
import type { Fact } from '../src/shared/types'

const fact = (id: number, text: string): Fact => ({ id, text, createdAt: '2026-01-01' })

describe('pickFacts', () => {
  const facts = [
    fact(1, 'Prefers short answers'),
    fact(2, 'Works on a Next.js dashboard called DevFlow'),
    fact(3, 'Is learning agentic engineering'),
    fact(4, 'Drinks green tea, not coffee'),
    fact(5, 'Has a dog named Pixel')
  ]

  it('returns facts that share words with the message', () => {
    const picked = pickFacts(facts, 'what do you know about my dashboard project?')
    expect(picked.map((f) => f.id)).toContain(2)
  })

  it('falls back to recent memories when nothing matches', () => {
    const picked = pickFacts(facts, 'hi there')
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.map((f) => f.id)).toContain(5)
  })

  it('caps the recall at 20 facts', () => {
    const many = Array.from({ length: 60 }, (_, i) => fact(i + 1, `likes topic${i + 1}`))
    const picked = pickFacts(many, 'tell me about topic42')
    expect(picked.length).toBeLessThanOrEqual(20)
    expect(picked.some((f) => f.text.includes('topic42'))).toBe(true)
  })

  it('handles empty memory and empty queries', () => {
    expect(pickFacts([], 'hello')).toEqual([])
    expect(pickFacts(facts, '')).toEqual(facts.slice(-5))
  })
})
