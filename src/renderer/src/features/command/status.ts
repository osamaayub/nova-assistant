import type { OrbState } from '../orb/Orb'

/** The one line under the avatar: what the assistant is doing right now, in plain words. */
export function statusLine(state: OrbState, name: string, aiOn: boolean, blocked: boolean): string {
  if (blocked) return 'Pick a brain to start'
  switch (state) {
    case 'listening':
      return `${name} is listening`
    case 'thinking':
      return `${name} is thinking`
    case 'speaking':
      return `${name} is speaking`
    default:
      return aiOn ? `${name} is listening for the wake word` : 'AI is off. Hold Space to talk'
  }
}
