import type { McpServerConfig } from '../../../../shared/types'

export interface ConnectorField {
  key: string
  label: string
  placeholder: string
}

/** A ready-made connector. Versions are pinned so a new release never changes what Nova runs. */
export interface ConnectorPreset {
  id: string
  name: string
  blurb: string
  /** Shown in small print on the card: what it can do to your data. */
  access: string
  fields: ConnectorField[]
  build(values: Record<string, string>): McpServerConfig
  /** Extra check after the fields look filled in, e.g. a phone number that must be digits. */
  validate?: (values: Record<string, string>) => string
}

const npx = (id: string, args: string[]): McpServerConfig => ({
  name: id,
  command: 'npx',
  args: ['-y', ...args],
  env: {}
})

export const PRESETS: ConnectorPreset[] = [
  {
    id: 'files',
    name: 'Files',
    blurb: 'Read, search and edit files inside one folder you choose.',
    access: 'Reads freely. Asks before it writes or moves anything.',
    fields: [{ key: 'folder', label: 'Folder', placeholder: 'C:\\Users\\You\\Documents' }],
    build: (v) =>
      npx('files', ['@modelcontextprotocol/server-filesystem@2.3.0', v.folder.trim()])
  },
  {
    id: 'docs',
    name: 'Code docs',
    blurb: 'Looks up current documentation for programming libraries.',
    access: 'Read-only. Sends the library name you ask about to the Context7 service.',
    fields: [],
    build: () => npx('docs', ['@upstash/context7-mcp@4.7.0'])
  },
  {
    id: 'thinking',
    name: 'Step by step',
    blurb: 'Helps Nova break a hard problem into steps and revise them.',
    access: 'Works only in Nova. Touches no files and no websites.',
    fields: [],
    build: () => npx('thinking', ['@modelcontextprotocol/server-sequential-thinking@2.1.1'])
  },
  {
    id: 'browser',
    name: 'Browser',
    blurb: 'Opens web pages in its own browser, reads them, clicks and types.',
    access: 'Asks before it clicks, types or submits anything.',
    fields: [],
    build: () => npx('browser', ['@playwright/mcp@0.0.85', '--isolated'])
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    blurb: 'Lets Nova reach you on WhatsApp for approvals, alerts and quick questions.',
    access:
      'Uses an unofficial WhatsApp bridge. First connect may need a QR scan; if it does, open ~/.whatsapp-mcp/qr.html. Sending still asks first.',
    fields: [{ key: 'phone', label: 'Your WhatsApp number', placeholder: '15551234567' }],
    validate: (v) =>
      whatsAppJid(v.phone ?? '') ? '' : 'Enter your WhatsApp number with country code, numbers only.',
    build: (v) => {
      const jid = whatsAppJid(v.phone ?? '')
      const env: Record<string, string> = jid
        ? { WHATSAPP_TARGET_NUMBER: jid, WHATSAPP_ALLOWED_NUMBERS: jid }
        : {}
      return { name: 'whatsapp', command: 'npx', args: ['-y', '@mhrj/whatsapp-mcp@2.0.3'], env }
    }
  },
  {
    id: 'remote',
    name: 'Remote MCP',
    blurb: 'Connect any remote MCP server by URL, including OpenAI-style tool connectors.',
    access: 'Runs through mcp-remote. Anything that changes data asks first.',
    fields: [{ key: 'url', label: 'Server URL', placeholder: 'https://example.com/mcp' }],
    build: (v) => npx('remote', ['mcp-remote@0.16.6', (v.url ?? '').trim()])
  }
]

/** Returns a plain-English problem with the form, or '' when it is fine. */
export function checkFields(p: ConnectorPreset, values: Record<string, string>): string {
  for (const f of p.fields) {
    const v = (values[f.key] ?? '').trim()
    if (!v) return `Fill in the ${f.label.toLowerCase()}.`
    if (f.key === 'url' && !/^https?:\/\//i.test(v)) return 'That server URL does not look right.'
    // A leading dash would be read as an option by the server, not as a folder.
    if (v.startsWith('-') || v.length > 260) return `That ${f.label.toLowerCase()} does not look right.`
  }
  return p.validate?.(values) ?? ''
}

function whatsAppJid(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : ''
}

/**
 * Imports the JSON snippet most MCP docs give (Claude Desktop / Cursor style).
 * Accepts either { "mcpServers": { "name": {...} } } or one bare server object.
 */
export function parseMcpConfig(
  text: string
): { config: McpServerConfig } | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'That is not valid JSON. Paste the MCP config object from the docs.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'Paste a JSON object with command/args/env or a URL.' }
  }
  const root = data as Record<string, unknown>
  let name = ''
  let server: Record<string, unknown> | undefined
  const servers = root.mcpServers
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    const entries = Object.entries(servers as Record<string, unknown>)
    if (entries.length !== 1) return { error: 'Paste one MCP server config, not a list.' }
    ;[name, server] = entries[0] as [string, Record<string, unknown>]
  } else if (
    typeof root.command === 'string' ||
    typeof root.url === 'string' ||
    typeof root.serverUrl === 'string'
  ) {
    server = root
    name = typeof root.name === 'string' ? root.name : 'custom'
  }
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return { error: 'Could not find a command or URL in that config.' }
  }

  const env: Record<string, string> = {}
  if (server.env && typeof server.env === 'object' && !Array.isArray(server.env)) {
    for (const [k, v] of Object.entries(server.env as Record<string, unknown>)) {
      if (typeof v === 'string') env[k] = v
    }
  }

  const url =
    typeof server.url === 'string'
      ? server.url
      : typeof server.serverUrl === 'string'
        ? server.serverUrl
        : ''
  if (url) {
    if (!/^https?:\/\//i.test(url)) return { error: 'That MCP URL does not look right.' }
    return {
      config: {
        name: cleanName(name) || 'remote',
        command: 'npx',
        args: ['-y', 'mcp-remote@0.16.6', url],
        env
      }
    }
  }

  const command = typeof server.command === 'string' ? server.command.trim() : ''
  if (!command) return { error: 'That config has no command or URL.' }
  const args = Array.isArray(server.args)
    ? server.args.filter((a): a is string => typeof a === 'string')
    : []
  return { config: { name: cleanName(name) || 'custom', command, args, env } }
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, '-').slice(0, 40)
}
