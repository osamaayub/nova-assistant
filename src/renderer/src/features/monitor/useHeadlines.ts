import { useCallback, useEffect, useState } from 'react'
import type { Headline } from '../../../../shared/types'
import { nova } from '../../lib/api'

/** Today's headlines, loaded once when the component appears, and again on demand. */
export function useHeadlines(): {
  items: Headline[] | null
  error: string
  reload: () => Promise<void>
} {
  const [items, setItems] = useState<Headline[] | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setItems(await nova.headlines())
      setError('')
    } catch {
      setError('Could not reach the news feeds. Check your internet connection.')
      setItems([])
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  return { items, error, reload }
}
