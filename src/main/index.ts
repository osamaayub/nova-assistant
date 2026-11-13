import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray
} from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../build/icon.ico?asset'
import type { AgentEvent, Settings } from '../shared/types'
import { characterOf } from './agent/prompt'
import { AgentService } from './agent/service'
import { RemoteManager } from './remote/manager'
import { fetchHeadlines } from './news'
import { McpManager } from './mcp/manager'
import { MemoryStore } from './memory/store'
import { createPlatform } from './platform'
import { listOllamaModels } from './agent/providers/ollama'
import { clearApiKey, getSettings, publicSettings, saveApiKey, saveSettings } from './settings/store'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let remote: RemoteManager | null = null

function createWindow(): BrowserWindow {
  // Big enough for the command center, but never bigger than the screen.
  const area = screen.getPrimaryDisplay().workAreaSize
  const w = new BrowserWindow({
    width: Math.min(1180, area.width - 32),
    height: Math.min(800, area.height - 32),
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: '#05070d',
    title: 'Nova',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  w.on('ready-to-show', () => w.show())
  // Closing hides Nova to the tray; it keeps listening for the wake word. Quit is in the tray menu.
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
  })
  // Links in replies open in the real browser, never inside Nova.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function applyAutostart(settings: Settings): void {
  if (process.platform === 'win32' || process.platform === 'darwin')
    app.setLoginItemSettings({ openAtLogin: settings.startWithWindows })
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open Nova', click: showWindow },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: getSettings().startWithWindows,
      click: (item) => {
        saveSettings({ startWithWindows: item.checked })
        applyAutostart(getSettings())
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Nova',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

function createTray(): void {
  // A bad icon must never take the app down with it.
  let img = nativeImage.createFromPath(trayIcon)
  if (img.isEmpty()) img = nativeImage.createFromPath(icon)
  if (img.isEmpty()) return
  tray = new Tray(img.resize({ width: 16, height: 16 }))
  tray.setToolTip('Nova')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', showWindow)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('dev.osamaayub.nova')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // Nova only ever needs the microphone (push to talk and the wake word). Everything else is refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const audioOnly =
      permission === 'media' &&
      (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === 'audio')
    callback(!!audioOnly)
  })

  const memory = await MemoryStore.open(
    join(app.getPath('userData'), 'nova-memory.sqlite'),
    require.resolve('sql.js/dist/sql-wasm.wasm')
  )
  const platform = createPlatform()
  // The phone link is created below, once the agent exists. Agent events also go to the phone.
  const emit = (e: AgentEvent): void => {
    win?.webContents.send('agent:event', e)
    remote?.broadcast(e)
  }
  platform.notify = ((original) => (title: string, body: string) => {
    original(title, body)
    emit({ type: 'notify', title, body })
  })(platform.notify)

  const mcp = new McpManager()
  mcp.sync(getSettings().mcpServers)
  const agent = new AgentService(platform, memory, emit, undefined, mcp)

  // A paired phone can do exactly what the window can: send, stop, start over, answer "Allow?".
  remote = new RemoteManager(
    {
      send: (text) => {
        const e: AgentEvent = { type: 'user', text, from: 'phone' }
        win?.webContents.send('agent:event', e)
        remote?.broadcast(e)
        void agent.send(text)
      },
      stop: () => agent.stop(),
      newChat: () => agent.newChat(),
      confirm: (id, approved) => agent.confirm(id, approved)
    },
    () => characterOf(getSettings()).name
  )
  await remote.sync(getSettings().remote)

  ipcMain.handle('agent:send', (_e, text: unknown) => {
    const t = String(text ?? '')
    remote?.broadcast({ type: 'user', text: t, from: 'window' })
    return agent.send(t)
  })
  ipcMain.handle('remote:info', () => remote!.info())
  ipcMain.handle('remote:reset', async () => {
    await remote!.reset()
    return remote!.info()
  })
  ipcMain.handle('agent:stop', () => agent.stop())
  ipcMain.handle('agent:new', () => agent.newChat())
  ipcMain.handle('agent:confirm', (_e, id: unknown, ok: unknown) =>
    agent.confirm(String(id), ok === true)
  )
  ipcMain.handle('settings:get', () => publicSettings())
  ipcMain.handle('settings:save', async (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch && typeof patch === 'object' ? patch : {})
    await remote?.sync(next.remote)
    try {
      applyAutostart(next)
    } catch {
      /* ignore */
    }
    mcp.sync(next.mcpServers)
    tray?.setContextMenu(buildTrayMenu())
    return publicSettings()
  })
  ipcMain.handle('settings:key', (_e, key: unknown) => {
    saveApiKey(String(key ?? ''))
    return publicSettings()
  })
  ipcMain.handle('settings:clearKey', () => {
    clearApiKey()
    return publicSettings()
  })
  ipcMain.handle('ollama:check', async (_e, url: unknown) => {
    try {
      return { ok: true, models: await listOllamaModels(String(url ?? '')) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        error: /fetch failed|ECONNREFUSED|timeout|aborted/i.test(msg)
          ? 'Ollama is not running at that address. Install it from ollama.com and open it.'
          : msg
      }
    }
  })
  ipcMain.handle('memory:list', () => memory.list())
  ipcMain.handle('memory:delete', (_e, id: unknown) => {
    memory.remove(Number(id))
    return memory.list()
  })
  ipcMain.handle('mcp:list', () => mcp.status())
  ipcMain.handle('mcp:reconnect', () => mcp.reconnect())
  ipcMain.handle('window:show', showWindow)
  ipcMain.handle('news:headlines', () => fetchHeadlines())
  ipcMain.handle('shell:open', (_e, url: unknown) => {
    const u = String(url ?? '')
    if (!/^https?:\/\//.test(u)) return
    return shell.openExternal(u)
  })

  win = createWindow()
  try {
    createTray()
  } catch {
    tray = null // no tray is better than no app
  }
  try {
    applyAutostart(getSettings())
  } catch {
    /* autostart is a nicety, not a requirement */
  }

  // Alt+Space shows or hides Nova from anywhere.
  globalShortcut.register('Alt+Space', () => {
    if (!win) return
    if (win.isVisible() && win.isFocused()) win.hide()
    else showWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
    else showWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  remote?.close()
  tray?.destroy()
})
app.on('window-all-closed', () => {
  // The close button hides to the tray instead, so this only runs on a real quit.
  if (process.platform !== 'darwin') app.quit()
})
