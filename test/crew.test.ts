import { describe, expect, it } from 'vitest'
import { crewFrom } from '../src/renderer/src/features/crew/crew'
import type { Step } from '../src/renderer/src/features/chat/useAgent'

const step = (s: Partial<Step> & Pick<Step, 'id' | 'label' | 'status'>): Step => s

describe('crew board', () => {
  it('shows a specialist as working from its handoff, before it has run any tool', () => {
    const crew = crewFrom([step({ id: '1', label: 'Asking the PC agent', status: 'running' })])
    expect(crew).toEqual([{ name: 'PC agent', status: 'working', line: '', steps: 0 }])
  })

  it('tracks several specialists and marks each done, working or stuck', () => {
    const crew = crewFrom([
      step({ id: '1', label: 'Asking the PC agent', status: 'done', summary: 'PC agent reported back' }),
      step({ id: '2', label: 'Finding music', status: 'done', summary: 'Searched YouTube', agent: 'PC agent' }),
      step({ id: '3', label: 'Asking the Files agent', status: 'done' }),
      step({ id: '4', label: 'Opening a folder', status: 'error', agent: 'Files agent' }),
      step({ id: '5', label: 'Asking the Research agent', status: 'running' })
    ])
    expect(crew.map((c) => [c.name, c.status])).toEqual([
      ['PC agent', 'done'],
      ['Files agent', 'failed'],
      ['Research agent', 'working']
    ])
    expect(crew[0]).toMatchObject({ line: 'Searched YouTube', steps: 1 })
  })

  it('ignores the lead agent tools and unknown names', () => {
    expect(
      crewFrom([
        step({ id: '1', label: 'Remembering', status: 'done' }),
        step({ id: '2', label: 'Something', status: 'done', agent: 'Mystery agent' })
      ])
    ).toEqual([])
  })
})
