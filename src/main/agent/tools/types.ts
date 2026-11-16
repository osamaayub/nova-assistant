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
  /**
   * Asks Windows to close a program by its process name (a graceful close, like clicking the X).
   * The name always comes from Nova's fixed table, never from the model.
   */
  closeProcess(image: string): Promise<'closed' | 'not-running' | 'failed'>
  /**
   * Presses Enter in a chat app, but only once that app's window is really the one in front.
   * Resolves false when it could not be sure, so nothing is typed into the wrong window.
   */
  pressEnter(app: 'whatsapp'): Promise<boolean>
}

/** Resolves a host name to its IP addresses. Tests pass a fake so nothing touches DNS. */
export type HostLookup = (hostname: string) => Promise<string[]>

/** One passage found in the user's documents. */
export interface DocHit {
  /** Where it came from, e.g. "Documents/notes/trip.md". Never a full disk path. */
  display: string
  /** Which passage of that file (1 is the start). */
  part: number
  text: string
}

export interface DocSearchResult {
  hits: DocHit[]
  /** How many files are searchable. */
  files: number
  /** Meaning-based search worked for this query, or only keywords did. */
  semantic: boolean
  /** A one-line suggestion when search could be better (for example a missing model). */
  hint?: string
  /** The scan stopped early (very large folders), so some files may be missing. */
  partial?: boolean
}

/** Search over the user's own documents. Read-only. Implemented in src/main/rag. */
export interface DocSearch {
  search(query: string): Promise<DocSearchResult>
}

export interface ToolContext {
  platform: Platform
  memory: MemoryStore
  customApps: CustomApp[]
  /** Asks the user in the window. Resolves true only if they click Allow. */
  confirm(title: string, detail: string): Promise<boolean>
  now(): Date
  /** Web requests a tool makes. Tests pass a fake so nothing touches the network. */
  fetch?: typeof fetch
  /** DNS lookups made by tools that read the web. Tests pass a fake. */
  lookup?: HostLookup
  /** Search over the user's documents. Absent in tests that do not need it. */
  docs?: DocSearch
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
