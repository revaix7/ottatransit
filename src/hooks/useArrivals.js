import { useCallback, useRef } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api.js'

const REFETCH_MS = 15_000

function arrivalsQuery(stopId) {
  return {
    queryKey: ['arrivals', stopId],
    queryFn: ({ signal }) =>
      fetchJson(`/api/stops/${encodeURIComponent(stopId)}/arrivals`, { signal }),
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  }
}

/** Upcoming departures at one stop, repolled every 15s while mounted. */
export function useArrivals(stopId) {
  return useQuery({ ...arrivalsQuery(stopId), enabled: Boolean(stopId) })
}

/**
 * The same query for a list of stops at once, so the nearby list can show each
 * stop's next departures. The query keys match useArrivals, so opening a stop
 * reuses data already fetched here instead of showing a spinner.
 */
export function useArrivalsForStops(stopIds) {
  // `combine` has to keep a stable identity for TanStack to memoize it, so the
  // current ids are read through a ref rather than closed over.
  const idsRef = useRef(stopIds)
  idsRef.current = stopIds

  const combine = useCallback((results) => {
    const byStop = new Map()
    results.forEach((result, index) => {
      byStop.set(idsRef.current[index], result.data?.arrivals ?? null)
    })
    return {
      byStop,
      isLoading: results.some((result) => result.isLoading),
    }
  }, [])

  return useQueries({ queries: stopIds.map(arrivalsQuery), combine })
}
