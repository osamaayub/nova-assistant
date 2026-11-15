import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { get } from 'node:https'
import { join } from 'node:path'

/**
 * Cloudflare quick tunnel: exposes the local phone server on a random
 * https://*.trycloudflare.com address. No account, no open ports on the router.
 * The binary is downloaded once into the app's data folder.
 */

const EXE_NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
const DOWNLOAD =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

/** Downloads cloudflared once, then returns the path to the exe. */
export async function ensureCloudflared(dir: string): Promise<string> {
  const exe = join(dir, 'bin', EXE_NAME)
  if (existsSync(exe)) return exe
  mkdirSync(join(dir, 'bin'), { recursive: true })
  const tmp = `${exe}.download`
  const download = (url: string): Promise<void> =>
    new Promise((resolve, reject) => {
      get(url, (res) => {
        const loc = res.headers.location
        if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400 && loc) {
          res.resume()
          download(loc).then(resolve, reject)
          return
        }
        if ((res.statusCode ?? 0) !== 200) {
          res.resume()
          reject(new Error(`Download failed (${res.statusCode})`))
          return
        }
        const out = createWriteStream(tmp)
        res.pipe(out)
        out.on('finish', resolve)
        out.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    })
  await download(DOWNLOAD)
  const { renameSync } = await import('node:fs')
  renameSync(tmp, exe)
  return exe
}

export class Tunnel {
  private proc: ChildProcess | null = null
  private publicUrl: string | null = null
  private exited = false

  constructor(
    /** Plain http address on this PC the tunnel forwards to, e.g. http://127.0.0.1:47822 */
    private target: string,
    private onExit: () => void = () => undefined
  ) {}

  get url(): string | null {
    return this.publicUrl
  }

  /** Starts cloudflared and resolves with the public https URL once it is known. */
  async start(exe: string): Promise<string> {
    this.stop()
    this.exited = false
    this.proc = spawn(exe, ['tunnel', '--url', this.target, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    const found = await new Promise<string>((resolve, reject) => {
      let buf = ''
      const timer = setTimeout(() => reject(new Error('Tunnel took too long to start.')), 30_000)
      const watch = (chunk: Buffer): void => {
        buf += chunk.toString()
        const m = URL_RE.exec(buf)
        if (m) {
          clearTimeout(timer)
          resolve(m[0])
        }
      }
      this.proc?.stdout?.on('data', watch)
      this.proc?.stderr?.on('data', watch)
      this.proc?.on('exit', () => {
        clearTimeout(timer)
        reject(new Error('cloudflared exited before the tunnel was ready.'))
      })
      this.proc?.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
    })
    this.proc.on('exit', () => {
      this.exited = true
      this.publicUrl = null
      this.onExit()
    })
    this.publicUrl = found
    return found
  }

  stop(): void {
    const p = this.proc
    this.proc = null
    this.publicUrl = null
    if (p && !this.exited) {
      try {
        p.kill()
      } catch {
        /* already gone */
      }
    }
  }
}
