import { useEffect, useState } from 'react'
import { nova } from '../../lib/api'
import { CLOCKS, clockTime, utcDate } from './clocks'
import { Globe } from './Globe'
import { useHeadlines } from './useHeadlines'

/** The left side: a live globe (the "Sat-Link feed"), world clocks and today's numbered headlines. */
export function SatPanel({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { items, error } = useHeadlines()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <aside className="sat" aria-label="World monitor">
      <section className="panel-hud sat-feed">
        <h4>
          SAT-LINK FEED
          <button className="link" onClick={onOpen}>
            EXPAND
          </button>
        </h4>
        <div className="sat-globe">
          <Globe />
        </div>
        <div className="dock-clock">
          <span className="dock-utc" aria-label="UTC time">
            UTC {clockTime(now, 'UTC')}
          </span>
          <span className="dock-date">{utcDate(now)}</span>
        </div>
        <ul className="dock-zones">
          {CLOCKS.map((c) => (
            <li key={c.zone}>
              <span>{c.label}</span>
              <time>{clockTime(now, c.zone)}</time>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel-hud sat-news">
        <h4>TODAY HEADLINES</h4>
        {error && <p className="error">{error}</p>}
        {!items && !error && <p className="hint">Tuning the feeds…</p>}
        <ol>
          {items?.slice(0, 6).map((h, i) => (
            <li key={h.url}>
              <button className="news-row" onClick={() => void nova.openLink(h.url)}>
                <span className="news-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="news-t">{h.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}
