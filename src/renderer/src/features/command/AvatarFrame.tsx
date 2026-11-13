import type { AvatarId } from '../../../../shared/types'
import { AVATARS } from '../orb/avatars'

/**
 * The framed centre: the avatar, what it is doing, a round mic button and the big red or green
 * button that stops or starts always-listening. A switch below picks the avatar.
 */
export function AvatarFrame({
  orb,
  line,
  aiOn,
  onToggleAi,
  listening,
  micDisabled,
  onMicDown,
  onMicUp,
  onMicCancel,
  avatar,
  onAvatar
}: {
  orb: React.ReactNode
  line: string
  aiOn: boolean
  onToggleAi: () => void
  listening: boolean
  micDisabled: boolean
  onMicDown: (e: React.PointerEvent<HTMLButtonElement>) => void
  onMicUp: () => void
  onMicCancel: () => void
  avatar: AvatarId
  onAvatar: (id: AvatarId) => void
}): React.JSX.Element {
  return (
    <section className="avatar-frame panel-hud" aria-label="Assistant">
      <div className="avatar-orb">{orb}</div>
      <p className="avatar-line" role="status">
        <span className={`live-dot ${aiOn ? 'on' : ''}`} /> {line}
      </p>
      <div className="avatar-actions">
        <button
          className={`power ${aiOn ? 'stop' : 'go'}`}
          onClick={onToggleAi}
          aria-pressed={aiOn}
        >
          {aiOn ? 'TERMINATE' : 'START AI'}
        </button>
        <button
          className={`round-mic ${listening ? 'on' : ''}`}
          aria-label={listening ? 'Release to send' : 'Hold to talk'}
          aria-pressed={listening}
          disabled={micDisabled}
          onPointerDown={onMicDown}
          onPointerUp={onMicUp}
          onPointerCancel={onMicCancel}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
            />
          </svg>
        </button>
      </div>
      <div className="seg" role="group" aria-label="Avatar">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            className={`seg-btn ${avatar === a.id ? 'on' : ''}`}
            aria-pressed={avatar === a.id}
            title={a.hint}
            onClick={() => onAvatar(a.id)}
          >
            {a.label.toUpperCase()}
          </button>
        ))}
      </div>
    </section>
  )
}
