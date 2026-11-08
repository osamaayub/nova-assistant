import { z } from 'zod'
import { defineTool, type ToolContext } from './types'

/**
 * Programs Nova may open on Windows. The model only ever chooses a key from this list;
 * the command itself is fixed here, so nothing the model writes is run as a command.
 * `uri:` entries open through Windows protocol handlers, `exe:` entries through "start".
 */
export const BUILT_IN_APPS: Record<string, { label: string; target: string }> = {
  notepad: { label: 'Notepad', target: 'exe:notepad.exe' },
  calculator: { label: 'Calculator', target: 'exe:calc.exe' },
  paint: { label: 'Paint', target: 'exe:mspaint.exe' },
  'file explorer': { label: 'File Explorer', target: 'exe:explorer.exe' },
  'task manager': { label: 'Task Manager', target: 'exe:taskmgr.exe' },
  settings: { label: 'Windows Settings', target: 'uri:ms-settings:' },
  camera: { label: 'Camera', target: 'uri:microsoft.windows.camera:' },
  clock: { label: 'Clock', target: 'uri:ms-clock:' },
  chrome: { label: 'Google Chrome', target: 'exe:chrome' },
  edge: { label: 'Microsoft Edge', target: 'uri:microsoft-edge:' },
  firefox: { label: 'Firefox', target: 'exe:firefox' },
  'vs code': { label: 'Visual Studio Code', target: 'uri:vscode:' },
  spotify: { label: 'Spotify', target: 'uri:spotify:' },
  whatsapp: { label: 'WhatsApp', target: 'uri:whatsapp:' },
  word: { label: 'Microsoft Word', target: 'exe:winword' },
  excel: { label: 'Microsoft Excel', target: 'exe:excel' },
  powerpoint: { label: 'Microsoft PowerPoint', target: 'exe:powerpnt' },
  outlook: { label: 'Outlook', target: 'exe:outlook' }
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const ALIASES: Record<string, string> = {
  explorer: 'file explorer',
  files: 'file explorer',
  'google chrome': 'chrome',
  'microsoft edge': 'edge',
  vscode: 'vs code',
  'visual studio code': 'vs code',
  code: 'vs code',
  calc: 'calculator',
  'microsoft word': 'word',
  'microsoft excel': 'excel',
  'ms word': 'word',
  'ms excel': 'excel',
  'windows settings': 'settings'
}

export type ResolvedApp = { label: string; kind: 'exe' | 'uri' | 'path'; target: string }

/** Finds an app by name in the user's own apps first, then the built-in list. */
export function resolveApp(name: string, custom: ToolContext['customApps']): ResolvedApp | null {
  const n = norm(name)
  const mine = custom.find((a) => norm(a.name) === n)
  if (mine) return { label: mine.name, kind: 'path', target: mine.path }
  const key = BUILT_IN_APPS[n] ? n : ALIASES[n]
  if (!key) return null
  const { label, target } = BUILT_IN_APPS[key]
  const [kind, ...rest] = target.split(':')
  return {
    label,
    kind: kind as 'exe' | 'uri',
    target: kind === 'uri' ? rest.join(':') : rest.join(':')
  }
}

export function appNames(custom: ToolContext['customApps']): string[] {
  return [...custom.map((a) => a.name), ...Object.keys(BUILT_IN_APPS)]
}

export const openApp = defineTool({
  name: 'open_app',
  label: 'Opening an app',
  description:
    "Open a program on the user's Windows PC. Only apps in the known list can be opened (the list is in the system prompt). If the app is not known, say so and suggest adding it in Settings > Apps.",
  schema: z.object({
    app: z.string().min(1).max(60).describe('App name, e.g. "spotify", "notepad", "vs code"')
  }),
  async run({ app }, ctx) {
    if (ctx.platform.os !== 'win32')
      return { content: 'Opening apps only works on Windows.', isError: true }
    const found = resolveApp(app, ctx.customApps)
    if (!found)
      return {
        content: `"${app}" is not in Nova's app list. Known apps: ${appNames(ctx.customApps).join(', ')}.`,
        isError: true,
        summary: `Unknown app: ${app}`
      }
    if (found.kind === 'uri') await ctx.platform.openUrl(found.target)
    else if (found.kind === 'exe') await ctx.platform.launch(found.target)
    else {
      const err = await ctx.platform.openPath(found.target)
      if (err)
        return {
          content: `Could not open ${found.label}: ${err}`,
          isError: true,
          summary: `Couldn't open ${found.label}`
        }
    }
    return { content: `Opened ${found.label}.`, summary: `Opened ${found.label}` }
  }
})
