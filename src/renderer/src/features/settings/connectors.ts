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
  }
]

/** Returns a plain-English problem with the form, or '' when it is fine. */
export function checkFields(p: ConnectorPreset, values: Record<string, string>): string {
  for (const f of p.fields) {
    const v = (values[f.key] ?? '').trim()
    if (!v) return `Fill in the ${f.label.toLowerCase()}.`
    // A leading dash would be read as an option by the server, not as a folder.
    if (v.startsWith('-') || v.length > 260) return `That ${f.label.toLowerCase()} does not look right.`
  }
  return ''
}
