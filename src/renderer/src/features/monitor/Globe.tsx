import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * The World Monitor globe: a dotted planet with pulsing hotspots, slowly turning.
 * Drag it to spin. Purely ambient — the headlines beside it carry the real news.
 */

// A handful of real places so the hotspots feel like a world, not confetti.
const HOTSPOTS: [number, number][] = [
  // [lat, lon]
  [40.7, -74], // New York
  [51.5, -0.1], // London
  [48.85, 2.35], // Paris
  [55.75, 37.6], // Moscow
  [25.2, 55.27], // Dubai
  [28.6, 77.2], // Delhi
  [1.35, 103.8], // Singapore
  [-33.9, 151.2], // Sydney
  [-23.5, -46.6], // São Paulo
  [37.8, -122.4] // San Francisco
]

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  return tex
}

function latLon(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

export function Globe(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const spin = useRef({ dragging: false, lastX: 0, fling: 0 })

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
    camera.position.z = 4.6

    const world = new THREE.Group()
    world.rotation.z = 0.35 // tilt like a real globe
    scene.add(world)

    // Dotted surface.
    const count = 3200
    const pos = new Float32Array(count * 3)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const t = golden * i
      pos.set([Math.cos(t) * r, y, Math.sin(t) * r], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const dots = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x6ea8ff,
        size: 0.022,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      })
    )
    world.add(dots)

    // Faint atmosphere shell.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
        depthWrite: false
      })
    )
    world.add(shell)

    // Hotspots: glowing sprites that breathe out of sync.
    const tex = glowTexture()
    const markers: { sprite: THREE.Sprite; phase: number }[] = HOTSPOTS.map(([lat, lon], i) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: i % 3 === 0 ? 0xff6b6b : i % 3 === 1 ? 0x4ade80 : 0xfacc15,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      )
      sprite.position.copy(latLon(lat, lon, 1.01))
      world.add(sprite)
      return { sprite, phase: (i / HOTSPOTS.length) * Math.PI * 2 }
    })

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

    // Drag to spin.
    const down = (e: PointerEvent): void => {
      spin.current.dragging = true
      spin.current.lastX = e.clientX
      spin.current.fling = 0
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent): void => {
      if (!spin.current.dragging) return
      const dx = e.clientX - spin.current.lastX
      spin.current.lastX = e.clientX
      world.rotation.y += dx * 0.008
      spin.current.fling = dx * 0.4
    }
    const up = (): void => {
      spin.current.dragging = false
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!spin.current.dragging) {
        spin.current.fling *= Math.max(0, 1 - dt * 2.5)
        world.rotation.y += ((reduce ? 0.02 : 0.12) + spin.current.fling) * dt
      }
      const t = now / 1000
      for (const m of markers) {
        const s = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(t * 2.2 + m.phase))
        m.sprite.scale.setScalar(s)
        ;(m.sprite.material as THREE.SpriteMaterial).opacity =
          0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + m.phase))
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      geo.dispose()
      dots.material.dispose()
      shell.geometry.dispose()
      ;(shell.material as THREE.Material).dispose()
      tex.dispose()
      for (const m of markers) {
        m.sprite.material.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={host} className="globe" aria-hidden="true" />
}
