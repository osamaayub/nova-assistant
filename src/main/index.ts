import { app, BrowserWindow, globalShortcut, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { AgentEvent, Settings } from '../shared/types'
import { AgentService } from './agent/service'
import { MemoryStore } from './memory/store'
import { createPlatform } from './platform'
import { clearApiKey, publicSettings, saveApiKey, saveSettings } from './settings/store'

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 460,
    height: 760,
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('dev.osamaayub.nova')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // Nova only ever needs the microphone (push to talk). Everything else is refused.
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
  const emit = (e: AgentEvent): void => win?.webContents.send('agent:event', e)
  platform.notify = ((original) => (title: string, body: string) => {
    original(title, body)
    emit({ type: 'notify', title, body })
  })(platform.notify)
  const agent = new AgentService(platform, memory, emit)

  ipcMain.handle('agent:send', (_e, text: unknown) => agent.send(String(text ?? '')))
  ipcMain.handle('agent:stop', () => agent.stop())
  ipcMain.handle('agent:new', () => agent.newChat())
  ipcMain.handle('agent:confirm', (_e, id: unknown, ok: unknown) =>
    agent.confirm(String(id), ok === true)
  )
  ipcMain.handle('settings:get', () => publicSettings())
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    saveSettings(patch && typeof patch === 'object' ? patch : {})
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
  ipcMain.handle('memory:list', () => memory.list())
  ipcMain.handle('memory:delete', (_e, id: unknown) => {
    memory.remove(Number(id))
    return memory.list()
  })

  win = createWindow()

  // Alt+Space shows or hides Nova from anywhere.
  globalShortcut.register('Alt+Space', () => {
    if (!win) return
    if (win.isVisible() && win.isFocused()) win.hide()
    else {
      win.show()
      win.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
