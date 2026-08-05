import { useQuery } from '@tanstack/react-query'
import { fetchJson, roundCoord } from '../lib/api.js'

/**
 * Stops within `radius` metres of a point, nearest first, each carrying the
 * routes that serve it. Stop locations come from the static GTFS feed, so this
 * only needs refetching when the user actually moves.
 */
export function useNearby(lat, lon, radius = 800) {
  const enabled = Number.isFinite(lat) && Number.isFinite(lon)
  const qLat = enabled ? roundCoord(lat) : null
  const qLon = enabled ? roundCoord(lon) : null

  return useQuery({
    queryKey: ['nearby', qLat, qLon, radius],
    queryFn: ({ signal }) =>
      fetchJson(`/api/stops/nearby?lat=${qLat}&lon=${qLon}&radius=${radius}`, { signal }),
    enabled,
    staleTime: 5 * 60_000,
  })
}
