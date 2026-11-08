/**
 * Push-to-talk recording. Gives a live loudness level (for the orb) and, when stopped,
 * 16 kHz mono audio, which is what Whisper expects.
 */
export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0

  async start(onLevel: (level: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    })
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
    const data = new Uint8Array(this.analyser.fftSize)
    const tick = (): void => {
      this.analyser?.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
      this.raf = requestAnimationFrame(tick)
    }
    tick()
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start()
  }

  /** Stops and returns 16 kHz mono samples, or null if the clip was too short to be speech. */
  async stop(): Promise<Float32Array | null> {
    cancelAnimationFrame(this.raf)
    const rec = this.recorder
    if (!rec) return null
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.stop()
    await done
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close()
    this.recorder = null
    const blob = new Blob(this.chunks, { type: rec.mimeType })
    if (blob.size < 2000) return null
    const decodeCtx = new AudioContext({ sampleRate: 16000 })
    try {
      const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer())
      return buf.duration < 0.4 ? null : buf.getChannelData(0).slice()
    } finally {
      await decodeCtx.close()
    }
  }

  cancel(): void {
    cancelAnimationFrame(this.raf)
    try {
      this.recorder?.stop()
    } catch {
      /* already stopped */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.recorder = null
  }
}
