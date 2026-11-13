import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { MemoryStore } from '../src/main/memory/store'
import type { StreamingClient } from '../src/main/agent/providers/claude'
import type { ChatRequest, ModelReply, Provider } from '../src/main/agent/types'
import type { Platform } from '../src/main/agent/tools/types'

export function fakePlatform(os: NodeJS.Platform = 'win32') {
  const root = mkdtempSync(join(tmpdir(), 'nova-'))
  const calls: string[] = []
  const platform: Platform = {
    os,
    folders: {
      home: root,
      desktop: join(root, 'Desktop'),
      documents: join(root, 'Documents'),
      downloads: join(root, 'Downloads'),
      pictures: join(root, 'Pictures'),
      music: join(root, 'Music'),
      videos: join(root, 'Videos')
    },
    openUrl: async (u) => void calls.push(`url:${u}`),
    openPath: async (p) => (calls.push(`path:${p}`), ''),
    launch: async (c) => void calls.push(`launch:${c}`),
    notify: (t, b) => void calls.push(`notify:${t}:${b}`),
    closeProcess: async (image) => {
      calls.push(`close:${image}`)
      return 'closed'
    },
    pressEnter: async (app) => {
      calls.push(`enter:${app}`)
      return true
    }
  }
  return { platform, calls, root }
}

export const memory = () => MemoryStore.open(null)

/** A fake Claude client: each call returns the next scripted message and records what it was sent. */
export function fakeClient(script: Partial<Anthropic.Message>[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = []
  let i = 0
  const client: StreamingClient = {
    messages: {
      stream(params) {
        sent.push(JSON.parse(JSON.stringify(params)))
        const msg = {
          id: `m${i}`,
          type: 'message',
          role: 'assistant',
          model: params.model,
          stop_reason: 'end_turn',
          usage: {},
          ...script[i++]
        } as Anthropic.Message
        let onText: ((d: string) => void) | null = null
        return {
          on(_e: 'text', l: (d: string) => void) {
            onText = l
            return this
          },
          async finalMessage() {
            for (const b of msg.content) if (b.type === 'text') onText?.(b.text)
            return msg
          }
        }
      }
    }
  }
  return { client, sent }
}

/** A fake brain for the loop and team tests: replies are scripted per call. */
export function fakeProvider(script: ModelReply[] | ((req: ChatRequest, i: number) => ModelReply)) {
  const seen: ChatRequest[] = []
  let i = 0
  const provider: Provider = {
    id: 'ollama',
    label: 'Fake',
    canSearchWeb: false,
    async chat(req) {
      seen.push(JSON.parse(JSON.stringify({ ...req, onText: undefined, signal: undefined })))
      const reply = typeof script === 'function' ? script(req, i++) : script[i++]
      for (const p of reply.parts) if (p.type === 'text') req.onText?.(p.text)
      return reply
    },
    finishTurn: (m) => m
  }
  return { provider, seen }
}
