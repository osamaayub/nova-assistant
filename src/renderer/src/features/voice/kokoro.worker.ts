/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js'

/**
 * Natural voice, fully on this PC: Kokoro 82M in WebAssembly.
 * The model (about 90 MB) downloads from Hugging Face the first time and is cached after that.
 */
let tts: Promise<KokoroTTS> | null = null

function load(): Promise<KokoroTTS> {
  tts ??= KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress') self.postMessage({ type: 'progress', progress: p.progress ?? 0 })
    }
  })
  return tts
}

self.onmessage = async (
  e: MessageEvent<{ id: number; text?: string; voice?: string; warm?: boolean }>
) => {
  const { id, text, voice, warm } = e.data
  try {
    const model = await load()
    if (warm || !text) return self.postMessage({ type: 'ready', id })
    const audio = await model.generate(text, { voice: (voice || 'am_michael') as 'am_michael' })
    const samples = audio.audio as Float32Array
    self.postMessage({ type: 'audio', id, samples, rate: audio.sampling_rate }, [samples.buffer])
  } catch (err) {
    tts = null
    self.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
