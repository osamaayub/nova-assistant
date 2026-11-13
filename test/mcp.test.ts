import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { McpClient } from '../src/main/mcp/client'
import { McpManager } from '../src/main/mcp/manager'
import { jsonSchemaToZod, mcpTool } from '../src/main/agent/tools/mcp'
import type { ToolContext } from '../src/main/agent/tools/types'
import { fakePlatform, memory } from './helpers'

const fixture = join(__dirname, 'fixtures', 'mcp-server.mjs')
const config = { name: 'fake', command: process.execPath, args: [fixture], env: {} }

function ctx(confirm: (t: string, d: string) => Promise<boolean> = async () => true) {
  const { platform } = fakePlatform()
  return { platform, memory: memory(), customApps: [], confirm, now: () => new Date() } as ToolContext
}

describe('MCP client', () => {
  it('connects, lists tools and calls one', async () => {
    const client = new McpClient(config)
    const tools = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(['list_events', 'send_email'])
    const out = await client.callTool('send_email', { to: 'a@b.c', body: 'hi' })
    expect(out).toContain('send_email')
    client.close()
  }, 15000)

  it('marks a dead server as an error instead of crashing', async () => {
    const client = new McpClient({
      name: 'ghost',
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
      env: {}
    })
    await expect(client.listTools()).rejects.toThrow()
    client.close()
  }, 15000)
})

describe('MCP manager', () => {
  it('syncs settings into live servers and reports status', async () => {
    const manager = new McpManager()
    manager.sync([config])
    for (let i = 0; i < 50; i++) {
      if (manager.status()[0]?.state === 'connected') break
      await new Promise((r) => setTimeout(r, 100))
    }
    const status = manager.status()
    expect(status[0].state).toBe('connected')
    expect(status[0].tools).toEqual(['list_events', 'send_email'])
    const tools = await manager.agentTools()
    expect(tools.map((t) => t.name)).toEqual([
      'mcp_fake_list_events',
      'mcp_fake_send_email'
    ])
    manager.sync([])
    expect(manager.status()).toEqual([])
    manager.closeAll()
  }, 20000)
})

describe('MCP tool wrapper', () => {
  it('runs read-only tools without asking', async () => {
    const asked: string[] = []
    const tool = mcpTool('fake', {
      name: 'list_events',
      inputSchema: { type: 'object', properties: { day: { type: 'string' } }, required: ['day'] },
      annotations: { readOnlyHint: true }
    }, async () => 'two events')
    const res = await tool.run({ day: 'Friday' } as never, ctx(async (t) => (asked.push(t), true)))
    expect(res.content).toBe('two events')
    expect(asked).toEqual([])
  })

  it('asks before a tool that can change data, and stops when declined', async () => {
    const asked: string[] = []
    let calls = 0
    const tool = mcpTool('fake', {
      name: 'send_email',
      inputSchema: {
        type: 'object',
        properties: { to: { type: 'string' }, body: { type: 'string' } },
        required: ['to', 'body']
      }
    }, async () => (calls++, 'sent'))
    const res = await tool.run(
      { to: 'a@b.c', body: 'hi' } as never,
      ctx(async (t) => (asked.push(t), false))
    )
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('send_email')
    expect(calls).toBe(0)
    expect(res.isError).toBe(true)
  })
})

describe('jsonSchemaToZod', () => {
  it('maps object schemas and keeps required vs optional', () => {
    const zod = jsonSchemaToZod({
      type: 'object',
      properties: {
        day: { type: 'string' },
        limit: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['day']
    })
    expect(zod.safeParse({ day: 'Mon' }).success).toBe(true)
    expect(zod.safeParse({ limit: 3 }).success).toBe(false)
    expect(zod.safeParse({ day: 'Mon', extra: 1 }).success).toBe(true)
  })
})
