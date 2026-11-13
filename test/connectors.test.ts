import { describe, expect, it } from 'vitest'
import { checkFields, parseMcpConfig, PRESETS } from '../src/renderer/src/features/settings/connectors'

describe('connector presets', () => {
  it('pin an exact version so a new release never changes what runs', () => {
    for (const p of PRESETS) {
      const pkg = p.build({ folder: 'C:\\Docs' }).args.find((a) => /^@?[\w-]+\/?[\w-]*@\d/.test(a))
      expect(pkg, p.id).toMatch(/@\d+\.\d+\.\d+$/)
    }
  })

  it('are named by their id and never carry secrets', () => {
    for (const p of PRESETS) {
      const c = p.build({ folder: 'C:\\Docs' })
      expect(c.name).toBe(p.id)
      expect(c.env).toEqual({})
      expect(c.command).toBe('npx')
    }
  })

  it('passes the chosen folder as one argument, even with spaces or symbols', () => {
    const files = PRESETS.find((p) => p.id === 'files')!
    const folder = 'C:\\My Docs & more'
    expect(files.build({ folder: `  ${folder}  ` }).args.at(-1)).toBe(folder)
  })

  it('refuses an empty folder or one that looks like an option', () => {
    const files = PRESETS.find((p) => p.id === 'files')!
    expect(checkFields(files, { folder: '' })).toMatch(/folder/i)
    expect(checkFields(files, { folder: '--help' })).toMatch(/right/i)
    expect(checkFields(files, { folder: 'C:\\Docs' })).toBe('')
    expect(checkFields(PRESETS.find((p) => p.id === 'docs')!, {})).toBe('')
  })

  it('connects remote MCP servers by https URL through mcp-remote', () => {
    const remote = PRESETS.find((p) => p.id === 'remote')!
    expect(checkFields(remote, { url: '' })).toMatch(/server url/i)
    expect(checkFields(remote, { url: 'example.com/mcp' })).toMatch(/right/i)
    expect(checkFields(remote, { url: 'https://example.com/mcp' })).toBe('')
    expect(remote.build({ url: '  https://example.com/mcp  ' }).args).toEqual([
      '-y',
      'mcp-remote@0.16.6',
      'https://example.com/mcp'
    ])
  })

  it('connects WhatsApp through the human-in-the-loop MCP bridge', () => {
    const wa = PRESETS.find((p) => p.id === 'whatsapp')!
    expect(checkFields(wa, { phone: '' })).toMatch(/whatsapp number/i)
    expect(checkFields(wa, { phone: 'abc' })).toMatch(/numbers only/i)
    expect(checkFields(wa, { phone: '+1 (555) 123-4567' })).toBe('')
    const c = wa.build({ phone: '+1 (555) 123-4567' })
    expect(c.args).toContain('@mhrj/whatsapp-mcp@2.0.3')
    expect(c.env.WHATSAPP_TARGET_NUMBER).toBe('15551234567@s.whatsapp.net')
    expect(c.env.WHATSAPP_ALLOWED_NUMBERS).toBe('15551234567@s.whatsapp.net')
  })

  it('imports a pasted MCP JSON config', () => {
    const ok = parseMcpConfig(
      '{"mcpServers":{"github":{"command":"npx","args":["-y","github-mcp"],"env":{"TOKEN":"x"}}}}'
    )
    expect(ok).toEqual({
      config: { name: 'github', command: 'npx', args: ['-y', 'github-mcp'], env: { TOKEN: 'x' } }
    })
    const url = parseMcpConfig('{"url":"https://example.com/mcp","name":"Remote Tools"}')
    expect(url).toEqual({
      config: {
        name: 'Remote-Tools',
        command: 'npx',
        args: ['-y', 'mcp-remote@0.16.6', 'https://example.com/mcp'],
        env: {}
      }
    })
    expect(parseMcpConfig('nope')).toHaveProperty('error')
    expect(parseMcpConfig('{"mcpServers":{"a":{},"b":{}}}')).toHaveProperty('error')
  })
})
