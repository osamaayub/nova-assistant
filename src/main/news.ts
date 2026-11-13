/**
 * Top headlines for the World Monitor, from public RSS feeds. No key, no account.
 * Feeds are plain XML; we pull <item> titles and links out with a small parser.
 */

import type { Headline } from '../shared/types'

const FEEDS: { url: string; source: string }[] = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
  { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR' },
  { url: 'https://www.theguardian.com/world/rss', source: 'The Guardian' }
]

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' '
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      const key = e.toLowerCase()
      if (key in ENTITIES) return ENTITIES[key]
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10))
      return m
    })
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(item: string, name: string): string {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}

/** Pulls items out of one RSS/Atom-ish XML document. Exported for tests. */
export function parseRss(xml: string, source: string, limit = 10): Headline[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const out: Headline[] = []
  for (const raw of items) {
    const title = tag(raw, 'title')
    const link = tag(raw, 'link') || (raw.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '')
    if (!title || !/^https?:\/\//.test(link)) continue
    const date = tag(raw, 'pubDate') || tag(raw, 'published') || tag(raw, 'updated')
    const at = date ? Date.parse(date) : NaN
    out.push({ title: title.slice(0, 300), url: link, source, at: Number.isNaN(at) ? null : at })
    if (out.length >= limit) break
  }
  return out
}

async function fetchFeed(feed: { url: string; source: string }): Promise<Headline[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Nova-Assistant/1.2 (+https://github.com/osamaayub/nova-assistant)' }
  })
  if (!res.ok) return []
  const type = res.headers.get('content-type') ?? ''
  if (!/xml|rss|text/.test(type) && !res.url.includes('rss')) return []
  return parseRss((await res.text()).slice(0, 1_000_000), feed.source)
}

/** Merges the feeds, newest first, deduped by title. Never throws: a dead feed just contributes nothing. */
export async function fetchHeadlines(): Promise<Headline[]> {
  const feeds = await Promise.allSettled(FEEDS.map(fetchFeed))
  const seen = new Set<string>()
  const all = feeds
    .flatMap((f) => (f.status === 'fulfilled' ? f.value : []))
    .filter((h) => {
      const key = h.title.toLowerCase().slice(0, 80)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  all.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
  return all.slice(0, 15)
}
