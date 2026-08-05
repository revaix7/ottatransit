import { useEffect, useState } from 'react'

/**
 * Current unix time, updated every `intervalMs`. Countdowns are derived from
 * each departure's absolute timestamp rather than the minute count the server
 * sent, so they keep counting down between the 15-second refetches instead of
 * sitting frozen.
 */
export function useNow(intervalMs = 5_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
