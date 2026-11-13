import { describe, expect, it } from 'vitest'
import { statusLine } from '../src/renderer/src/features/command/status'

describe('avatar status line', () => {
  it('says what the assistant is doing, by name', () => {
    expect(statusLine('listening', 'Jarvis', true, false)).toBe('Jarvis is listening')
    expect(statusLine('thinking', 'Jarvis', false, false)).toBe('Jarvis is thinking')
    expect(statusLine('speaking', 'Max', true, false)).toBe('Max is speaking')
  })

  it('tells apart idle with the wake word on and off', () => {
    expect(statusLine('idle', 'Jarvis', true, false)).toMatch(/wake word/)
    expect(statusLine('idle', 'Jarvis', false, false)).toMatch(/AI is off/)
  })

  it('asks for a brain when none is ready, whatever else is happening', () => {
    expect(statusLine('offline', 'Jarvis', true, true)).toBe('Pick a brain to start')
    expect(statusLine('listening', 'Jarvis', true, true)).toBe('Pick a brain to start')
  })
})
