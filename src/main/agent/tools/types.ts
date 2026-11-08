import type { z } from 'zod'
import type { MemoryStore } from '../../memory/store'
import type { CustomApp } from '../../../shared/types'

/** Everything a tool may touch. Passed in (not imported) so tools can be tested without Electron. */
export interface Platform {
  os: NodeJS.Platform
  folders: Record<
    'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos',
    string
  >
  openUrl(url: string): Promise<void>
  /** Opens a file, folder or program with its default handler. Resolves to an error message, or '' on success. */
  openPath(path: string): Promise<string>
  /** Starts a program from Nova's fixed list (never text from the model). */
  launch(command: string): Promise<void>
  notify(title: string, body: string): void
}

export interface ToolContext {
  platform: Platform
  memory: MemoryStore
  customApps: CustomApp[]
  /** Asks the user in the window. Resolves true only if they click Allow. */
  confirm(title: string, detail: string): Promise<boolean>
  now(): Date
}

export interface ToolResult {
  /** What Claude reads. */
  content: string
  /** One short line the window shows under the step, e.g. "Opened Spotify". */
  summary?: string
  isError?: boolean
}

export interface NovaTool<S extends z.ZodType = z.ZodType> {
  name: string
  /** Shown in the window while it runs, e.g. "Opening an app". */
  label: string
  description: string
  schema: S
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolResult>
}

export const defineTool = <S extends z.ZodType>(tool: NovaTool<S>): NovaTool<S> => tool
