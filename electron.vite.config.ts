import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The web build on Vercel chats with a local Ollama straight from the page, so its CSP must
 * allow connections to localhost. The desktop app keeps the strict CSP: its chat runs in the
 * main process, not the window.
 */
function webOllamaCsp(): Plugin {
  return {
    name: 'nova-web-ollama-csp',
    transformIndexHtml(html): string {
      if (!process.env.VERCEL) return html
      return html.replace('connect-src ', 'connect-src http://127.0.0.1:* http://localhost:* ')
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), webOllamaCsp()],
    // Whisper and Kokoro run in module workers (they use import.meta).
    worker: { format: 'es' }
  }
})
