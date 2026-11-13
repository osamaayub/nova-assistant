import { useState } from 'react'
import type { McpServerConfig, McpServerStatus } from '../../../../shared/types'
import { checkFields, PRESETS, type ConnectorPreset } from './connectors'

const stateText = (st?: McpServerStatus): string =>
  st?.state === 'connected'
    ? `Connected · ${st.tools.length} tool${st.tools.length === 1 ? '' : 's'}`
    : st?.state === 'connecting'
      ? 'Connecting…'
      : st?.state === 'error'
        ? (st.error ?? 'Could not connect')
        : 'Not connected'

/** Connectors like the Claude and ChatGPT apps: pick one, answer a question or two, connect. */
export function ConnectorGallery({
  servers,
  status,
  onSave,
  onRetry
}: {
  servers: McpServerConfig[]
  status: McpServerStatus[]
  onSave: (servers: McpServerConfig[]) => Promise<void>
  onRetry: () => Promise<void>
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState('')
  const [custom, setCustom] = useState({ name: '', command: '', args: '' })

  const presetIds = new Set(PRESETS.map((p) => p.id))
  const customServers = servers.filter((s) => !presetIds.has(s.name))
  const stOf = (name: string): McpServerStatus | undefined => status.find((m) => m.name === name)

  const connect = async (p: ConnectorPreset): Promise<void> => {
    const msg = checkFields(p, values)
    if (msg) return setProblem(msg)
    setProblem('')
    setOpen(null)
    setValues({})
    await onSave([...servers.filter((s) => s.name !== p.id), p.build(values)])
  }

  const remove = (name: string): Promise<void> => onSave(servers.filter((s) => s.name !== name))

  const addCustom = async (): Promise<void> => {
    const args = custom.args.trim() ? custom.args.trim().split(/\s+/) : []
    await onSave([
      ...servers.filter((s) => s.name !== custom.name.trim()),
      { name: custom.name.trim(), command: custom.command.trim(), args, env: {} }
    ])
    setCustom({ name: '', command: '', args: '' })
  }

  const failed = servers.some((s) => stOf(s.name)?.state === 'error')

  return (
    <div className="connectors">
      <p className="hint">
        Connectors let Nova use other apps and services. Anything that changes data asks you first.
        The first connection downloads the connector, so it needs internet and Node.js.
      </p>
      <ul className="connector-grid">
        {PRESETS.map((p) => {
          const on = servers.some((s) => s.name === p.id)
          const st = stOf(p.id)
          return (
            <li key={p.id} className={`connector ${on ? 'on' : ''}`}>
              <div className="connector-head">
                <span className={`status-dot ${on ? (st?.state ?? 'connecting') : ''}`} />
                <strong>{p.name}</strong>
                {on ? (
                  <button className="link" onClick={() => void remove(p.id)}>
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() => {
                      setProblem('')
                      if (p.fields.length) setOpen(open === p.id ? null : p.id)
                      else void connect(p)
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
              <p className="connector-blurb">{p.blurb}</p>
              {on ? (
                <>
                  <p className={`connector-state ${st?.state ?? ''}`}>{stateText(st)}</p>
                  {st?.state === 'connected' && st.tools.length > 0 && (
                    <details>
                      <summary>See tools</summary>
                      <p className="hint">{st.tools.join(', ')}</p>
                    </details>
                  )}
                </>
              ) : (
                <p className="connector-access">{p.access}</p>
              )}
              {open === p.id && !on && (
                <form
                  className="connector-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void connect(p)
                  }}
                >
                  {p.fields.map((f) => (
                    <input
                      key={f.key}
                      placeholder={f.placeholder}
                      aria-label={f.label}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      spellCheck={false}
                      autoFocus
                    />
                  ))}
                  {problem && <p className="error">{problem}</p>}
                  <button className="btn primary" type="submit">
                    Connect {p.name}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>

      {customServers.map((s) => {
        const st = stOf(s.name)
        return (
          <div key={s.name} className="list-row">
            <span>
              <strong>{s.name}</strong> <small>{stateText(st)}</small>
            </span>
            <button
              className="icon-btn"
              aria-label={`Remove ${s.name}`}
              onClick={() => void remove(s.name)}
            >
              ✕
            </button>
          </div>
        )
      })}
      {failed && (
        <button className="link" onClick={() => void onRetry()}>
          Retry connectors that failed
        </button>
      )}

      <details className="connector-custom">
        <summary>Add a custom connector</summary>
        <p className="hint">
          Any program that speaks MCP over stdio. Example: name <code>notes</code>, command{' '}
          <code>npx</code>, args <code>-y some-mcp-server</code>.
        </p>
        <div className="row">
          <input
            placeholder="Name"
            value={custom.name}
            maxLength={40}
            onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            aria-label="Connector name"
          />
          <input
            placeholder="Command"
            value={custom.command}
            onChange={(e) => setCustom({ ...custom, command: e.target.value })}
            aria-label="Connector command"
            spellCheck={false}
          />
          <input
            placeholder="Args (space separated)"
            value={custom.args}
            onChange={(e) => setCustom({ ...custom, args: e.target.value })}
            aria-label="Connector arguments"
            spellCheck={false}
          />
          <button
            className="btn"
            disabled={!custom.name.trim() || !custom.command.trim()}
            onClick={() => void addCustom()}
          >
            Add
          </button>
        </div>
      </details>
    </div>
  )
}
