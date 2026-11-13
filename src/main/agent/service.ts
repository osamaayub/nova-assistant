import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import type { AgentEvent, Settings } from '../../shared/types'
import type { MemoryStore } from '../memory/store'
import { getSettings, readApiKey } from '../settings/store'
import { runTurn } from './loop'
import { buildSystemPrompt } from './prompt'
import { serialize } from './serialize'
import { claudeProvider } from './providers/claude'
import { flmProvider } from './providers/flm'
import { ollamaProvider } from './providers/ollama'
import { connectorsSpecialist, mainAgentTools, SPECIALISTS, specialistPrompt, type Specialist } from './team'
import type { McpManager } from '../mcp/manager'
import type { Platform } from './tools/types'
import type { Msg, Provider } from './types'

const SPECIALIST_STEPS = 6

/** Builds the brain the user chose in Settings. Ollama and flm need no key. */
export function createProvider(s: Settings, apiKey: string | null): Provider {
  if (s.provider === 'ollama') return ollamaProvider(s.ollamaUrl, s.ollamaModel)
  if (s.provider === 'flm') return flmProvider()
  if (!apiKey)
    throw new Error(
      'Add your Claude API key in Settings, or switch the brain to free local AI (Ollama) or free cloud.'
    )
  return claudeProvider(new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }), s.model)
}

/** Holds the conversation, the running turn and pending "Allow?" questions for one window. */
export class AgentService {
  private history: Msg[] = []
  private historyProvider = ''
  private controller: AbortController | null = null
  private pending = new Map<string, (ok: boolean) => void>()

  constructor(
    private platform: Platform,
    private memory: MemoryStore,
    private emit: (e: AgentEvent) => void,
    private makeProvider: (s: Settings) => Provider = (s) => createProvider(s, readApiKey()),
    private mcp?: McpManager
  ) {}

  async send(text: string): Promise<void> {
    const userText = text.trim().slice(0, 4000)
    if (!userText) return
    this.stop()
    const turnId = randomUUID()
    const controller = new AbortController()
    this.controller = controller
    const settings = getSettings()
    try {
      const provider = this.makeProvider(settings)
      // A conversation started on one brain isn't sent to another (formats differ).
      if (this.historyProvider !== provider.id) this.history = []
      this.historyProvider = provider.id
      const ctx = {
        platform: this.platform,
        memory: this.memory,
        customApps: settings.customApps,
        now: () => new Date()
      }
      // Agents can work side by side, but the window shows one "Allow?" at a time. Others wait.
      const confirm = serialize(
        (id: string, title: string, detail: string): Promise<boolean> =>
          new Promise<boolean>((resolve) => {
            if (controller.signal.aborted) return resolve(false)
            this.pending.set(id, resolve)
            this.emit({ type: 'confirm', turnId, id, title, detail })
          })
      )

      // A specialist gets a fresh, short conversation with only its own tools.
      const delegate = async (s: Specialist, task: string): Promise<string> => {
        const res = await runTurn({
          provider,
          system: specialistPrompt(s, provider.canSearchWeb && settings.webSearch),
          history: [],
          userText: task,
          tools: s.tools,
          webSearch: s.webSearch && settings.webSearch,
          ctx,
          turnId,
          emit: this.emit,
          confirm,
          signal: controller.signal,
          maxSteps: SPECIALIST_STEPS,
          agent: s.name
        })
        return res.text
      }

      const team = settings.agentMode === 'team'
      const connectorTools = this.mcp ? await this.mcp.agentTools() : []
      const specialists = connectorTools.length
        ? [...SPECIALISTS, connectorsSpecialist(connectorTools)]
        : SPECIALISTS
      const result = await runTurn({
        provider,
        system: buildSystemPrompt(settings, this.memory.list(), new Date(), this.platform.os, {
          mode: settings.agentMode,
          canSearch: provider.canSearchWeb && settings.webSearch,
          team: team
            ? specialists.map((s) => ({ tool: s.tool, name: s.name, when: s.when }))
            : undefined
        }),
        history: this.history,
        userText,
        tools: mainAgentTools(settings.agentMode, delegate, specialists),
        // In team mode the Research agent searches; in single mode Nova searches itself.
        webSearch: !team && settings.webSearch,
        ctx,
        turnId,
        emit: this.emit,
        confirm,
        signal: controller.signal
      })
      this.history = result.history
    } catch (e) {
      if (controller.signal.aborted) this.emit({ type: 'done', turnId })
      else this.emit({ type: 'error', turnId, message: friendlyError(e) })
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  confirm(id: string, approved: boolean): void {
    this.pending.get(id)?.(approved)
    this.pending.delete(id)
  }

  stop(): void {
    this.controller?.abort()
    for (const resolve of this.pending.values()) resolve(false)
    this.pending.clear()
  }

  newChat(): void {
    this.stop()
    this.history = []
  }
}

/** Turns API errors into one plain sentence the window can show and speak. */
export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return 'Your Claude API key was not accepted. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError)
    return 'Your Claude API key does not have access to this model. Try another model in Settings.'
  if (e instanceof Anthropic.RateLimitError)
    return 'Claude is rate limiting requests right now. Wait a moment and try again.'
  if (e instanceof Anthropic.APIConnectionError)
    return "I can't reach Claude. Check your internet connection."
  if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message))
    return 'Your Anthropic account is out of credit. Add credit in the Claude Console, or switch to free local AI.'
  if (e instanceof Anthropic.APIError)
    return `Claude returned an error (${e.status ?? 'unknown'}). Try again.`
  return e instanceof Error ? e.message : 'Something went wrong.'
}
