/**
 * "Hey Nova" wake word. Listens continuously with a cheap energy VAD, and only runs
 * speech through Whisper when someone actually talks. When the transcript starts with
 * the wake phrase, onWake fires with whatever came after it ('' means "wait for the command").
 */

/** Returns the command after the wake phrase, or null when the phrase isn't there. */
export function extractCommand(text: string): string | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(?:hey|ok|okay|hi|hello)?[-\s,]*(?:nova|computer|assistant|hey nova|okay nova|ok nova)\b[\s,.!: -]*/)
  if (!m) return null
  return text.trim().slice(m[0].length).trim()
}

const SAMPLE_RATE = 16000
const SPEECH_MIN = 0.35 // seconds of speech needed before we bother Whisper
const SPEECH_MAX = 6 // seconds; longer is probably a conversation, not a wake phrase
const END_SILENCE = 0.9 // seconds of quiet that end an utterance
const FRAME = 512 // samples per analysis frame (~32 ms)

export class WakeListener {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private proc: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private noiseFloor = 0.012
  private inSpeech = false
  private segment: Float32Array[] = []
  private segmentLen = 0
  private silenceStart = 0
  private busy = false
  private stopped = false

  constructor(
    private transcribe: (audio: Float32Array) => Promise<string>,
    private onWake: (command: string) => void,
    private onLevel: (level: number) => void = () => undefined
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    })
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    void this.ctx.resume()
    this.source = this.ctx.createMediaStreamSource(this.stream)
    // ScriptProcessorNode is deprecated but still the simplest reliable way to tap raw PCM.
    this.proc = this.ctx.createScriptProcessor(FRAME, 1, 1)
    this.proc.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0))
    this.source.connect(this.proc)
    this.proc.connect(this.ctx.destination)
  }

  stop(): void {
    this.stopped = true
    this.proc?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.proc = null
    this.source = null
    this.stream = null
    this.ctx = null
    this.segment = []
    this.segmentLen = 0
    this.inSpeech = false
  }

  private onAudio(frame: Float32Array): void {
    if (this.stopped || this.busy) return
    const now = performance.now() / 1000
    let sum = 0
    for (const v of frame) sum += v * v
    const rms = Math.sqrt(sum / frame.length)
    const level = Math.min(1, rms * 6)
    this.onLevel(this.inSpeech ? level : 0)

    // Track the noise floor so loud rooms don't trigger constantly.
    if (!this.inSpeech && rms < this.noiseFloor * 1.5)
      this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02
    const threshold = Math.max(this.noiseFloor * 2.5, 0.008)

    if (!this.inSpeech) {
      if (rms > threshold) {
        this.inSpeech = true
        this.silenceStart = now
        this.segment = [frame.slice()]
        this.segmentLen = frame.length
      }
      return
    }

    this.segment.push(frame.slice())
    this.segmentLen += frame.length
    if (rms > threshold) this.silenceStart = now

    const speechLen = this.segmentLen / SAMPLE_RATE
    const quietFor = now - this.silenceStart
    if ((quietFor >= END_SILENCE && speechLen >= SPEECH_MIN) || speechLen >= SPEECH_MAX) {
      this.inSpeech = false
      this.onLevel(0)
      const audio = this.join(this.segment, this.segmentLen)
      this.segment = []
      this.segmentLen = 0
      if (audio.length / SAMPLE_RATE >= SPEECH_MIN) void this.check(audio)
    }
  }

  private join(parts: Float32Array[], len: number): Float32Array {
    const out = new Float32Array(len)
    let off = 0
    for (const p of parts) {
      out.set(p, off)
      off += p.length
    }
    return out
  }

  private async check(audio: Float32Array): Promise<void> {
    this.busy = true
    try {
      const text = await this.transcribe(audio)
      if (this.stopped || !text) return
      const command = extractCommand(text)
      if (command !== null) this.onWake(command)
    } catch {
      // Whisper not ready or a bad clip: just keep listening.
    } finally {
      this.busy = false
    }
  }
}
