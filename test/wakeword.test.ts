import { describe, expect, it } from 'vitest'
import { extractCommand } from '../src/renderer/src/features/voice/wakeWord'

describe('wake word', () => {
  it('finds the phrase and returns the command after it', () => {
    expect(extractCommand('Hey Nova, open Spotify')).toBe('open Spotify')
    expect(extractCommand('okay nova play some lofi')).toBe('play some lofi')
    expect(extractCommand('Nova what is on my calendar')).toBe('what is on my calendar')
    expect(extractCommand('hi nova, tidy my downloads')).toBe('tidy my downloads')
  })

  it('returns an empty string when the wake phrase stands alone', () => {
    expect(extractCommand('Hey Nova')).toBe('')
    expect(extractCommand('  nova. ')).toBe('')
  })

  it('ignores speech without the wake phrase', () => {
    expect(extractCommand('what time is it')).toBeNull()
    expect(extractCommand('turn on the nova lights')).toBeNull()
    expect(extractCommand('')).toBeNull()
  })
})
