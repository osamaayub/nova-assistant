import { Recorder } from './recorder'
import { WorkerClient } from './workerClient'

/** Push to talk: start() while the key or button is held, finish() on release returns the words heard. */
export class Listener {
  private recorder: Recorder | null = null
  private whisper: WorkerClient<{ text: string }> | null = null

  constructor(
    private onLevel: (level: number) => void,
    private onProgress: (p: number | null) => void
  ) {}

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
    this.recorder?.cancel()
    this.recorder = new Recorder()
    await this.recorder.start(this.onLevel)
  }

  async finish(): Promise<string> {
    const rec = this.recorder
    this.recorder = null
    this.onLevel(0)
    if (!rec) return ''
    const audio = await rec.stop()
    if (!audio) return ''
    const { text } = await this.client().run({ audio }, [audio.buffer])
    // Whisper writes non-speech as "[BLANK_AUDIO]" or "(music)".
    return text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim()
  }

  cancel(): void {
    this.recorder?.cancel()
    this.recorder = null
    this.onLevel(0)
  }
}
