import { useCallback, useEffect, useState } from 'react'
import type { Headline } from '../../../../shared/types'
import { nova } from '../../lib/api'
import { Globe } from './Globe'

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
  const [items, setItems] = useState<Headline[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems(await nova.headlines())
      setError('')
    } catch {
      setError('Could not reach the news feeds. Check your internet connection.')
      setItems([])
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  return (
    <div className="monitor" role="dialog" aria-label="World monitor">
      <header className="panel-head">
        <h2>World Monitor</h2>
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
