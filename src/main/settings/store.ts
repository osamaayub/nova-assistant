import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PublicSettings, Settings } from '../../shared/types'
import { cleanSettings } from './defaults'

const dir = (): string => app.getPath('userData')
const settingsFile = (): string => join(dir(), 'settings.json')
const keyFile = (): string => join(dir(), 'api-key.bin')

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = cleanSettings(
      existsSync(settingsFile()) ? JSON.parse(readFileSync(settingsFile(), 'utf8')) : {}
    )
  } catch {
    cache = cleanSettings({})
  }
  return cache
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cache = cleanSettings({ ...getSettings(), ...patch })
  mkdirSync(dir(), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(cache, null, 2))
  return cache
}

/** The Claude API key is encrypted with the operating system (Windows DPAPI) and never sent to the window. */
export function saveApiKey(key: string): void {
  const clean = key.trim()
  if (!/^sk-ant-[\w-]{20,}$/.test(clean))
    throw new Error('That does not look like a Claude API key (it starts with sk-ant-).')
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure storage is not available on this computer, so the key was not saved.')
  mkdirSync(dir(), { recursive: true })
  writeFileSync(keyFile(), safeStorage.encryptString(clean))
}

export function readApiKey(): string | null {
  try {
    if (!existsSync(keyFile()) || !safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(readFileSync(keyFile()))
  } catch {
    return null
  }
}

export function clearApiKey(): void {
  rmSync(keyFile(), { force: true })
}

export function publicSettings(): PublicSettings {
  return {
    ...getSettings(),
    hasApiKey: !!readApiKey(),
    keyStorage: safeStorage.isEncryptionAvailable() ? 'encrypted' : 'unavailable'
  }
}
