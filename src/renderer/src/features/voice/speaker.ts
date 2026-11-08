import type { VoiceEngine } from '../../../../shared/types'
import { forSpeech } from '../../lib/sentences'
import { WorkerClient } from './workerClient'

type KokoroOut = { samples: Float32Array; rate: number }

/**
 * Speaks sentences in order. "system" uses the Windows voices (instant, robotic);
 * "kokoro" uses a natural local voice (needs a one-time model download, a little slower).
 * Reports a loudness level so the orb can pulse while it talks.
 */
export class Speaker {
  private queue: string[] = []
  private playing = false
  private stopped = 0
  private kokoro: WorkerClient<KokoroOut> | null = null
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null

  constructor(
    private onLevel: (level: number) => void,
    private onSpeaking: (speaking: boolean) => void,
    private onProgress: (p: number | null) => void
  ) {}

  private engine: VoiceEngine = 'system'
  private systemVoice = ''
  private kokoroVoice = 'am_michael'

  configure(engine: VoiceEngine, systemVoice: string, kokoroVoice: string): void {
    this.engine = engine
    this.systemVoice = systemVoice
    this.kokoroVoice = kokoroVoice
  }

  say(sentence: string): void {
    const text = forSpeech(sentence)
    if (!text) return
    this.queue.push(text)
    if (!this.playing) void this.drain()
  }

  stop(): void {
    this.stopped++
    this.queue = []
    speechSynthesis.cancel()
    try {
      this.source?.stop()
    } catch {
      /* not started */
    }
    this.playing = false
    this.onLevel(0)
    this.onSpeaking(false)
  }

  /** Starts the Kokoro model download early so the first reply isn't slow. */
  warmKokoro(): void {
    void this.kokoroClient()
      .run({ warm: true })
      .catch(() => undefined)
  }

  private kokoroClient(): WorkerClient<KokoroOut> {
    this.kokoro ??= new WorkerClient<KokoroOut>(
      new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' }),
      'audio',
      (p) => this.onProgress(p >= 100 ? null : p)
    )
    return this.kokoro
  }

  private async drain(): Promise<void> {
    const run = this.stopped
    this.playing = true
    this.onSpeaking(true)
    while (this.queue.length && run === this.stopped) {
      const text = this.queue.shift()!
      try {
        if (this.engine === 'kokoro') await this.playKokoro(text, run)
        else await this.playSystem(text)
      } catch {
        // If the natural voice fails (no internet for the first download), fall back to the Windows voice.
        if (run === this.stopped) await this.playSystem(text)
      }
    }
    if (run === this.stopped) {
      this.playing = false
      this.onLevel(0)
      this.onSpeaking(false)
    }
  }

  private playSystem(text: string): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      const voice = speechSynthesis.getVoices().find((v) => v.name === this.systemVoice)
      if (voice) u.voice = voice
      u.rate = 1.05
      // Windows voices don't report loudness, so the orb gets a gentle fake pulse per word.
      u.onboundary = () => this.onLevel(0.55 + Math.random() * 0.3)
      u.onend = u.onerror = () => {
        this.onLevel(0)
        resolve()
      }
      speechSynthesis.speak(u)
    })
  }

  private async playKokoro(text: string, run: number): Promise<void> {
    const { samples, rate } = await this.kokoroClient().run({ text, voice: this.kokoroVoice })
    if (run !== this.stopped) return
    this.ctx ??= new AudioContext()
    const buf = this.ctx.createBuffer(1, samples.length, rate)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = this.ctx.createBufferSource()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 512
    src.buffer = buf
    src.connect(analyser).connect(this.ctx.destination)
    this.source = src
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    const tick = (): void => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      this.onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5))
      raf = requestAnimationFrame(tick)
    }
    await new Promise<void>((resolve) => {
      src.onended = () => {
        cancelAnimationFrame(raf)
        resolve()
      }
      src.start()
      tick()
    })
  }
}

export function systemVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices())
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500)
  })
}

export const KOKORO_VOICES = [
  { id: 'am_michael', label: 'Michael (US, male)' },
  { id: 'am_fenrir', label: 'Fenrir (US, male)' },
  { id: 'bm_george', label: 'George (UK, male)' },
  { id: 'af_heart', label: 'Heart (US, female)' },
  { id: 'af_bella', label: 'Bella (US, female)' },
  { id: 'bf_emma', label: 'Emma (UK, female)' }
]
