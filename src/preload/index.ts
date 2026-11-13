import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, NovaApi } from '../shared/types'

/** The only things the window can ask the main process to do. No raw ipcRenderer is exposed. */
const api: NovaApi = {
  send: (text) => ipcRenderer.invoke('agent:send', text),
  stop: () => ipcRenderer.invoke('agent:stop'),
  newChat: () => ipcRenderer.invoke('agent:new'),
  confirm: (id, approved) => ipcRenderer.invoke('agent:confirm', id, approved),
  onEvent: (listener) => {
    const handler = (_e: unknown, event: AgentEvent): void => listener(event)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  saveApiKey: (key) => ipcRenderer.invoke('settings:key', key),
  clearApiKey: () => ipcRenderer.invoke('settings:clearKey'),
  listFacts: () => ipcRenderer.invoke('memory:list'),
  deleteFact: (id) => ipcRenderer.invoke('memory:delete', id),
  checkOllama: (url) => ipcRenderer.invoke('ollama:check', url),
  listMcp: () => ipcRenderer.invoke('mcp:list'),
  reconnectMcp: () => ipcRenderer.invoke('mcp:reconnect'),
  remoteInfo: () => ipcRenderer.invoke('remote:info'),
  remoteReset: () => ipcRenderer.invoke('remote:reset'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  headlines: () => ipcRenderer.invoke('news:headlines'),
  openLink: (url) => ipcRenderer.invoke('shell:open', url),
  platform: process.platform
}

contextBridge.exposeInMainWorld('nova', api)
