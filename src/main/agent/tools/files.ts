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
