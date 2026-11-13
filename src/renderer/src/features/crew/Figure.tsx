import type { Hat } from './crew'

export type Mode = 'stand' | 'walk' | 'work' | 'stuck' | 'talk' | 'alert'

const LINE = { stroke: 'currentColor', strokeWidth: 0.9 } as const
const GLASS = { fill: 'currentColor', fillOpacity: 0.2, ...LINE } as const

/**
 * One small holographic character: a glowing outline with an arc-reactor in the chest. Arms and
 * legs move with the mode (walking, typing...). The colour comes from the agent.
 */
export function Figure({
  color,
  hat,
  mode
}: {
  color: string
  hat: Hat
  mode: Mode
}): React.JSX.Element {
  return (
    <svg className={`fig ${mode}`} viewBox="0 0 40 62" style={{ color }} aria-hidden="true">
      <ellipse cx="20" cy="60" rx="13" ry="2.6" fill="currentColor" fillOpacity="0.28" />
      <g className="leg l">
        <rect x="13" y="40" width="6" height="18" rx="3" {...GLASS} />
      </g>
      <g className="leg r">
        <rect x="21" y="40" width="6" height="18" rx="3" {...GLASS} />
      </g>
      <g className="body">
        <g className="arm l">
          <rect x="4" y="22" width="5" height="17" rx="2.5" {...GLASS} />
        </g>
        <g className="arm r">
          <rect x="31" y="22" width="5" height="17" rx="2.5" {...GLASS} />
        </g>
        <rect x="9" y="20" width="22" height="24" rx="9" {...GLASS} fillOpacity={0.28} />
        <path
          d="M13 26 h14 M14 38 h12"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.7"
        />
        <circle className="core" cx="20" cy="31" r="3.2" fill="currentColor" />
        <circle
          cx="20"
          cy="31"
          r="5.4"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="0.7"
        />
        <circle cx="20" cy="12" r="9" {...GLASS} fillOpacity={0.12} />
        {mode === 'stuck' ? (
          <path
            d="M13.6 10.6 l3.6 3.6 m0 -3.6 l-3.6 3.6 M22.8 10.6 l3.6 3.6 m0 -3.6 l-3.6 3.6"
            stroke="#fff"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ) : (
          <>
            <rect className="eye" x="13.5" y="11.4" width="5" height="1.8" rx="0.9" fill="#fff" />
            <rect className="eye" x="21.5" y="11.4" width="5" height="1.8" rx="0.9" fill="#fff" />
          </>
        )}
        <HatShape hat={hat} />
      </g>
    </svg>
  )
}

function HatShape({ hat }: { hat: Hat }): React.JSX.Element | null {
  switch (hat) {
    case 'cap':
      return (
        <>
          <path d="M11 9 a9 9 0 0 1 18 0 z" {...GLASS} fillOpacity={0.5} />
          <rect x="19" y="8" width="13" height="2.4" rx="1.2" {...GLASS} fillOpacity={0.5} />
        </>
      )
    case 'visor':
      return <rect x="11" y="6.5" width="18" height="4" rx="2" {...GLASS} fillOpacity={0.55} />
    case 'glasses':
      return (
        <>
          <circle cx="16" cy="12.3" r="3.4" fill="none" {...LINE} strokeWidth={1.1} />
          <circle cx="24" cy="12.3" r="3.4" fill="none" {...LINE} strokeWidth={1.1} />
          <line x1="19.4" y1="12.3" x2="20.6" y2="12.3" {...LINE} />
        </>
      )
    case 'helmet':
      return <path d="M10.5 11 a9.5 9.5 0 0 1 19 0 z" {...GLASS} fillOpacity={0.5} />
    case 'headset':
      return (
        <>
          <path d="M11 11 a9 9 0 0 1 18 0" fill="none" {...LINE} strokeWidth={1.8} />
          <circle cx="11" cy="13" r="2.2" {...GLASS} fillOpacity={0.6} />
          <circle cx="29" cy="13" r="2.2" {...GLASS} fillOpacity={0.6} />
        </>
      )
    case 'antenna':
      return (
        <>
          <line x1="20" y1="3" x2="20" y2="-2" {...LINE} strokeWidth={1.1} />
          <circle className="core" cx="20" cy="-3" r="2" fill="currentColor" />
        </>
      )
    case 'bun':
      return <circle cx="20" cy="2" r="4" {...GLASS} fillOpacity={0.5} />
    case 'bow':
      return <path d="M20 4 l-6 -3 v6 z M20 4 l6 -3 v6 z" {...GLASS} fillOpacity={0.55} />
    case 'crown':
      return (
        <path
          d="M11.5 5 l2.5 -5 l3 3.5 l3 -5 l3 5 l3 -3.5 l2.5 5 z"
          {...GLASS}
          fillOpacity={0.55}
        />
      )
  }
}
