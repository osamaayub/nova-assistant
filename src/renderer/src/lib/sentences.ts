/**
 * Collects streamed text and hands back whole sentences, so speech can start
 * after the first sentence instead of waiting for the full reply.
 */
export class SentenceSplitter {
  private buffer = ''

  push(delta: string): string[] {
    this.buffer += delta
    const out: string[] = []
    const re = /[^.!?\n]*?[.!?]+["')\]]?(?=\s)|[^\n]+\n/g
    let match: RegExpExecArray | null
    let last = 0
    while ((match = re.exec(this.buffer))) {
      const s = match[0].trim()
      if (s) out.push(s)
      last = re.lastIndex
    }
    this.buffer = this.buffer.slice(last)
    return out
  }

  flush(): string[] {
    const s = this.buffer.trim()
    this.buffer = ''
    return s ? [s] : []
  }
}

/** Removes things that sound bad read aloud: markdown symbols and links. */
export function forSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
