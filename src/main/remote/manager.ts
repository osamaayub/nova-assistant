import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import QRCode from 'qrcode'
import type { AgentEvent, RemoteInfo } from '../../shared/types'
import { isPrivateAddress, newToken, REMOTE_PORT, RemoteServer, type RemoteHandlers } from './server'

const tokenFile = (): string => join(app.getPath('userData'), 'remote-token.bin')

/** The pairing token is encrypted with Windows, like the Claude key. No encryption, no phone link. */
function loadToken(create: boolean): string {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure storage is not available on this computer, so the phone link is off.')
  try {
    if (!create && existsSync(tokenFile()))
      return safeStorage.decryptString(readFileSync(tokenFile()))
  } catch {
    /* unreadable token: make a new one below */
  }
  const token = newToken()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tokenFile(), safeStorage.encryptString(token))
  return token
}

/** This PC's address on the home network, e.g. 192.168.1.20. Null when there is no network. */
export function lanAddress(): string | null {
  const found: string[] = []
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? [])
      if (i.family === 'IPv4' && !i.internal && isPrivateAddress(i.address)) found.push(i.address)
  return found.find((a) => a.startsWith('192.168.')) ?? found[0] ?? null
}

/** Starts and stops the phone link to match the setting, and describes it for the Settings panel. */
export class RemoteManager {
  private server: RemoteServer | null = null
  private error = ''

  constructor(
    private handlers: RemoteHandlers,
    private assistantName: () => string
  ) {}

  broadcast(e: AgentEvent): void {
    this.server?.broadcast(e)
  }

  async sync(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.server?.close()
      this.server = null
      this.error = ''
      return
    }
    if (this.server?.listening) return
    try {
      const server = new RemoteServer(this.handlers, loadToken(false), this.assistantName)
      await server.listen(REMOTE_PORT)
      this.server = server
      this.error = ''
    } catch (e) {
      this.server = null
      const msg = e instanceof Error ? e.message : ''
      this.error = /EADDRINUSE/.test(msg)
        ? 'The phone link port is already in use. Close other copies of Nova and try again.'
        : msg || 'The phone link could not start.'
    }
  }

  async reset(): Promise<void> {
    if (!this.server) return
    this.server.setToken(loadToken(true))
  }

  async info(): Promise<RemoteInfo> {
    if (!this.server) return { enabled: false, url: null, qr: null, phones: 0, error: this.error || undefined }
    const ip = lanAddress()
    if (!ip)
      return {
        enabled: true,
        url: null,
        qr: null,
        phones: this.server.phones,
        error: 'No Wi-Fi or network found. Connect this PC to your home network.'
      }
    // The token sits after "#" so it is never sent to any server or written in a log.
    const url = `http://${ip}:${REMOTE_PORT}/#t=${loadToken(false)}`
    return {
      enabled: true,
      url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#04121c', light: '#e7ecf5' } }),
      phones: this.server.phones
    }
  }

  close(): void {
    this.server?.close()
    this.server = null
  }
}
