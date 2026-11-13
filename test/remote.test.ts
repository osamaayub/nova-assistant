import { X509Certificate } from 'node:crypto'
import { request } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isAllowedHost,
  isPrivateAddress,
  newToken,
  RemoteServer,
  type RemoteHandlers
} from '../src/main/remote/server'
import { certStillGood, makeCert } from '../src/main/remote/cert'
import { phonePage } from '../src/main/remote/page'

const TOKEN = newToken()
let server: RemoteServer | null = null

async function start(): Promise<{ base: string; h: RemoteHandlers; s: RemoteServer }> {
  const h: RemoteHandlers = { send: vi.fn(), stop: vi.fn(), newChat: vi.fn(), confirm: vi.fn() }
  const s = new RemoteServer(h, TOKEN, () => 'Jarvis')
  const port = await s.listen(0, '127.0.0.1')
  server = s
  return { base: `http://127.0.0.1:${port}`, h, s }
}

afterEach(() => {
  server?.close()
  server = null
})

const auth = (t = TOKEN): Record<string, string> => ({
  Authorization: `Bearer ${t}`,
  'Content-Type': 'application/json'
})
const post = (base: string, path: string, body: unknown, headers = auth()): Promise<Response> =>
  fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) })

describe('phone link: who may connect', () => {
  it('accepts only this computer and the home network', () => {
    for (const ok of [
      '127.0.0.1',
      '192.168.1.20',
      '10.0.0.5',
      '172.16.4.2',
      '172.31.0.1',
      '::1',
      '::ffff:192.168.0.9',
      'fd12::1'
    ])
      expect(isPrivateAddress(ok), ok).toBe(true)
    for (const bad of [
      '8.8.8.8',
      '172.32.0.1',
      '172.15.0.1',
      '203.0.113.7',
      '2001:db8::1',
      'evil.com',
      ''
    ])
      expect(isPrivateAddress(bad), bad).toBe(false)
  })

  it('refuses other host names, which blocks DNS rebinding', () => {
    expect(isAllowedHost('192.168.1.20:47821')).toBe(true)
    expect(isAllowedHost('localhost:47821')).toBe(true)
    expect(isAllowedHost('my-pc.local:47821')).toBe(true)
    expect(isAllowedHost('evil.example.com')).toBe(false)
    expect(isAllowedHost('8.8.8.8:47821')).toBe(false)
    expect(isAllowedHost(undefined)).toBe(false)
  })

  it('answers a wrong Host header with 403', async () => {
    const { base } = await start()
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(base + '/', { headers: { Host: 'evil.example.com' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })
})

describe('phone link: pairing and actions', () => {
  it('serves the page without the token and with a strict CSP', async () => {
    const { base } = await start()
    const res = await fetch(base + '/')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('<title>Nova</title>')
    expect(html).not.toContain(TOKEN)
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    const nonce = /nonce-([^']+)'/.exec(csp)?.[1] ?? ''
    expect(nonce.length).toBeGreaterThan(10)
    expect(html).toContain(`nonce="${nonce}"`)
  })

  it('never writes model text as HTML on the phone', () => {
    expect(phonePage('n')).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/)
  })

  it('rejects a missing or wrong code', async () => {
    const { base, h } = await start()
    expect((await fetch(base + '/api/events')).status).toBe(401)
    expect((await post(base, '/api/send', { text: 'hi' }, auth('nope'))).status).toBe(401)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('blocks guessing: after 10 wrong codes even the right one waits', async () => {
    const { base } = await start()
    for (let i = 0; i < 10; i++) await post(base, '/api/send', { text: 'x' }, auth('wrong' + i))
    expect((await post(base, '/api/send', { text: 'hi' })).status).toBe(429)
  })

  it('passes send, stop, new chat and confirm to Nova', async () => {
    const { base, h } = await start()
    expect((await post(base, '/api/send', { text: '  play lofi  ' })).status).toBe(200)
    expect(h.send).toHaveBeenCalledWith('play lofi')
    await post(base, '/api/stop', {})
    await post(base, '/api/new', {})
    await post(base, '/api/confirm', { id: 'abc', approved: true })
    await post(base, '/api/confirm', { id: 'def', approved: 'yes' })
    expect(h.stop).toHaveBeenCalled()
    expect(h.newChat).toHaveBeenCalled()
    expect(h.confirm).toHaveBeenNthCalledWith(1, 'abc', true)
    // Only a real true counts as Allow.
    expect(h.confirm).toHaveBeenNthCalledWith(2, 'def', false)
  })

  it('rejects empty messages, wrong content types, odd paths and huge bodies', async () => {
    const { base, h } = await start()
    expect((await post(base, '/api/send', { text: '   ' })).status).toBe(400)
    expect((await post(base, '/api/send', { text: 5 })).status).toBe(400)
    expect((await post(base, '/api/confirm', {})).status).toBe(400)
    const plain = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'text/plain' }
    expect((await post(base, '/api/send', { text: 'hi' }, plain)).status).toBe(415)
    expect((await post(base, '/api/delete_everything', {})).status).toBe(404)
    expect((await fetch(base + '/secret')).status).toBe(404)
    const big = await post(base, '/api/send', { text: 'a'.repeat(20_000) }).catch(() => null)
    if (big) expect(big.status).toBe(413)
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('phone link: live events', () => {
  async function open(
    base: string
  ): Promise<{ next: () => Promise<unknown>; done: Promise<void> }> {
    const res = await fetch(base + '/api/events', { headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let ended!: () => void
    const done = new Promise<void>((r) => (ended = r))
    return {
      done,
      next: async () => {
        for (;;) {
          const i = buf.indexOf('\n\n')
          if (i >= 0) {
            const chunk = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const line = chunk.split('\n').find((l) => l.startsWith('data:'))
            if (line) return JSON.parse(line.slice(5))
            continue
          }
          const { value, done: fin } = await reader.read()
          if (fin) {
            ended()
            return null
          }
          buf += dec.decode(value, { stream: true })
        }
      }
    }
  }

  it('greets the phone with the character name, then streams agent events', async () => {
    const { base, s } = await start()
    const feed = await open(base)
    expect(await feed.next()).toEqual({ type: 'hello', name: 'Jarvis' })
    expect(s.phones).toBe(1)
    s.broadcast({ type: 'text', turnId: 't', delta: 'Opening it.' })
    expect(await feed.next()).toEqual({ type: 'text', turnId: 't', delta: 'Opening it.' })
    s.broadcast({ type: 'confirm', turnId: 't', id: 'c1', title: 'Move files?', detail: '3 files' })
    expect(await feed.next()).toMatchObject({ type: 'confirm', id: 'c1' })
  })

  it('disconnects every phone when the pairing code is replaced', async () => {
    const { base, s } = await start()
    const feed = await open(base)
    await feed.next()
    s.setToken(newToken())
    expect(await feed.next()).toBeNull()
    await feed.done
    expect(s.phones).toBe(0)
    // The old code no longer works.
    expect((await post(base, '/api/stop', {})).status).toBe(401)
  })
})

describe('phone voice over https', () => {
  it('makes a certificate that covers the Wi-Fi address, and renews it when the address changes', async () => {
    const c = await makeCert(['192.168.1.20'])
    const x = new X509Certificate(c.cert)
    expect(x.subjectAltName).toContain('IP Address:192.168.1.20')
    expect(x.subjectAltName).toContain('DNS:localhost')
    expect(x.checkIP('192.168.1.20')).toBe('192.168.1.20')
    expect(c.key).toContain('PRIVATE KEY')
    expect(certStillGood(c, '192.168.1.20')).toBe(true)
    expect(certStillGood(c, '192.168.1.99')).toBe(false)
    expect(certStillGood(c, '192.168.1.20', Date.now() + 340 * 86_400_000)).toBe(false)
    expect(certStillGood(null, '192.168.1.20')).toBe(false)
  })

  it('serves the page and the API over https, with the same checks', async () => {
    const c = await makeCert([])
    const h: RemoteHandlers = { send: vi.fn(), stop: vi.fn(), newChat: vi.fn(), confirm: vi.fn() }
    const s = new RemoteServer(h, TOKEN, () => 'Jarvis', { key: c.key, cert: c.cert })
    const port = await s.listen(0, '127.0.0.1')
    server = s
    const get = (
      path: string,
      headers: Record<string, string> = {}
    ): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const req = httpsRequest(
          { host: '127.0.0.1', port, path, headers, rejectUnauthorized: false },
          (res) => {
            let body = ''
            res.on('data', (d) => (body += d))
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
          }
        )
        req.on('error', reject)
        req.end()
      })
    const page = await get('/')
    expect(page.status).toBe(200)
    expect(page.body).toContain('id="call"')
    expect((await get('/api/events')).status).toBe(401)
    // A plain http request to the https port never reaches the page.
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })

  it('only offers the microphone on a secure page, and never writes speech as HTML', () => {
    const html = phonePage('n')
    expect(html).toContain('window.isSecureContext')
    expect(html).toContain('webkitSpeechRecognition')
    expect(html).toContain('if(!canTalk){micBtn.hidden=true;callBtn.hidden=true}')
    expect(html).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/)
    // Call mode listens again after the spoken reply, and not while Nova is still talking.
    expect(html).toContain('function afterSpeech(){if(calling&&!busy)startListening()}')
    expect(html).toContain('speaking())return')
  })
})
