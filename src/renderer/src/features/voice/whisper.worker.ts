/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

/**
 * Speech to text, fully on this PC: Whisper (base, English) running in WebAssembly.
 * The model (about 80 MB) downloads from Hugging Face the first time and is cached after that.
 */
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  asr ??= pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress') self.postMessage({ type: 'progress', progress: p.progress ?? 0 })
    }
  }) as Promise<AutomaticSpeechRecognitionPipeline>
  return asr
}

self.onmessage = async (e: MessageEvent<{ id: number; audio?: Float32Array; warm?: boolean }>) => {
  const { id, audio, warm } = e.data
  try {
    const model = await load()
    if (warm || !audio) return self.postMessage({ type: 'ready', id })
    const out = (await model(audio)) as { text: string }
    self.postMessage({ type: 'text', id, text: out.text.trim() })
  } catch (err) {
    asr = null
    self.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
