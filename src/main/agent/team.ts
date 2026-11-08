import { z } from 'zod'
import { openApp } from './tools/apps'
import { listFolder, openFolder, organizeDownloads } from './tools/files'
import { forgetFact, rememberFact } from './tools/memory'
import { getDateTime, setTimer, systemStatus } from './tools/system'
import { defineTool, type NovaTool } from './tools/types'
import { openWebsite, playMusic, readWebPage } from './tools/web'

/**
 * Nova works as a small team. The main agent talks to you and decides who should do the job;
 * each specialist has its own instructions and only the tools it needs.
 */
export interface Specialist {
  id: 'pc' | 'files' | 'research'
  name: string
  /** The tool the main agent calls to hand over a task. */
  tool: string
  /** When the main agent should pick this specialist. */
  when: string
  tools: NovaTool[]
  webSearch: boolean
  instructions: string
}

export const SPECIALISTS: Specialist[] = [
  {
    id: 'pc',
    name: 'PC agent',
    tool: 'ask_pc_agent',
    when: 'opening apps or websites, playing music, checking how the PC is doing, timers and reminders',
    tools: [openApp, openWebsite, playMusic, systemStatus, setTimer, getDateTime],
    webSearch: false,
    instructions:
      'You are the PC agent. You control apps, websites, music, timers and system checks on a Windows PC.'
  },
  {
    id: 'files',
    name: 'Files agent',
    tool: 'ask_files_agent',
    when: "looking in or opening the user's folders, and tidying Downloads",
    tools: [listFolder, openFolder, organizeDownloads],
    webSearch: false,
    instructions:
      "You are the Files agent. You look in and organize the user's own folders. You never delete anything."
  },
  {
    id: 'research',
    name: 'Research agent',
    tool: 'ask_research_agent',
    when: 'questions that need current or exact facts from the web',
    tools: [readWebPage, getDateTime],
    webSearch: true,
    instructions:
      'You are the Research agent. You find current, accurate information. Prefer official sources. If you cannot search the web (local model) and have no page address to read, say that web search needs the Claude brain.'
  }
]

export function specialistPrompt(s: Specialist, canSearch: boolean): string {
  return `${s.instructions}
The main assistant (Nova) gave you one task. Do it with your tools, then reply in one to three plain sentences saying what you did or found. Your reply goes to Nova, not to the user.
Never claim you did something unless a tool result says it worked. If something failed, say what and why.
${s.id === 'research' ? (canSearch ? 'You can search the web. End with the source addresses you used.' : 'You cannot search the web on this brain. You can only read pages whose address you know.') : ''}`.trim()
}

/** The tools the main agent gets: hand-over tools for each specialist plus memory, or every tool in single mode. */
export function mainAgentTools(
  mode: 'team' | 'single',
  delegate: (s: Specialist, task: string) => Promise<string>
): NovaTool[] {
  if (mode === 'single')
    return [
      ...SPECIALISTS.flatMap((s) => s.tools).filter((t, i, all) => all.indexOf(t) === i),
      rememberFact,
      forgetFact
    ]
  const handOvers = SPECIALISTS.map((s) =>
    defineTool({
      name: s.tool,
      label: `Asking the ${s.name}`,
      description: `Give a task to the ${s.name}. Use it for ${s.when}. Describe the task completely in one or two sentences; the agent cannot see the conversation.`,
      schema: z.object({ task: z.string().min(3).max(800) }),
      async run({ task }) {
        const report = await delegate(s, task)
        return {
          content: report || `${s.name} finished without a report.`,
          summary: `${s.name} finished`
        }
      }
    })
  )
  return [...(handOvers as NovaTool[]), rememberFact, forgetFact, getDateTime] as NovaTool[]
}
