import { useEffect, useRef } from 'react'
import type { Item, Step } from './useAgent'

const ICON: Record<Step['status'], string> = { running: '', done: '✓', error: '!', declined: '–' }

export function Transcript({
  items,
  busy,
  name,
  onConfirm
}: {
  items: Item[]
  busy: boolean
  name: string
  onConfirm: (id: string, ok: boolean) => void
}): React.JSX.Element {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [items])

  return (
    <div className="transcript" aria-live="polite">
      {items.map((it) => {
        if (it.kind === 'user')
          return (
            <p key={it.id} className="msg user">
              {it.text}
            </p>
          )
        if (it.kind === 'notice')
          return (
            <p key={it.id} className="notice">
              {it.text}
            </p>
          )
        const thinking = busy && it === items.at(-1) && !it.text && !it.steps.length && !it.error
        return (
          <div key={it.id} className="msg assistant">
            <span className="who">{name}</span>
            {it.steps.map((s) => (
              <div key={s.id} className={`step ${s.status}`}>
                <span className="step-icon" aria-hidden="true">
                  {s.status === 'running' ? <span className="spinner" /> : ICON[s.status]}
                </span>
                <span>{s.status === 'running' ? `${s.label}…` : s.summary || s.label}</span>
              </div>
            ))}
            {thinking && (
              <p className="dots" aria-label="Thinking">
                <span />
                <span />
                <span />
              </p>
            )}
            {it.text && <p className="text">{it.text}</p>}
            {it.confirm && (
              <div className="confirm" role="alertdialog" aria-labelledby={`c-${it.confirm.id}`}>
                <p id={`c-${it.confirm.id}`} className="confirm-title">
                  {it.confirm.title}
                </p>
                <pre>{it.confirm.detail}</pre>
                <div className="row">
                  <button className="btn primary" onClick={() => onConfirm(it.confirm!.id, true)}>
                    Allow
                  </button>
                  <button className="btn" onClick={() => onConfirm(it.confirm!.id, false)}>
                    Don&apos;t allow
                  </button>
                </div>
              </div>
            )}
            {it.sources.length > 0 && (
              <p className="sources">
                Sources:{' '}
                {it.sources.map((s, i) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                    {s.title || new URL(s.url).hostname}
                    {i < it.sources.length - 1 ? ', ' : ''}
                  </a>
                ))}
              </p>
            )}
            {it.error && <p className="error">{it.error}</p>}
          </div>
        )
      })}
      <div ref={end} />
    </div>
  )
}
