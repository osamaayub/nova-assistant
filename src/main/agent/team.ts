import { z } from 'zod'
import { openApp } from './tools/apps'
import { readCodeFile, runProjectCheck, writeCodeFile } from './tools/code'
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
  id: 'pc' | 'files' | 'architect' | 'developer' | 'reviewer' | 'tester' | 'research' | 'connectors'
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
    id: 'architect',
    name: 'Architect agent',
    tool: 'ask_architect_agent',
    when: 'designing algorithms, architecture or an implementation plan before code is written',
    tools: [listFolder, readCodeFile],
    webSearch: false,
    instructions:
      "You are the Architect agent. You design algorithms, architecture and implementation plans for code inside the user's folders. You read files to ground the design, but you never write or run anything. Report a clear plan with files, steps and risks."
  },
  {
    id: 'developer',
    name: 'Developer agent',
    tool: 'ask_developer_agent',
    when: 'writing, editing or refactoring code files in a project folder',
    tools: [listFolder, readCodeFile, writeCodeFile],
    webSearch: false,
    instructions:
      "You are the Developer agent. You write and edit code inside the user's folders. Read before you write, keep changes focused, ask for approval through the tool, and never delete files or run commands. Report exactly which files changed."
  },
  {
    id: 'reviewer',
    name: 'Reviewer agent',
    tool: 'ask_reviewer_agent',
    when: 'reviewing code for bugs, security issues, edge cases or style before it is trusted',
    tools: [listFolder, readCodeFile],
    webSearch: false,
    instructions:
      "You are the Reviewer agent. You review code read-only for correctness, security, edge cases and clarity. You never edit files. Report concrete findings with file and line references, ordered by severity."
  },
  {
    id: 'tester',
    name: 'Tester agent',
    tool: 'ask_tester_agent',
    when: 'running fixed project checks like tests, typecheck or lint and reporting failures',
    tools: [listFolder, readCodeFile, runProjectCheck],
    webSearch: false,
    instructions:
      "You are the Tester agent. You run only the fixed project checks after approval and read the output. You never edit files or run arbitrary commands. Report pass or fail with the useful error details."
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

/** The specialist for MCP connectors (calendar, email...). Only exists when a server is connected. */
export function connectorsSpecialist(tools: NovaTool[]): Specialist {
  return {
    id: 'connectors',
    name: 'Connectors agent',
    tool: 'ask_connectors_agent',
    when: 'calendar, email, chat or other apps the user connected as MCP servers',
    tools,
    webSearch: false,
    instructions:
      'You are the Connectors agent. You use the tools of the external apps the user connected (calendar, email and similar). Some tools change data and will ask the user for approval; if the user declines, say so plainly.'
  }
}

export function specialistPrompt(s: Specialist, canSearch: boolean): string {
  return `${s.instructions}
The main assistant (Nova) gave you one task with the context and constraints you need. Stay within your role and use only your tools. Do the task, then report in one to three plain sentences what you completed or found, the evidence from your tools, and any failure, uncertainty, or remaining step. Your reply goes to Nova, not to the user.
Never claim you did something unless a tool result says it worked. If something failed or you could not verify it, say what and why.
${s.id === 'research' ? (canSearch ? 'You can search the web. End with the source addresses you used.' : 'You cannot search the web on this brain. You can only read pages whose address you know.') : ''}`.trim()
}

/** The tools the main agent gets: hand-over tools for each specialist plus memory, or every tool in single mode. */
export function mainAgentTools(
  mode: 'team' | 'single',
  delegate: (s: Specialist, task: string) => Promise<string>,
  specialists: Specialist[] = SPECIALISTS
): NovaTool[] {
  if (mode === 'single')
    return [
      ...specialists.flatMap((s) => s.tools).filter((t, i, all) => all.indexOf(t) === i),
      rememberFact,
      forgetFact
    ]
  const handOvers = specialists.map((s) =>
    defineTool({
      name: s.tool,
      label: `Asking the ${s.name}`,
      description: `Give a task to the ${s.name}. Use it for ${s.when}. Include the user's intent, relevant constraints, and any findings this task depends on; the agent cannot see the conversation.`,
      schema: z.object({ task: z.string().min(3).max(800) }),
      async run({ task }) {
        const report = await delegate(s, task)
        return {
          content: report || `${s.name} finished without a report.`,
          summary: `${s.name} reported back`
        }
      }
    })
  )
  return [...(handOvers as NovaTool[]), rememberFact, forgetFact, getDateTime] as NovaTool[]
}
