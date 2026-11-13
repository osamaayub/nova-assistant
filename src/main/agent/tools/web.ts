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

/**
 * Finds the first real video for a search on YouTube, so a song can start playing straight away.
 * Returns the 11 character video id, or null when YouTube did not answer in a readable way
 * (offline, or a consent page), in which case the caller opens the plain search instead.
 */
export async function findYouTubeVideo(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`,
      {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nova-Assistant/1.2',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }
    )
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 3_000_000)
    // The first "videoRenderer" is the top video result (ads and shorts use other names).
    return /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/.exec(html)?.[1] ?? null
  } catch {
    return null
  }
}

export const playMusic = defineTool({
  name: 'play_music',
  label: 'Finding music',
  description:
    'Play a song, artist or video on YouTube: it opens the top result and it starts playing. For Spotify it only opens the search, because you cannot press play inside that app; say so.',
  schema: z.object({
    query: z
      .string()
      .min(1)
      .max(120)
      .describe('What to play, e.g. "lofi beats" or "Coldplay Yellow"'),
    service: z.enum(['youtube', 'spotify']).default('youtube')
  }),
  async run({ query, service }, ctx) {
    if (service === 'spotify') {
      await ctx.platform.openUrl(`spotify:search:${encodeURIComponent(query)}`)
      return {
        content: `Opened a Spotify search for "${query}". Press play there.`,
        summary: `Searched Spotify: ${query}`
      }
    }
    const id = await findYouTubeVideo(query, ctx.fetch)
    if (id) {
      await ctx.platform.openUrl(`https://www.youtube.com/watch?v=${id}`)
      return {
        content: `Opened the top YouTube result for "${query}". It should start playing.`,
        summary: `Playing on YouTube: ${query}`
      }
    }
    await ctx.platform.openUrl(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    )
    return {
      content: `Could not pick a video, so opened a YouTube search for "${query}". The user must pick one.`,
      summary: `Searched YouTube: ${query}`
    }
  }
})

/** A phone number in international digits, or null. Accepts "+92 300 1234567", "0092-300-1234567". */
export function cleanPhone(raw: string): string | null {
  const digits = raw
    .trim()
    .replace(/^00/, '+')
    .replace(/[\s().-]/g, '')
  return /^\+?[1-9]\d{6,14}$/.test(digits) ? digits.replace('+', '') : null
}

export const whatsappMessage = defineTool({
  name: 'whatsapp_message',
  label: 'Sending a WhatsApp message',
  description:
    "Send a WhatsApp message from the user's PC. After the user approves, it opens the chat in WhatsApp Desktop with the message typed in and presses Send. If WhatsApp Desktop is not in front in time, the chat is left ready and the user must press Send; the result says which happened. Needs the contact's phone number with country code; if you do not know it, ask the user (or use one they told you before).",
  schema: z.object({
    phone: z
      .string()
      .min(7)
      .max(25)
      .describe('Phone number with country code, e.g. +92 300 1234567'),
    message: z.string().min(1).max(500)
  }),
  async run({ phone, message }, ctx) {
    const digits = cleanPhone(phone)
    if (!digits)
      return {
        content:
          'That does not look like a phone number with a country code, for example +92 300 1234567.',
        isError: true,
        summary: 'Bad phone number'
      }
    const ok = await ctx.confirm(
      `Send this WhatsApp message to +${digits}?`,
      `Message:
${message}

Nova will open WhatsApp, type this in and press Send.`
    )
    if (!ok) return { content: 'The user declined, so nothing was sent.', summary: 'Cancelled' }
    const text = encodeURIComponent(message)
    try {
      await ctx.platform.openUrl(`whatsapp://send?phone=${digits}&text=${text}`)
    } catch {
      // WhatsApp Desktop is not installed: use the web link, which the user finishes by hand.
      await ctx.platform.openUrl(`https://wa.me/${digits}?text=${text}`)
      return {
        content:
          'WhatsApp Desktop is not installed, so the chat opened in the browser with the message typed in. It was NOT sent: the user must press Send.',
        summary: 'Chat ready, not sent'
      }
    }
    if (await ctx.platform.pressEnter('whatsapp'))
      return { content: `Sent the message to +${digits}.`, summary: 'WhatsApp message sent' }
    return {
      content:
        'The chat is open with the message typed in, but Nova could not confirm WhatsApp was in front, so it did NOT press Send. The user must press Send.',
      summary: 'Chat ready, not sent'
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
