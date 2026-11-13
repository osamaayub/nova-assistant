import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AgentEvent } from '../../shared/types'
import { phonePage } from './page'

/** What a paired phone is allowed to do. It maps one to one onto the desktop window's own calls. */
export interface RemoteHandlers {
  send(text: string): void
  stop(): void
  newChat(): void
  confirm(id: string, approved: boolean): void
}

export const REMOTE_PORT = 47821
const MAX_BODY = 8 * 1024
const MAX_PHONES = 5
const MAX_FAILS = 10
const FAIL_WINDOW_MS = 10 * 60_000

/** True for addresses on this computer or the home network. Anything else is refused. */
export function isPrivateAddress(raw: string): boolean {
  const a = raw.replace(/^::ffff:/i, '').toLowerCase()
  if (a === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/.test(a) || a.startsWith('fe80:')) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a)
  if (!m) return false
  const [x, y] = [Number(m[1]), Number(m[2])]
  return (
    x === 10 ||
    x === 127 ||
    (x === 192 && y === 168) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 169 && y === 254)
  )
}

/** Guards against DNS rebinding: the Host header must be a local name or a private IP. */
export function isAllowedHost(header: string | undefined): boolean {
  if (!header) return false
  const host = header
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
  return host === 'localhost' || host.endsWith('.local') || isPrivateAddress(host)
}

export function newToken(): string {
  return randomBytes(24).toString('base64url')
}

const digest = (s: string): Buffer => createHash('sha256').update(s).digest()

/**
 * A tiny web server for the phone. It only answers on the home network, only to a phone that
 * holds the secret pairing token, and only accepts the four actions in RemoteHandlers.
 */
export class RemoteServer {
  private server: Server | null = null
  private clients = new Set<ServerResponse>()
  private tokenDigest: Buffer
  private fails = new Map<string, { n: number; since: number }>()
  private beat: ReturnType<typeof setInterval> | null = null

  constructor(
    private handlers: RemoteHandlers,
    token: string,
    private assistantName: () => string = () => 'Nova',
    /** With a certificate the page is served over https, which phones need to allow the microphone. */
    private tls?: { key: string; cert: string }
  ) {
    this.tokenDigest = digest(token)
  }

  get phones(): number {
    return this.clients.size
  }

  get listening(): boolean {
    return !!this.server
  }

  /** A new token disconnects every phone that paired with the old one. */
  setToken(token: string): void {
    this.tokenDigest = digest(token)
    this.disconnectAll()
  }

  listen(port = REMOTE_PORT, host = '0.0.0.0'): Promise<number> {
    return new Promise((resolve, reject) => {
      const onRequest = (req: IncomingMessage, res: ServerResponse): void => this.handle(req, res)
      const server = this.tls ? createSecureServer(this.tls, onRequest) : createServer(onRequest)
      server.once('error', reject)
      server.listen(port, host, () => {
        server.removeListener('error', reject)
        this.server = server
        this.beat = setInterval(() => this.clients.forEach((c) => c.write(': ping\n\n')), 20_000)
        const addr = server.address()
        resolve(typeof addr === 'object' && addr ? addr.port : port)
      })
    })
  }

  close(): void {
    if (this.beat) clearInterval(this.beat)
    this.beat = null
    this.disconnectAll()
    this.server?.close()
    this.server = null
  }

  broadcast(event: AgentEvent): void {
    const line = `data: ${JSON.stringify(event)}\n\n`
    this.clients.forEach((c) => c.write(line))
  }

  private disconnectAll(): void {
    this.clients.forEach((c) => c.end())
    this.clients.clear()
  }

  private authorized(req: IncomingMessage): boolean {
    const m = /^Bearer (.{1,200})$/.exec(req.headers.authorization ?? '')
    return !!m && timingSafeEqual(digest(m[1]), this.tokenDigest)
  }

  private tooManyFails(ip: string): boolean {
    const f = this.fails.get(ip)
    if (!f) return false
    if (Date.now() - f.since > FAIL_WINDOW_MS) {
      this.fails.delete(ip)
      return false
    }
    return f.n >= MAX_FAILS
  }

  private noteFail(ip: string): void {
    const f = this.fails.get(ip)
    if (!f || Date.now() - f.since > FAIL_WINDOW_MS) this.fails.set(ip, { n: 1, since: Date.now() })
    else f.n += 1
  }

  private reply(
    res: ServerResponse,
    status: number,
    body: string,
    type = 'application/json'
  ): void {
    res.writeHead(status, {
      'Content-Type': `${type}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    })
    res.end(body)
  }

  private json(res: ServerResponse, status: number, obj: unknown): void {
    this.reply(res, status, JSON.stringify(obj))
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const ip = req.socket.remoteAddress ?? ''
    if (!isPrivateAddress(ip) || !isAllowedHost(req.headers.host))
      return this.json(res, 403, { error: 'Not allowed' })
    const path = (req.url ?? '/').split('?')[0]

    if (req.method === 'GET' && path === '/') {
      const nonce = randomBytes(16).toString('base64')
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      )
      return this.reply(res, 200, phonePage(nonce), 'text/html')
    }
    if (!path.startsWith('/api/')) return this.json(res, 404, { error: 'Not found' })

    if (this.tooManyFails(ip)) return this.json(res, 429, { error: 'Too many wrong codes' })
    if (!this.authorized(req)) {
      this.noteFail(ip)
      return this.json(res, 401, { error: 'Pair this phone again' })
    }

    if (req.method === 'GET' && path === '/api/events') {
      if (this.clients.size >= MAX_PHONES) return this.json(res, 429, { error: 'Too many phones' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff'
      })
      res.write(`data: ${JSON.stringify({ type: 'hello', name: this.assistantName() })}\n\n`)
      this.clients.add(res)
      req.on('close', () => this.clients.delete(res))
      return
    }

    if (req.method !== 'POST') return this.json(res, 405, { error: 'Use POST' })
    if (!/^application\/json/i.test(req.headers['content-type'] ?? ''))
      return this.json(res, 415, { error: 'Send JSON' })

    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        this.json(res, 413, { error: 'Too big' })
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      let body: Record<string, unknown>
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      } catch {
        return this.json(res, 400, { error: 'Bad JSON' })
      }
      switch (path) {
        case '/api/send': {
          const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : ''
          if (!text) return this.json(res, 400, { error: 'Say something first' })
          this.handlers.send(text)
          return this.json(res, 200, { ok: true })
        }
        case '/api/stop':
          this.handlers.stop()
          return this.json(res, 200, { ok: true })
        case '/api/new':
          this.handlers.newChat()
          return this.json(res, 200, { ok: true })
        case '/api/confirm':
          if (typeof body.id !== 'string') return this.json(res, 400, { error: 'Missing id' })
          this.handlers.confirm(body.id, body.approved === true)
          return this.json(res, 200, { ok: true })
        default:
          return this.json(res, 404, { error: 'Not found' })
      }
    })
  }
}
