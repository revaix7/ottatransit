import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api.js'

// Shapes and stop lists come from the static feed and never change between
// GTFS releases, so once fetched they can stay cached for the whole session.
const STATIC_STALE_MS = Infinity

/** GeoJSON LineStrings for every shape variant the route runs. */
export function useRouteShapes(routeId) {
  return useQuery({
    queryKey: ['shapes', routeId],
    queryFn: ({ signal }) =>
      fetchJson(`/api/shapes/${encodeURIComponent(routeId)}`, { signal }),
    enabled: Boolean(routeId),
    staleTime: STATIC_STALE_MS,
    gcTime: 30 * 60_000,
  })
}

/** Every stop the route calls at, for highlighting them on the map. */
export function useRouteStops(routeId) {
  return useQuery({
    queryKey: ['route-stops', routeId],
    queryFn: ({ signal }) =>
      fetchJson(`/api/routes/${encodeURIComponent(routeId)}/stops`, { signal }),
    enabled: Boolean(routeId),
    staleTime: STATIC_STALE_MS,
    gcTime: 30 * 60_000,
  })
}
