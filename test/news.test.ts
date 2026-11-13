import { describe, expect, it } from 'vitest'
import { parseRss } from '../src/main/news'

const RSS = `<?xml version="1.0"?>
<rss><channel>
<item><title>First &amp; biggest story</title><link>https://example.com/1</link><pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title><![CDATA[Second <b>story</b>]]></title><link>https://example.com/2</link></item>
<item><title></title><link>https://example.com/3</link></item>
<item><title>Bad link story</title><link>notaurl</link></item>
</channel></rss>`

describe('parseRss', () => {
  it('pulls titled items with real links only', () => {
    const items = parseRss(RSS, 'Test')
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('First & biggest story')
    expect(items[0].url).toBe('https://example.com/1')
    expect(items[0].at).toBe(Date.parse('Thu, 12 Nov 2026 10:00:00 GMT'))
    expect(items[1].title).toBe('Second story')
    expect(items[1].at).toBeNull()
  })
})
