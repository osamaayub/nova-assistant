import { useEffect, useState } from 'react'

/** True while the window is at least `min` px wide: the command center layout instead of the compact one. */
export function useWide(min = 980): boolean {
  const query = `(min-width: ${min}px)`
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = (): void => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return wide
}
