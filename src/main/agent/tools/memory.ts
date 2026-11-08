import { z } from 'zod'
import { defineTool } from './types'

export const rememberFact = defineTool({
  name: 'remember_fact',
  label: 'Remembering',
  description:
    'Save a short, lasting fact about the user so you remember it in future chats (name, preferences, goals, projects, important dates). Do not save passwords, card numbers, health details or anything the user asks you to keep private. Write it in third person, e.g. "Prefers short answers".',
  schema: z.object({ fact: z.string().min(3).max(300) }),
  async run({ fact }, ctx) {
    if (/\b(password|passcode|pin|cvv|card number|api key|secret)\b/i.test(fact))
      return { content: 'Not saved: it looks like private or secret information.', isError: true }
    const res = ctx.memory.add(fact)
    if (!res.ok) return { content: res.reason ?? 'Not saved.', summary: res.reason }
    return { content: `Remembered: ${res.fact?.text}`, summary: 'Saved to memory' }
  }
})

export const forgetFact = defineTool({
  name: 'forget_fact',
  label: 'Forgetting',
  description:
    'Delete remembered facts that contain the given words, when the user asks you to forget something.',
  schema: z.object({ about: z.string().min(3).max(100).describe('Words from the fact to forget') }),
  async run({ about }, ctx) {
    const gone = ctx.memory.forget(about)
    return gone.length
      ? {
          content: `Forgot ${gone.length}: ${gone.map((f) => f.text).join('; ')}`,
          summary: `Forgot ${gone.length} fact${gone.length === 1 ? '' : 's'}`
        }
      : { content: `No remembered facts mention "${about}".` }
  }
})
