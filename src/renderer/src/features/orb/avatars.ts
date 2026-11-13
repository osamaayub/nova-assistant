import type { AvatarId } from '../../../../shared/types'

export interface AvatarInfo {
  id: AvatarId
  label: string
  hint: string
  /** Natural voice (Kokoro) this avatar speaks with. */
  kokoro: string
  /** Picks the matching Windows voice by name. */
  systemVoice: RegExp
}

export const AVATARS: AvatarInfo[] = [
  {
    id: 'core',
    label: 'Core',
    hint: 'The living orb',
    kokoro: 'bm_george',
    systemVoice: /george|ryan|david|mark/i
  },
  {
    id: 'female',
    label: 'Female',
    hint: 'Particle figure, female voice',
    kokoro: 'af_heart',
    systemVoice: /zira|aria|jenny|hazel|susan|libby|sonia|female/i
  },
  {
    id: 'male',
    label: 'Male',
    hint: 'Particle figure, male voice',
    kokoro: 'am_michael',
    systemVoice: /david|guy|mark|ryan|christopher|eric|male/i
  }
]

export const avatarInfo = (id: AvatarId): AvatarInfo => AVATARS.find((a) => a.id === id) ?? AVATARS[0]

/** The Windows voice that fits the avatar, or '' to keep whatever voice is set. */
export function pickSystemVoice(avatar: AvatarId, names: string[]): string {
  const re = avatarInfo(avatar).systemVoice
  return names.find((n) => re.test(n)) ?? ''
}

/** Small seeded random numbers, so a figure looks the same every time it is built. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A random direction on a unit sphere. */
function onSphere(r: () => number): [number, number, number] {
  const y = r() * 2 - 1
  const t = r() * Math.PI * 2
  const s = Math.sqrt(1 - y * y)
  return [Math.cos(t) * s, y, Math.sin(t) * s]
}

interface Build {
  head: { rx: number; ry: number; rz: number; jaw: number }
  neck: number
  shoulders: number
  waist: number
  hair: boolean
}

const BUILDS: Record<'female' | 'male', Build> = {
  female: { head: { rx: 0.34, ry: 0.46, rz: 0.36, jaw: 0.92 }, neck: 0.11, shoulders: 0.62, waist: 0.5, hair: true },
  male: { head: { rx: 0.38, ry: 0.48, rz: 0.4, jaw: 1.12 }, neck: 0.15, shoulders: 0.88, waist: 0.7, hair: false }
}

/**
 * The particle positions for an avatar: x, y, z per point. "core" is an even sphere. The figures
 * are a head, neck and shoulders made from simple solids; the female one has hair and narrower
 * shoulders, the male one a wider jaw and broader shoulders. Everything fits in a radius of 1.3.
 */
export function avatarPoints(avatar: AvatarId, count: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(count * 3)
  if (avatar === 'core') {
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      out.set([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r], i * 3)
    }
    return out
  }
  const b = BUILDS[avatar]
  const rand = rng(avatar === 'female' ? 7 : 13)
  const headShare = b.hair ? 0.34 : 0.44
  const hairShare = b.hair ? 0.14 : 0
  const neckShare = 0.06
  const headCy = 0.55
  for (let i = 0; i < count; i++) {
    const u = rand()
    let x: number
    let y: number
    let z: number
    if (u < headShare) {
      const [dx, dy, dz] = onSphere(rand)
      x = dx * b.head.rx * (dy < -0.1 ? b.head.jaw : 1)
      y = headCy + dy * b.head.ry
      z = dz * b.head.rz
    } else if (u < headShare + hairShare) {
      // Hair: a shell around the back and top of the head, with strands falling to the shoulders.
      if (rand() < 0.55) {
        const [dx, dy, dz] = onSphere(rand)
        x = dx * (b.head.rx + 0.1)
        y = headCy + 0.04 + Math.max(dy, -0.2) * (b.head.ry + 0.1)
        z = dz * (b.head.rz + 0.1) - 0.04
      } else {
        const side = rand() < 0.5 ? -1 : 1
        x = side * (b.head.rx + 0.06 + rand() * 0.12)
        y = headCy - 0.1 - rand() * 0.62
        z = -0.1 + rand() * 0.28
      }
    } else if (u < headShare + hairShare + neckShare) {
      const t = rand() * Math.PI * 2
      x = Math.cos(t) * b.neck
      y = headCy - b.head.ry + 0.02 - rand() * 0.2
      z = Math.sin(t) * b.neck
    } else {
      // Shoulders and chest: a tapering shell with sloped shoulders.
      const t = rand()
      const a = rand() * Math.PI * 2
      const w = b.shoulders * (1 - (1 - b.waist / b.shoulders) * t)
      x = Math.cos(a) * w
      z = Math.sin(a) * 0.3
      y = -0.12 - t * 0.75 - 0.16 * Math.pow(Math.abs(Math.cos(a)), 3) * (1 - t)
    }
    out.set([x, y + 0.1, z], i * 3)
  }
  return out
}
