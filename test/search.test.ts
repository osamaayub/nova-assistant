import { describe, expect, it } from 'vitest'
import { withSearchSetting } from '../src/main/agent/service-helpers'
import type { ToolContext } from '../src/main/agent/tools/types'
import { parseSearchResults, realResultUrl, webSearch } from '../src/main/agent/tools/web'
import { fakePlatform, memory } from './helpers'

const link = (url: string): string =>
  `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc123`

/** Mirrors the real page structure: one block per result, ads marked, snippet after the title. */
const block = (
  url: string,
  title: string,
  snippet: string,
  cls = 'result results_links'
): string => `
<div class="${cls} web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="${link(url)}">${title}</a>
    </h2>
    <div class="result__extras"><a class="result__url" href="${link(url)}">x</a></div>
    <a class="result__snippet" href="${link(url)}">${snippet}</a>
  </div>
</div>`

const PAGE = `<html><body>
${block('https://en.wikipedia.org/wiki/Prime_Minister_of_Pakistan', 'Prime Minister of Pakistan - <b>Wikipedia</b>', 'The prime minister is the <b>head</b> of government &amp; chief executive.')}
${block('https://ads.example.com/buy', 'Buy things now', 'Sponsored', 'result result--ad')}
${block('https://pmo.gov.pk/', 'Prime Minister Office', 'Official site.')}
${block('http://192.168.1.1/admin', 'Your router', 'Should never be shown')}
</body></html>`

async function ctx(fetchImpl: typeof fetch) {
  const p = fakePlatform()
  const c: ToolContext = {
    platform: p.platform,
    memory: await memory(),
    customApps: [],
    confirm: async () => true,
    now: () => new Date(),
    fetch: fetchImpl
  }
  return c
}

describe('web search', () => {
  it('reads titles, real addresses and descriptions, and skips ads and private addresses', () => {
    const hits = parseSearchResults(PAGE)
    expect(hits.map((h) => h.url)).toEqual([
      'https://en.wikipedia.org/wiki/Prime_Minister_of_Pakistan',
      'https://pmo.gov.pk/'
    ])
    expect(hits[0].title).toBe('Prime Minister of Pakistan - Wikipedia')
    expect(hits[0].snippet).toBe('The prime minister is the head of government & chief executive.')
  })

  it('decodes apostrophes and other numbered characters in titles', () => {
    const page = block(
      'https://pmo.gov.pk/',
      'Prime Minister&#x27;s Office &#8211; Pakistan &#1114112;',
      'It&#39;s the office.'
    )
    const [hit] = parseSearchResults(page)
    expect(hit.title).toBe("Prime Minister's Office – Pakistan")
    expect(hit.snippet).toBe("It's the office.")
  })

  it('stops at the number asked for and survives a page with no results', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      block(`https://site${i}.example.org/`, `Result ${i}`, 'text')
    ).join('')
    expect(parseSearchResults(many, 4)).toHaveLength(4)
    expect(parseSearchResults('<html>nothing here</html>')).toEqual([])
    expect(parseSearchResults('')).toEqual([])
  })

  it('unwraps result links and refuses the search engine itself, private hosts and odd schemes', () => {
    expect(realResultUrl(link('https://example.org/a?b=1&c=2'))).toBe(
      'https://example.org/a?b=1&c=2'
    )
    expect(realResultUrl(link('https://duckduckgo.com/y.js?ad=1'))).toBeNull()
    expect(realResultUrl(link('http://localhost:3000/'))).toBeNull()
    expect(realResultUrl(link('javascript:alert(1)'))).toBeNull()
    expect(realResultUrl('not a url at all')).toBeNull()
  })

  it('searches, with the question encoded, and numbers the results', async () => {
    let asked = ''
    const c = await ctx((async (url: string) => {
      asked = String(url)
      return new Response(PAGE, { status: 200 })
    }) as typeof fetch)
    const r = await webSearch.run({ query: 'prime minister of pakistan & news' }, c)
    expect(asked).toBe(
      'https://html.duckduckgo.com/html/?q=prime%20minister%20of%20pakistan%20%26%20news'
    )
    expect(r.isError).toBeUndefined()
    expect(r.content).toMatch(
      /^1\. Prime Minister of Pakistan - Wikipedia\nhttps:\/\/en\.wikipedia\.org/
    )
    expect(r.content).toContain('2. Prime Minister Office')
    expect(r.content).not.toContain('192.168')
  })

  it('tells the model to offer Google when search is down or returns nothing', async () => {
    const down = await ctx((async () => new Response('', { status: 503 })) as typeof fetch)
    const a = await webSearch.run({ query: 'anything' }, down)
    expect(a.isError).toBe(true)
    expect(a.content).toMatch(/open_website/)
    const offline = await ctx((async () => {
      throw new Error('offline')
    }) as typeof fetch)
    expect((await webSearch.run({ query: 'anything' }, offline)).summary).toBe('Search unavailable')
    const empty = await ctx(
      (async () => new Response('<html></html>', { status: 200 })) as typeof fetch
    )
    expect((await webSearch.run({ query: 'anything' }, empty)).summary).toBe('No results')
  })

  it('is taken away from every agent when the web search switch is off', () => {
    const tools = [{ name: 'web_search' }, { name: 'read_web_page' }, { name: 'open_app' }]
    expect(withSearchSetting(tools, true)).toHaveLength(3)
    expect(withSearchSetting(tools, false).map((t) => t.name)).toEqual([
      'read_web_page',
      'open_app'
    ])
  })
})
