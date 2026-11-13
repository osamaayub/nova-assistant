import { describe, expect, it } from 'vitest'
import { resolveCommand } from '../src/main/mcp/command'

const PATH = 'C:\\Windows;C:\\Program Files\\nodejs'
const has = (...files: string[]) => (p: string) => files.includes(p)

describe('connector command', () => {
  it('runs npx through node.exe on Windows, with no shell', () => {
    const r = resolveCommand(
      'npx',
      ['-y', 'pkg@1.0.0', 'C:\\My Docs & more'],
      'win32',
      PATH,
      has(
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js'
      )
    )
    expect(r.command).toBe('C:\\Program Files\\nodejs\\node.exe')
    expect(r.args).toEqual([
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      '-y',
      'pkg@1.0.0',
      'C:\\My Docs & more'
    ])
  })

  it('also handles npx.cmd, and leaves other commands and other systems alone', () => {
    const exists = has(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js'
    )
    expect(resolveCommand('NPX.CMD', [], 'win32', PATH, exists).command).toContain('node.exe')
    expect(resolveCommand('python', ['a'], 'win32', PATH, exists)).toEqual({ command: 'python', args: ['a'] })
    expect(resolveCommand('npx', ['a'], 'linux', PATH, exists)).toEqual({ command: 'npx', args: ['a'] })
  })

  it('falls back to the plain command when node is not on the PATH', () => {
    expect(resolveCommand('npx', ['a'], 'win32', PATH, () => false)).toEqual({
      command: 'npx',
      args: ['a']
    })
  })
})
