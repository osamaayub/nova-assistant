/** Sends a job to a worker and waits for its answer. Also forwards download progress. */
export class WorkerClient<Out> {
  private next = 1
  private waiting = new Map<number, { resolve: (v: Out) => void; reject: (e: Error) => void }>()

  constructor(
    private worker: Worker,
    private doneType: string,
    onProgress?: (progress: number) => void
  ) {
    worker.onmessage = (
      e: MessageEvent<
        { type: string; id?: number; progress?: number; message?: string } & Record<string, unknown>
      >
    ) => {
      const d = e.data
      if (d.type === 'progress') return onProgress?.(d.progress ?? 0)
      const job = d.id ? this.waiting.get(d.id) : undefined
      if (!job) return
      this.waiting.delete(d.id!)
      if (d.type === 'error') job.reject(new Error(d.message ?? 'Worker error'))
      else job.resolve(d as unknown as Out)
    }
  }

  /** True while a job is still waiting for its answer. */
  get busy(): boolean {
    return this.waiting.size > 0
  }

  /** Stops the worker and frees the model it holds. */
  terminate(): void {
    this.worker.terminate()
    this.waiting.forEach((j) => j.reject(new Error('Worker stopped')))
    this.waiting.clear()
  }

  run(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<Out> {
    const id = this.next++
    return new Promise<Out>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.worker.postMessage({ ...message, id }, transfer)
    })
  }

  wait(type: string): boolean {
    return type === this.doneType
  }
}
