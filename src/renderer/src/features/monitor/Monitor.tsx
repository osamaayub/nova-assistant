import { useEffect, useState } from 'react'
import { nova } from '../../lib/api'
import { Globe } from './Globe'
import { useHeadlines } from './useHeadlines'

function ago(at: number | null): string {
  if (!at) return ''
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** The World Monitor: a living globe on one side, today's headlines on the other. */
export function Monitor({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { items, error, reload: load } = useHeadlines()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="monitor" role="dialog" aria-label="World monitor">
      <header className="panel-head">
        <h2>World Monitor</h2>
        <span className="utc-clock" aria-label="UTC time">
          UTC {now.toISOString().slice(11, 19)}
        </span>
        <div className="row">
          <button className="icon-btn" onClick={() => void load()} aria-label="Refresh headlines" title="Refresh">
            ⟳
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close monitor">
            ✕
          </button>
        </div>
      </header>
      <div className="monitor-grid">
        <Globe />
        <div className="headlines">
          <h3>Today&apos;s headlines</h3>
          {error && <p className="error">{error}</p>}
          {!items && !error && <p className="hint">Tuning the feeds…</p>}
          {items?.length === 0 && !error && (
            <p className="hint">No headlines came through. Try refresh in a moment.</p>
          )}
          <ul>
            {items?.map((h) => (
              <li key={h.url}>
                <button className="headline" onClick={() => void nova.openLink(h.url)}>
                  <span className="headline-title">{h.title}</span>
                  <span className="headline-meta">
                    {h.source}
                    {h.at ? ` · ${ago(h.at)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
