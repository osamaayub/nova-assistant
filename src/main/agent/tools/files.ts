import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { extname, join, parse, relative, resolve } from 'node:path'
import { z } from 'zod'
import { defineTool, type Platform } from './types'

type FolderKey = keyof Platform['folders']
const FOLDERS: FolderKey[] = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos']

/** Only paths inside the user's own folders are allowed. Blocks "..", other drives and system folders. */
export function insideAllowed(platform: Platform, folder: FolderKey, sub = ''): string | null {
  const root = resolve(platform.folders[folder])
  const full = resolve(root, sub)
  const rel = relative(root, full)
  if (rel.startsWith('..') || resolve(root, rel) !== full || /^[a-z]:/i.test(rel)) return null
  return full
}

export const CATEGORIES: Record<string, string[]> = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic'],
  Documents: [
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.rtf',
    '.odt',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.md'
  ],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  Installers: ['.exe', '.msi', '.msix', '.appx'],
  Videos: ['.mp4', '.mov', '.mkv', '.avi', '.webm'],
  Music: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'],
  Code: ['.js', '.ts', '.tsx', '.json', '.py', '.html', '.css', '.sql']
}

export function categoryOf(file: string): string {
  const ext = extname(file).toLowerCase()
  return Object.entries(CATEGORIES).find(([, exts]) => exts.includes(ext))?.[0] ?? 'Other'
}

/** A file name that doesn't exist yet in the folder: "report.pdf" -> "report (1).pdf". */
export function freeName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  const { name: base, ext } = parse(name)
  for (let i = 1; i < 1000; i++)
    if (!existsSync(join(dir, `${base} (${i})${ext}`))) return `${base} (${i})${ext}`
  return `${base} (${Date.now()})${ext}`
}

export const listFolder = defineTool({
  name: 'list_folder',
  label: 'Looking in a folder',
  description:
    "List files and folders in one of the user's folders (desktop, documents, downloads, pictures, music, videos), optionally a subfolder.",
  schema: z.object({
    folder: z.enum(FOLDERS as [FolderKey, ...FolderKey[]]),
    subfolder: z.string().max(200).default('').describe('Optional path inside that folder')
  }),
  async run({ folder, subfolder }, ctx) {
    const dir = insideAllowed(ctx.platform, folder, subfolder)
    if (!dir) return { content: 'That path is outside the allowed folders.', isError: true }
    const entries = await readdir(dir, { withFileTypes: true })
    const shown = entries.slice(0, 80).map((e) => (e.isDirectory() ? `[folder] ${e.name}` : e.name))
    return {
      content: `${dir} has ${entries.length} items${entries.length > 80 ? ' (first 80 shown)' : ''}:\n${shown.join('\n')}`,
      summary: `${entries.length} items in ${folder}`
    }
  }
})

export const openFolder = defineTool({
  name: 'open_folder',
  label: 'Opening a folder',
  description: "Open one of the user's folders in File Explorer.",
  schema: z.object({
    folder: z.enum(FOLDERS as [FolderKey, ...FolderKey[]]),
    subfolder: z.string().max(200).default('')
  }),
  async run({ folder, subfolder }, ctx) {
    const dir = insideAllowed(ctx.platform, folder, subfolder)
    if (!dir) return { content: 'That path is outside the allowed folders.', isError: true }
    const err = await ctx.platform.openPath(dir)
    return err
      ? { content: err, isError: true }
      : { content: `Opened ${dir}.`, summary: `Opened ${folder}` }
  }
})

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** One plain folder name: no slashes, no Windows-forbidden characters, nothing reserved. Returns a problem or ''. */
export function folderNameProblem(name: string): string {
  const n = name.trim()
  if (!n || n.length > 80) return 'Give the folder a short name.'
  if (n === '.' || n === '..' || /[\\/:*?"<>|]/.test(n) || [...n].some((c) => c.charCodeAt(0) < 32))
    return 'A folder name can not contain \\ / : * ? " < > | or be "..".'
  if (/[. ]$/.test(n)) return 'A folder name can not end with a dot or a space.'
  if (RESERVED.test(n)) return `"${n}" is a name Windows keeps for itself.`
  return ''
}

export const createFolder = defineTool({
  name: 'create_folder',
  label: 'Creating a folder',
  description:
    "Create a new, empty folder inside one of the user's folders (desktop, documents, downloads, pictures, music, videos), optionally inside a subfolder that already exists. It never overwrites or changes anything that exists.",
  schema: z.object({
    folder: z.enum(FOLDERS as [FolderKey, ...FolderKey[]]),
    name: z.string().min(1).max(80).describe('The new folder name, one name only (no slashes)'),
    subfolder: z.string().max(200).default('').describe('Optional existing folder inside it')
  }),
  async run({ folder, name, subfolder }, ctx) {
    const problem = folderNameProblem(name)
    if (problem) return { content: problem, isError: true, summary: 'Bad folder name' }
    const parent = insideAllowed(ctx.platform, folder, subfolder)
    if (!parent) return { content: 'That path is outside the allowed folders.', isError: true }
    const target = insideAllowed(ctx.platform, folder, join(subfolder, name.trim()))
    if (!target) return { content: 'That path is outside the allowed folders.', isError: true }
    if (existsSync(target))
      return {
        content: `"${name.trim()}" already exists there, so nothing was changed.`,
        summary: 'Already exists'
      }
    // Not recursive: the parent must already exist, so a typo can not build a deep tree.
    await mkdir(target)
    return { content: `Created ${target}.`, summary: `Created ${name.trim()}` }
  }
})

const SKIP_DIRS = new Set(['node_modules', '.git', '$recycle.bin', 'appdata'])

/** Looks for file or folder names containing the words, a few levels deep. Read-only and size-limited. */
export async function searchNames(
  roots: string[],
  query: string,
  limits = { depth: 4, visited: 4000, results: 15 }
): Promise<{ found: string[]; truncated: boolean }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const found: string[] = []
  let visited = 0
  let truncated = false
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (found.length >= limits.results || visited >= limits.visited) {
      truncated = true
      return
    }
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (found.length >= limits.results || ++visited > limits.visited) {
        truncated = true
        return
      }
      const lower = e.name.toLowerCase()
      if (words.every((w) => lower.includes(w))) found.push(join(dir, e.name))
      if (
        e.isDirectory() &&
        depth < limits.depth &&
        !lower.startsWith('.') &&
        !SKIP_DIRS.has(lower)
      )
        await walk(join(dir, e.name), depth + 1)
    }
  }
  for (const r of roots) await walk(r, 0)
  return { found, truncated }
}

export const findFile = defineTool({
  name: 'find_file',
  label: 'Finding a file',
  description:
    "Find files or folders by part of their name inside the user's own folders (desktop, documents, downloads, pictures, music, videos). Searches a few levels deep and returns up to 15 matches. Read-only.",
  schema: z.object({
    query: z.string().min(1).max(80).describe('Words in the name, e.g. "invoice" or "resume pdf"'),
    folder: z
      .enum(['all', ...FOLDERS] as ['all', ...FolderKey[]])
      .default('all')
      .describe('Where to look; "all" searches every allowed folder')
  }),
  async run({ query, folder }, ctx) {
    const keys = folder === 'all' ? FOLDERS : [folder as FolderKey]
    const roots = keys.map((k) => ctx.platform.folders[k])
    const { found, truncated } = await searchNames([...new Set(roots)], query)
    if (!found.length)
      return {
        content: `No file or folder with "${query}" in its name${truncated ? ' (searched part of the folders)' : ''}.`,
        summary: 'No match'
      }
    return {
      content: `Found ${found.length}${truncated ? ' (there may be more)' : ''}:\n${found.join('\n')}`,
      summary: `Found ${found.length} match${found.length === 1 ? '' : 'es'}`
    }
  }
})

export const organizeDownloads = defineTool({
  name: 'organize_downloads',
  label: 'Organizing Downloads',
  description:
    'Tidy the Downloads folder by moving loose files into folders by type (Images, Documents, Archives, Installers, Videos, Music, Code, Other). Nothing is deleted or overwritten. The user must approve the plan first.',
  schema: z.object({}),
  async run(_input, ctx) {
    const dir = ctx.platform.folders.downloads
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name)
    // Skip files still being downloaded.
    const files = names.filter((n) => !/\.(crdownload|part|tmp|download)$/i.test(n)).slice(0, 500)
    if (!files.length)
      return {
        content: 'Downloads has no loose files to organize.',
        summary: 'Nothing to organize'
      }
    const plan = new Map<string, string[]>()
    for (const f of files) plan.set(categoryOf(f), [...(plan.get(categoryOf(f)) ?? []), f])
    const detail = [...plan]
      .map(([cat, list]) => `${cat}: ${list.length} file${list.length === 1 ? '' : 's'}`)
      .join('\n')
    const ok = await ctx.confirm(
      `Move ${files.length} files in Downloads into folders?`,
      `${detail}\n\nNothing is deleted. Files with the same name get a number added.`
    )
    if (!ok) return { content: 'The user declined, so no files were moved.', summary: 'Cancelled' }
    let moved = 0
    const failed: string[] = []
    for (const [cat, list] of plan) {
      const target = join(dir, cat)
      await mkdir(target, { recursive: true })
      for (const f of list) {
        try {
          if (!(await stat(join(dir, f))).isFile()) continue
          await rename(join(dir, f), join(target, freeName(target, f)))
          moved++
        } catch {
          failed.push(f)
        }
      }
    }
    return {
      content: `Moved ${moved} files into ${plan.size} folders.${failed.length ? ` Could not move ${failed.length} (they may be open): ${failed.slice(0, 5).join(', ')}` : ''}`,
      summary: `Moved ${moved} files`
    }
  }
})
