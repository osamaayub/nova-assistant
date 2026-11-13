import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarId } from '../../../../shared/types'
import { avatarPoints } from './avatars'

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'

const STATE_ENERGY: Record<OrbState, number> = {
  offline: 0.02,
  idle: 0.08,
  listening: 0.25,
  thinking: 0.35,
  speaking: 0.3
}

const vertex = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uSwirl;
uniform float uSway;
attribute float aSeed;
varying float vGlow;

// 3D simplex-style hash noise (cheap, good enough for a soft wobble).
vec3 hash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash(i), f), dot(hash(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

void main() {
  vec3 p = position;
  // The core turns all the way round; a figure only sways, so its face stays toward you.
  float a = mix(uTime * (0.15 + uSwirl), sin(uTime * 0.5) * 0.4 + uTime * uSwirl * 0.5, uSway) + p.y * uSwirl * 2.0;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  float n = noise(p * 1.6 + uTime * 0.35);
  float push = 1.0 + n * (0.12 + uLevel * 0.55) + aSeed * uLevel * 0.25;
  p *= push;
  vGlow = 0.45 + 0.55 * clamp(n * 1.5 + uLevel, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.4 + aSeed * 2.2 + uLevel * 2.5) * (3.2 / -mv.z) * ${'${DPR}'};
}`

const fragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, d) * vGlow;
  gl_FragColor = vec4(mix(uColorB, uColorA, vGlow), alpha);
}`

/** Soft radial glow used for the core sprite and could be reused for markers. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/**
 * The assistant's face: a sphere of particles. It breathes when idle, leans in while listening,
 * swirls while thinking and pulses with the voice while speaking.
 */
export function Orb({
  state,
  level,
  colors,
  avatar = 'core'
}: {
  state: OrbState
  level: number
  colors: [string, string]
  avatar?: AvatarId
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ state, level, colors, avatar })
  const morphTo = useRef<(a: AvatarId) => void>(() => undefined)
  useEffect(() => {
    live.current = { state, level, colors, avatar }
  }, [state, level, colors, avatar])
  useEffect(() => morphTo.current(avatar), [avatar])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(dpr)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
    camera.position.z = 4.2

    // Particle positions for the chosen avatar, and a smooth morph when it changes.
    const count = 2600
    const pos = avatarPoints(live.current.avatar, count)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) seed[i] = Math.random()
    let from = pos.slice()
    let to = pos.slice()
    let morph = 1
    let shape: AvatarId = live.current.avatar
    morphTo.current = (next) => {
      if (next === shape) return
      shape = next
      from = (geo.getAttribute('position').array as Float32Array<ArrayBuffer>).slice()
      to = avatarPoints(next, count)
      morph = 0
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const uniforms = {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uSwirl: { value: 0 },
      uSway: { value: live.current.avatar === 'core' ? 0 : 1 },
      uColorA: { value: new THREE.Color(live.current.colors[0]) },
      uColorB: { value: new THREE.Color(live.current.colors[1]) }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex.replace('${DPR}', dpr.toFixed(1)),
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    scene.add(new THREE.Points(geo, mat))

    // A soft core inside the particle shell: it brightens with the orb's energy.
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(live.current.colors[0]),
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
    core.scale.setScalar(1.1)
    scene.add(core)

    // A thin orbit ring, tilted, turning slowly around the character.
    const ringGroup = new THREE.Group()
    ringGroup.rotation.x = 1.15
    const ringPts: THREE.Vector3[] = []
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2
      ringPts.push(new THREE.Vector3(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0))
    }
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(live.current.colors[0]),
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    ringGroup.add(ring)
    scene.add(ringGroup)

    const resize = (): void => {
      const { width, height } = el.getBoundingClientRect()
      renderer.setSize(width, height, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      // Nothing to draw while the window is hidden. When idle, 30 fps is plenty.
      if (document.hidden) {
        last = now
        return
      }
      if (live.current.state === 'idle' && now - last < 33) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { state: s, level: l, colors: c } = live.current
      const target = Math.max(STATE_ENERGY[s], s === 'listening' || s === 'speaking' ? l : 0)
      // Ease toward the target so the orb never jumps.
      uniforms.uLevel.value += (target - uniforms.uLevel.value) * Math.min(1, dt * 8)
      uniforms.uSwirl.value +=
        ((s === 'thinking' ? 0.9 : 0.05) - uniforms.uSwirl.value) * Math.min(1, dt * 3)
      uniforms.uTime.value += dt * (reduce ? 0.25 : 1)
      uniforms.uSway.value += ((shape === 'core' ? 0 : 1) - uniforms.uSway.value) * Math.min(1, dt * 3)
      if (morph < 1) {
        morph = Math.min(1, morph + dt / 0.8)
        const e = morph * morph * (3 - 2 * morph)
        const attr = geo.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < count * 3; i++) attr.array[i] = from[i] + (to[i] - from[i]) * e
        attr.needsUpdate = true
      }
      uniforms.uColorA.value.lerp(new THREE.Color(c[0]), dt * 3)
      uniforms.uColorB.value.lerp(new THREE.Color(c[1]), dt * 3)
      const energy = uniforms.uLevel.value
      core.scale.setScalar(0.9 + energy * 0.7 + Math.sin(now / 900) * 0.04)
      ;(core.material as THREE.SpriteMaterial).opacity = 0.18 + energy * 0.55
      ;(core.material as THREE.SpriteMaterial).color.lerp(new THREE.Color(c[0]), dt * 3)
      ringGroup.rotation.z += dt * (0.25 + energy * 1.4)
      ;(ring.material as THREE.LineBasicMaterial).opacity = 0.14 + energy * 0.4
      ;(ring.material as THREE.LineBasicMaterial).color.lerp(new THREE.Color(c[0]), dt * 3)
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      geo.dispose()
      mat.dispose()
      core.material.map?.dispose()
      core.material.dispose()
      ring.geometry.dispose()
      ring.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={host} className="orb" aria-hidden="true" />
}
