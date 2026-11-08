import { z } from 'zod'
import { defineTool } from './types'

/** Only real web pages: http(s) with a host. Blocks file:, javascript:, and anything else. */
export function safeWebUrl(raw: string): URL | null {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url
  } catch {
    return null
  }
}

export const openWebsite = defineTool({
  name: 'open_website',
  label: 'Opening a website',
  description: "Open a web page in the user's default browser.",
  schema: z.object({
    url: z.string().min(3).max(500).describe('Full URL or a domain like "youtube.com"')
  }),
  async run({ url }, ctx) {
    const safe = safeWebUrl(url)
    if (!safe) return { content: `Not a web address: ${url}`, isError: true }
    await ctx.platform.openUrl(safe.toString())
    return { content: `Opened ${safe.hostname}.`, summary: `Opened ${safe.hostname}` }
  }
})

export const playMusic = defineTool({
  name: 'play_music',
  label: 'Finding music',
  description:
    'Search for a song, artist, podcast or playlist on YouTube or Spotify and open the results. You cannot press play inside those apps; tell the user the search is open.',
  schema: z.object({
    query: z
      .string()
      .min(1)
      .max(120)
      .describe('What to play, e.g. "lofi beats" or "Coldplay Yellow"'),
    service: z.enum(['youtube', 'spotify']).default('youtube')
  }),
  async run({ query, service }, ctx) {
    const url =
      service === 'spotify'
        ? `spotify:search:${encodeURIComponent(query)}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    await ctx.platform.openUrl(url)
    const where = service === 'spotify' ? 'Spotify' : 'YouTube'
    return {
      content: `Opened a ${where} search for "${query}".`,
      summary: `Searched ${where}: ${query}`
    }
  }
})

/** Blocks this computer and private networks, so a web page can't make Nova poke at your router or local apps. */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h === '::1' ||
    h === '0.0.0.0'
  )
    return false
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return !/^(fc|fd|fe80)/.test(h)
  const [a, b] = [Number(m[1]), Number(m[2])]
  return !(
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** Turns HTML into readable text: drops scripts, styles and tags, keeps the words. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const text = html
    .replace(/<(head|script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
  return { title, text }
}

export const readWebPage = defineTool({
  name: 'read_web_page',
  label: 'Reading a web page',
  description:
    'Download a public web page and read its text (first 6,000 characters). Use it to check facts on a page whose address you know. Works without any API key.',
  schema: z.object({ url: z.string().min(3).max(500) }),
  async run({ url }) {
    const safe = safeWebUrl(url)
    if (!safe || !isPublicHost(safe.hostname))
      return { content: 'Only public web pages can be read.', isError: true }
    const res = await fetch(safe, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Nova-Assistant/1.1 (+https://github.com/osamaayub/nova-assistant)' }
    })
    if (!res.ok)
      return {
        content: `The page answered ${res.status}.`,
        isError: true,
        summary: `Page error ${res.status}`
      }
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/.test(type))
      return {
        content: `That address is not a readable page (${type || 'unknown type'}).`,
        isError: true
      }
    const raw = (await res.text()).slice(0, 2_000_000)
    const { title, text } = /html/.test(type) ? htmlToText(raw) : { title: '', text: raw }
    return {
      content: `${title ? `Title: ${title}\n` : ''}Source: ${safe.href}\n\n${text.slice(0, 6000)}`,
      summary: `Read ${safe.hostname}`
    }
  }
})
