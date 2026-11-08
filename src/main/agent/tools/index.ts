import { z } from 'zod'
import { openApp } from './apps'
import { listFolder, openFolder, organizeDownloads } from './files'
import { forgetFact, rememberFact } from './memory'
import { getDateTime, setTimer, systemStatus } from './system'
import type { NovaTool } from './types'
import { openWebsite, playMusic } from './web'

export const TOOLS: NovaTool[] = [
  openApp,
  openWebsite,
  playMusic,
  systemStatus,
  getDateTime,
  setTimer,
  listFolder,
  openFolder,
  organizeDownloads,
  rememberFact,
  forgetFact
] as NovaTool[]

/** Converts Nova's tools to the Claude API format. The Zod schema is the single source of truth. */
export function toApiTools(
  tools: NovaTool[]
): { name: string; description: string; input_schema: { type: 'object'; [k: string]: unknown } }[] {
  return tools.map((t) => {
    const schema = { ...(z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>) }
    delete schema.$schema
    return { name: t.name, description: t.description, input_schema: { ...schema, type: 'object' } }
  })
}
