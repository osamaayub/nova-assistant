import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { McpServerConfig } from '../../shared/types'

/**
 * A minimal MCP client for stdio servers (the most common kind: calendar, email, files).
 * Speaks newline-delimited JSON-RPC 2.0. No Electron imports, so tests can run it.
 */

export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}

interface RpcResponse {
  jsonrpc: '2.0'
  id?: number | string
  result?: unknown
  error?: { code: number; message: string }
}

const PROTOCOL_VERSION = '2025-06-18'
const REQUEST_TIMEOUT = 30_000

export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >()
  private ready: Promise<void> | null = null

  constructor(private config: McpServerConfig) {}

  get running(): boolean {
    return !!this.proc && !this.proc.killed
  }

  /** Spawns the server and does the MCP handshake. Safe to call once. */
  connect(): Promise<void> {
    this.ready ??= this.start().catch((e) => {
      this.ready = null // a failed start must not poison every later retry
      throw e
    })
    return this.ready
  }

  private start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let proc: ChildProcessWithoutNullStreams
      try {
        proc = spawn(this.config.command, this.config.args, {
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      this.proc = proc
      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', (chunk: string) => this.onData(chunk))
      // Server logs go nowhere near the user's chat; they only help debugging, so drop them.
      proc.stderr.resume()
      proc.on('error', (e) => this.failAll(e))
      proc.on('exit', (code) => this.failAll(new Error(`The ${this.config.name} server stopped (code ${code ?? 'unknown'}).`)))

      this.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'nova-assistant', version: '1.2.0' }
      })
        .then(() => {
          this.notify('notifications/initialized', {})
          resolve()
        })
        .catch(reject)
    })
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let nl = this.buf.indexOf('\n')
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      nl = this.buf.indexOf('\n')
      if (!line) continue
      try {
        this.onMessage(JSON.parse(line) as RpcResponse)
      } catch {
        // Not JSON-RPC (some servers print banners); ignore.
      }
    }
  }

  private onMessage(msg: RpcResponse): void {
    if (msg.id === undefined) return // server->client request or notification; we don't serve those
    const job = this.pending.get(Number(msg.id))
    if (!job) return
    this.pending.delete(Number(msg.id))
    clearTimeout(job.timer)
    if (msg.error) job.reject(new Error(msg.error.message))
    else job.resolve(msg.result)
  }

  private failAll(e: Error): void {
    for (const job of this.pending.values()) {
      clearTimeout(job.timer)
      job.reject(e)
    }
    this.pending.clear()
    this.proc = null
    this.ready = null
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.proc?.stdin.writable) throw new Error(`${this.config.name} is not running.`)
    this.proc.stdin.write(JSON.stringify(payload) + '\n')
  }

  private notify(method: string, params: Record<string, unknown>): void {
    try {
      this.send({ jsonrpc: '2.0', method, params })
    } catch {
      /* connection already gone */
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${this.config.name} did not answer ${method} in time.`))
      }, REQUEST_TIMEOUT)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.connect()
    const res = (await this.request('tools/list', {})) as { tools?: McpToolDef[] }
    return res.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.connect()
    const res = (await this.request('tools/call', { name, arguments: args })) as {
      content?: { type: string; text?: string }[]
      isError?: boolean
    }
    const text = (res.content ?? [])
      .map((c) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
      .join('\n')
      .trim()
    if (res.isError) throw new Error(text || 'The tool reported an error.')
    return text || '(no output)'
  }

  close(): void {
    const proc = this.proc
    this.proc = null
    this.ready = null
    this.failAll(new Error(`${this.config.name} disconnected.`))
    try {
      proc?.kill()
    } catch {
      /* already gone */
    }
  }
}
