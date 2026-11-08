import { useEffect, useReducer } from 'react'
import type { AgentEvent } from '../../../../shared/types'

export type Step = {
  id: string
  label: string
  status: 'running' | 'done' | 'error' | 'declined'
  summary?: string
}
export type Item =
  | { kind: 'user'; id: string; text: string }
  | {
      kind: 'assistant'
      id: string
      text: string
      steps: Step[]
      sources: { url: string; title: string }[]
      confirm?: { id: string; title: string; detail: string }
      error?: string
    }
  | { kind: 'notice'; id: string; text: string }

export type AgentState = { items: Item[]; busy: boolean }

type Action =
  | { type: 'user'; text: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'clear' }
  | { type: 'answered' }

function lastAssistant(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'assistant') return i
  return -1
}

function patchLast(
  items: Item[],
  fn: (a: Extract<Item, { kind: 'assistant' }>) => Extract<Item, { kind: 'assistant' }>
): Item[] {
  const i = lastAssistant(items)
  if (i < 0) return items
  const next = [...items]
  next[i] = fn(items[i] as Extract<Item, { kind: 'assistant' }>)
  return next
}

export function reducer(state: AgentState, action: Action): AgentState {
  if (action.type === 'clear') return { items: [], busy: false }
  if (action.type === 'user')
    return {
      items: [...state.items, { kind: 'user', id: crypto.randomUUID(), text: action.text }],
      busy: true
    }
  if (action.type === 'answered')
    return { ...state, items: patchLast(state.items, (a) => ({ ...a, confirm: undefined })) }
  const e = action.event
  switch (e.type) {
    case 'start':
      return {
        busy: true,
        items: [
          ...state.items,
          { kind: 'assistant', id: e.turnId, text: '', steps: [], sources: [] }
        ]
      }
    case 'text':
      return { ...state, items: patchLast(state.items, (a) => ({ ...a, text: a.text + e.delta })) }
    case 'tool':
      return {
        ...state,
        items: patchLast(state.items, (a) => {
          const exists = a.steps.some((s) => s.id === e.id)
          const step: Step = { id: e.id, label: e.label, status: e.status, summary: e.summary }
          return {
            ...a,
            steps: exists ? a.steps.map((s) => (s.id === e.id ? step : s)) : [...a.steps, step]
          }
        })
      }
    case 'confirm':
      return {
        ...state,
        items: patchLast(state.items, (a) => ({
          ...a,
          confirm: { id: e.id, title: e.title, detail: e.detail }
        }))
      }
    case 'source':
      return {
        ...state,
        items: patchLast(state.items, (a) =>
          a.sources.some((s) => s.url === e.url)
            ? a
            : { ...a, sources: [...a.sources, { url: e.url, title: e.title }] }
        )
      }
    case 'done':
      return { busy: false, items: patchLast(state.items, (a) => ({ ...a, confirm: undefined })) }
    case 'error': {
      const i = lastAssistant(state.items)
      const items =
        i >= 0 && state.items[i].id === e.turnId
          ? patchLast(state.items, (a) => ({ ...a, error: e.message }))
          : [
              ...state.items,
              {
                kind: 'assistant' as const,
                id: e.turnId,
                text: '',
                steps: [],
                sources: [],
                error: e.message
              }
            ]
      return { busy: false, items }
    }
    case 'notify':
      return {
        ...state,
        items: [
          ...state.items,
          { kind: 'notice', id: crypto.randomUUID(), text: `${e.title}: ${e.body}` }
        ]
      }
  }
}

export function useAgentState(
  onEvent: (e: AgentEvent) => void,
  subscribe: (l: (e: AgentEvent) => void) => () => void
): { state: AgentState; dispatch: React.Dispatch<Action> } {
  const [state, dispatch] = useReducer(reducer, { items: [], busy: false })
  useEffect(
    () =>
      subscribe((event) => {
        dispatch({ type: 'event', event })
        onEvent(event)
      }),
    [onEvent, subscribe]
  )
  return { state, dispatch }
}
