import { Recorder } from './recorder'
import { WorkerClient } from './workerClient'

/** Push to talk: start() while the key or button is held, finish() on release returns the words heard. */
export class Listener {
  private recorder: Recorder | null = null
  private whisper: WorkerClient<{ text: string }> | null = null
  private lastVoice = 0

  constructor(
    private onLevel: (level: number) => void,
    private onProgress: (p: number | null) => void
  ) {}

  /** When the mic last heard something loud. The wake-word flow uses it to detect silence. */
  get lastVoiceAt(): number {
    return this.lastVoice
  }

  private level(level: number): void {
    if (level > 0.06) this.lastVoice = Date.now()
    this.onLevel(level)
  }

  private client(): WorkerClient<{ text: string }> {
    this.whisper ??= new WorkerClient<{ text: string }>(
      new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' }),
      'text',
      (p) => this.onProgress(p >= 100 ? null : p)
    )
    return this.whisper
  }

  /** Downloads and loads Whisper in the background, so the first voice command is quick. */
  warm(): void {
    void this.client()
      .run({ warm: true })
      .then(() => this.onProgress(null))
      .catch(() => undefined)
  }

  async start(): Promise<void> {
    this.lastVoice = 0
    this.recorder?.cancel()
    this.recorder = new Recorder()
    await this.recorder.start((l) => this.level(l))
  }

  /** Turns 16 kHz mono samples into words. Shared with the wake-word listener. */
  async transcribe(audio: Float32Array): Promise<string> {
    const { text } = await this.client().run({ audio }, [audio.buffer])
    // Whisper writes non-speech as "[BLANK_AUDIO]" or "(music)".
    return text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim()
  }

  async finish(): Promise<string> {
    const rec = this.recorder
    this.recorder = null
    this.level(0)
    if (!rec) return ''
    const audio = await rec.stop()
    if (!audio) return ''
    return this.transcribe(audio)
  }

  cancel(): void {
    this.recorder?.cancel()
    this.recorder = null
    this.level(0)
  }
}
