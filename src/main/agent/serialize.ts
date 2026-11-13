/**
 * Makes an async function run one call at a time, in the order called. Used for "Allow?" questions:
 * agents work side by side, but the person answers one question at a time.
 */
export function serialize<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve()
  return (...args) => {
    const run = tail.then(() => fn(...args))
    tail = run.catch(() => undefined)
    return run
  }
}
