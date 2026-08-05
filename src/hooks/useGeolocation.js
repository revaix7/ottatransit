import { useEffect, useState } from 'react'

/** Confederation Square — used whenever the browser won't give us a position. */
export const OTTAWA_DOWNTOWN = { lat: 45.4215, lon: -75.6972 }

/**
 * The browser's position, falling back to downtown Ottawa if the user denies
 * permission, the device has no fix, or the page isn't on a secure origin.
 * `status` lets the UI say which of the two it is showing.
 */
export function useGeolocation() {
  const [state, setState] = useState({
    ...OTTAWA_DOWNTOWN,
    status: 'locating',
    accuracy: null,
  })

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ ...OTTAWA_DOWNTOWN, status: 'fallback', accuracy: null })
      return
    }

    let cancelled = false

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return
        setState({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          status: 'located',
        })
      },
      () => {
        if (cancelled) return
        setState({ ...OTTAWA_DOWNTOWN, status: 'fallback', accuracy: null })
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return state
}
