/** The four circuits: a pill each, joined by a neon wire to the avatar frame. */
const CIRCUITS = [
  { id: 'memory', label: 'MEMORY', color: '#22d3ee', y: 12.5 },
  { id: 'connectors', label: 'SKILLS', color: '#34d399', y: 37.5 },
  { id: 'character', label: 'CHARACTER', color: '#f43f5e', y: 62.5 },
  { id: 'brain', label: 'SETTING', color: '#cbd5e1', y: 87.5 }
] as const

type CircuitId = (typeof CIRCUITS)[number]['id']

const ICONS: Record<CircuitId, React.JSX.Element> = {
  memory: <path d="M12 3a6 6 0 0 0-6 6c0 2 1 3 1 5h10c0-2 1-3 1-5a6 6 0 0 0-6-6zM9 18h6M10 21h4" />,
  connectors: <path d="M4 5h16v14H4zM4 10h16M10 10v9" />,
  character: <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 21a7 7 0 0 1 14 0" />,
  brain: (
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M4.2 6l2.6 1.5M17.2 16.5l2.6 1.5M4.2 18l2.6-1.5M17.2 7.5 19.8 6" />
  )
}

export function CircuitWires({
  hints,
  onOpen
}: {
  /** A short live note on a pill, for example how many things are remembered. */
  hints: Partial<Record<CircuitId, string>>
  onOpen: (section: string) => void
}): React.JSX.Element {
  return (
    <nav className="wires" aria-label="Circuits">
      <svg
        className="wires-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {CIRCUITS.map((c) => (
          <path
            key={c.id}
            d={`M0 ${c.y} H30 L62 50 H100`}
            fill="none"
            stroke={c.color}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            className="wire"
          />
        ))}
      </svg>
      {CIRCUITS.map((c) => (
        <button
          key={c.id}
          className="pill"
          style={{ '--c': c.color } as React.CSSProperties}
          onClick={() => onOpen(c.id)}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[c.id]}
          </svg>
          <span className="pill-label">{c.label}</span>
          {hints[c.id] && <span className="pill-hint">{hints[c.id]}</span>}
        </button>
      ))}
    </nav>
  )
}
