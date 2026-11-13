import { app, Notification, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import type { Platform } from './agent/tools/types'
import { WHATSAPP_ENTER_SCRIPT } from './whatsappKey'

/** The real Windows (or dev machine) implementation of what tools may do. */
export function createPlatform(): Platform {
  return {
    os: process.platform,
    folders: {
      home: app.getPath('home'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads'),
      pictures: app.getPath('pictures'),
      music: app.getPath('music'),
      videos: app.getPath('videos')
    },
    openUrl: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    launch: (command) =>
      new Promise((resolve, reject) => {
        if (process.platform !== 'win32')
          return reject(new Error('Launching programs only works on Windows.'))
        // "start" finds programs registered with Windows (chrome, winword...). The command comes from Nova's fixed list.
        const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', command], {
          windowsHide: true,
          detached: true,
          stdio: 'ignore'
        })
        child.on('error', reject)
        child.unref()
        resolve()
      }),
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    },
    pressEnter: (target) =>
      new Promise((resolve) => {
        if (process.platform !== 'win32' || target !== 'whatsapp') return resolve(false)
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            WHATSAPP_ENTER_SCRIPT
          ],
          { windowsHide: true, timeout: 15_000 },
          (err) => resolve(!err)
        )
      }),
    closeProcess: (image) =>
      new Promise((resolve) => {
        if (process.platform !== 'win32') return resolve('failed')
        // No /F: this asks the program to close, so it can still offer to save your work.
        execFile('taskkill', ['/IM', image], { windowsHide: true }, (err, _out, stderr) => {
          if (!err) return resolve('closed')
          // taskkill answers 128 when no process has that name.
          const code = Number((err as { code?: unknown }).code)
          resolve(code === 128 || /not found/i.test(String(stderr)) ? 'not-running' : 'failed')
        })
      })
  }
}
