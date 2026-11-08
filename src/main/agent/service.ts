import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '../../shared/types'
import type { MemoryStore } from '../memory/store'
import { getSettings, readApiKey } from '../settings/store'
import { runTurn } from './loop'
import { buildSystemPrompt } from './prompt'
import { TOOLS } from './tools'
import type { Platform } from './tools/types'

/** Holds the conversation, the running turn and pending "Allow?" questions for one window. */
export class AgentService {
  private history: Anthropic.MessageParam[] = []
  private controller: AbortController | null = null
  private pending = new Map<string, (ok: boolean) => void>()
  private client: Anthropic | null = null
  private clientKey = ''

  constructor(
    private platform: Platform,
    private memory: MemoryStore,
    private emit: (e: AgentEvent) => void
  ) {}

  private getClient(): Anthropic {
    const key = readApiKey()
    if (!key) throw new Error('Add your Claude API key in Settings first.')
    if (!this.client || key !== this.clientKey) {
      this.client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 })
      this.clientKey = key
    }
    return this.client
  }

  async send(text: string): Promise<void> {
    const userText = text.trim().slice(0, 4000)
    if (!userText) return
    this.stop()
    const turnId = randomUUID()
    const controller = new AbortController()
    this.controller = controller
    const settings = getSettings()
    try {
      this.history = await runTurn({
        client: this.getClient(),
        model: settings.model,
        system: buildSystemPrompt(settings, this.memory.list(), new Date(), this.platform.os),
        history: this.history,
        userText,
        tools: TOOLS,
        webSearch: settings.webSearch,
        ctx: {
          platform: this.platform,
          memory: this.memory,
          customApps: settings.customApps,
          now: () => new Date()
        },
        turnId,
        emit: this.emit,
        confirm: (id, title, detail) =>
          new Promise<boolean>((resolve) => {
            this.pending.set(id, resolve)
            this.emit({ type: 'confirm', turnId, id, title, detail })
          }),
        signal: controller.signal
      })
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
    return 'Your Anthropic account is out of credit. Add credit in the Claude Console.'
  if (e instanceof Anthropic.APIError)
    return `Claude returned an error (${e.status ?? 'unknown'}). Try again.`
  return e instanceof Error ? e.message : 'Something went wrong.'
}
