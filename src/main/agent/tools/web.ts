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
