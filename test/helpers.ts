import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { MemoryStore } from '../src/main/memory/store'
import type { StreamingClient } from '../src/main/agent/loop'
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
    notify: (t, b) => void calls.push(`notify:${t}:${b}`)
  }
  return { platform, calls, root }
}

export const memory = () => MemoryStore.open(null)

/** A fake Claude: each call returns the next scripted message and records what it was sent. */
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
