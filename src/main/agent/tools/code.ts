import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { insideAllowed } from './files'
import { defineTool, type ToolContext } from './types'

const execFileAsync = promisify(execFile)
const FOLDERS = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos'] as const
type Folder = (typeof FOLDERS)[number]
const folderSchema = z.enum(FOLDERS)
const relSchema = z
  .string()
  .min(1)
  .max(400)
  .describe('Path inside that folder, e.g. "my-project/src/app.ts"')

function resolveIn(ctx: ToolContext, folder: Folder, rel: string): string | null {
  return insideAllowed(ctx.platform, folder, rel)
}

export const readCodeFile = defineTool({
  name: 'read_code_file',
  label: 'Reading a code file',
  description:
    "Read a text or code file inside one of the user's folders (desktop, documents, downloads, pictures, music, videos). Use it before changing or checking code.",
  schema: z.object({
    folder: folderSchema,
    path: relSchema,
    maxChars: z.number().int().min(1000).max(60000).default(20000)
  }),
  async run({ folder, path: rel, maxChars }, ctx) {
    const full = await resolveIn(ctx, folder, rel)
    if (!full) return { content: 'That path is outside the allowed folders.', isError: true }
    const info = await stat(full).catch(() => null)
    if (!info?.isFile()) return { content: `${full} is not a file.`, isError: true }
    if (info.size > 512 * 1024)
      return {
        content: `${rel} is too large to read (${Math.round(info.size / 1024)} KB).`,
        isError: true
      }
    const content = await readFile(full, 'utf8')
    if (content.includes('\0'))
      return { content: `${rel} looks like a binary file.`, isError: true }
    const shown =
      content.length > maxChars ? `${content.slice(0, maxChars)}\n\n[truncated]` : content
    return { content: `--- ${full} ---\n${shown}`, summary: `Read ${rel}` }
  }
})

export const writeCodeFile = defineTool({
  name: 'write_code_file',
  label: 'Writing a code file',
  description:
    "Create or replace a text or code file inside one of the user's folders. The user must approve the exact path first. Never use it to delete files.",
  schema: z.object({
    folder: folderSchema,
    path: relSchema,
    content: z.string().min(1).max(100000),
    overwrite: z
      .boolean()
      .default(false)
      .describe('Set true only when replacing an existing file on purpose')
  }),
  async run({ folder, path: rel, content, overwrite }, ctx) {
    const full = await resolveIn(ctx, folder, rel)
    if (!full) return { content: 'That path is outside the allowed folders.', isError: true }
    const exists = await stat(full)
      .then((s) => s.isFile())
      .catch(() => false)
    if (exists && !overwrite)
      return {
        content: `${rel} already exists. Read it and pass overwrite: true to replace it.`,
        isError: true
      }
    const ok = await ctx.confirm(
      `${exists ? 'Replace' : 'Create'} ${rel} in ${folder}?`,
      `${full}\n${content.length} characters\n\nNothing is deleted.`
    )
    if (!ok) return { content: 'The user declined, so nothing was written.', summary: 'Cancelled' }
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content, 'utf8')
    return { content: `Wrote ${full} (${content.length} characters).`, summary: `Wrote ${rel}` }
  }
})

type Check = 'npm test' | 'npm run typecheck' | 'npm run lint' | 'python -m pytest'
function checkCommand(
  dirHas: (name: string) => Promise<boolean>,
  check: string,
  win: boolean
): Promise<{ file: string; args: string[]; label: Check } | null> {
  return (async () => {
    const isWin = win
    if (await dirHas('package.json')) {
      if (check === 'typecheck')
        return {
          file: isWin ? 'cmd.exe' : 'npm',
          args: isWin ? ['/d', '/s', '/c', 'npm run typecheck'] : ['run', 'typecheck'],
          label: 'npm run typecheck'
        }
      if (check === 'lint')
        return {
          file: isWin ? 'cmd.exe' : 'npm',
          args: isWin ? ['/d', '/s', '/c', 'npm run lint'] : ['run', 'lint'],
          label: 'npm run lint'
        }
      return {
        file: isWin ? 'cmd.exe' : 'npm',
        args: isWin ? ['/d', '/s', '/c', 'npm test'] : ['test'],
        label: 'npm test'
      }
    }
    if (check === 'test' && (await dirHas('pyproject.toml')))
      return { file: 'python', args: ['-m', 'pytest'], label: 'python -m pytest' }
    return null
  })()
}

export const runProjectCheck = defineTool({
  name: 'run_project_check',
  label: 'Running a project check',
  description:
    "Run one fixed check in a project folder inside the user's folders: npm test/typecheck/lint for Node projects, or python -m pytest for Python projects. The user must approve first. No arbitrary commands.",
  schema: z.object({
    folder: folderSchema,
    path: z.string().max(400).default('').describe('Project folder path inside that folder'),
    check: z.enum(['test', 'typecheck', 'lint'])
  }),
  async run({ folder, path: rel, check }, ctx) {
    const dir = await resolveIn(ctx, folder, rel || '.')
    if (!dir) return { content: 'That path is outside the allowed folders.', isError: true }
    const dirHas = async (name: string): Promise<boolean> =>
      stat(join(dir, name))
        .then((s) => s.isFile())
        .catch(() => false)
    const cmd = await checkCommand(dirHas, check, ctx.platform.os === 'win32')
    if (!cmd)
      return {
        content:
          'No fixed check found there. Use a Node project (package.json) or a Python project (pyproject.toml).',
        isError: true
      }
    const ok = await ctx.confirm(
      `Run ${cmd.label} in ${rel || folder}?`,
      `${cmd.label}\nIn ${dir}\n\nThis runs the project's own checks. Stop if you do not trust this folder.`
    )
    if (!ok) return { content: 'The user declined, so nothing was run.', summary: 'Cancelled' }
    try {
      const r = await execFileAsync(cmd.file, cmd.args, {
        cwd: dir,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      })
      const out = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.slice(-12000)
      return { content: `${cmd.label} passed.\n${out}`, summary: `${cmd.label} passed` }
    } catch (e) {
      const err = e as {
        code?: number | string
        stdout?: string
        stderr?: string
        message?: string
      }
      const out =
        `${err.stdout ?? ''}${err.stderr ? `\n${err.stderr}` : ''}`.slice(-12000) ||
        (err.message ?? 'failed')
      return {
        content: `${cmd.label} failed${err.code ? ` (exit ${err.code})` : ''}.\n${out}`,
        summary: `${cmd.label} failed`,
        isError: true
      }
    }
  }
})
