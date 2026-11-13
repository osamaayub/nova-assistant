import type { McpServerConfig, McpServerStatus, Settings } from '../../shared/types'
import { mcpTool } from '../agent/tools/mcp'
import type { NovaTool } from '../agent/tools/types'
import { McpClient, type McpToolDef } from './client'

interface Entry {
  config: McpServerConfig
  client: McpClient
  state: McpServerStatus['state']
  tools: McpToolDef[]
  error?: string
}

/**
 * Owns the MCP servers from Settings: starts them, keeps them in step with the settings,
 * and hands their tools to the agent. Servers that fail to start are marked, not fatal.
 */
export class McpManager {
  private entries = new Map<string, Entry>()

  /** Starts servers that are new and stops ones that were removed. Called at boot and after settings change. */
  sync(configs: McpServerConfig[]): void {
    const wanted = new Map(configs.map((c) => [c.name, c]))
    for (const [name, e] of this.entries) {
      if (!wanted.has(name)) {
        e.client.close()
        this.entries.delete(name)
      }
    }
    for (const [name, config] of wanted) {
      const existing = this.entries.get(name)
      if (existing && JSON.stringify(existing.config) === JSON.stringify(config)) continue
      existing?.client.close()
      const entry: Entry = {
        config,
        client: new McpClient(config),
        state: 'connecting',
        tools: []
      }
      this.entries.set(name, entry)
      void this.connect(entry)
    }
  }

  private async connect(e: Entry): Promise<void> {
    try {
      e.tools = await e.client.listTools()
      e.state = 'connected'
      e.error = undefined
    } catch (err) {
      e.state = 'error'
      e.error = err instanceof Error ? err.message : String(err)
      e.tools = []
    }
  }

  /** Every tool every connected server offers, as Nova tools. */
  async agentTools(): Promise<NovaTool[]> {
    const out: NovaTool[] = []
    for (const e of this.entries.values()) {
      if (e.state !== 'connected') continue
      for (const t of e.tools) out.push(mcpTool(e.config.name, t, (args) => e.client.callTool(t.name, args)))
    }
    return out
  }

  status(): McpServerStatus[] {
    return [...this.entries.values()].map((e) => ({
      name: e.config.name,
      state: e.state,
      tools: e.tools.map((t) => t.name),
      error: e.error
    }))
  }

  /** Re-runs the handshake for servers that failed, e.g. after the user fixes a path. */
  async reconnect(): Promise<McpServerStatus[]> {
    await Promise.all(
      [...this.entries.values()]
        .filter((e) => e.state !== 'connected')
        .map(async (e) => {
          e.client.close()
          e.state = 'connecting'
          e.error = undefined
          await this.connect(e)
        })
    )
    return this.status()
  }

  closeAll(): void {
    for (const e of this.entries.values()) e.client.close()
    this.entries.clear()
  }
}

export function syncFromSettings(manager: McpManager, settings: Settings): void {
  manager.sync(settings.mcpServers)
}
