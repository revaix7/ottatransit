import { useQuery } from '@tanstack/react-query'
import { fetchJson, roundCoord } from '../lib/api.js'

// Below this the viewport covers most of the city, which is several thousand
// stops — far more than can be told apart on screen, and a wasteful response.
// The nearby list carries the map until the user zooms past it.
export const MIN_ZOOM_FOR_AREA_STOPS = 13

/**
 * Every stop inside the current viewport.
 *
 * The nearby endpoint answers "what can I walk to", capped at the 25 closest,
 * which is the right list for the sheet but leaves the map empty everywhere the
 * user pans to. This answers "what is on screen" instead.
 */
export function useStopsInBounds(viewport) {
  const enabled = Boolean(viewport) && viewport.zoom >= MIN_ZOOM_FOR_AREA_STOPS

  // Rounding the box that goes into the query key means a nudge of the map
  // reuses the cached response instead of refetching; 3 decimal places is
  // roughly 110 m, comfortably finer than a viewport.
  const box = enabled
    ? {
        south: roundCoord(viewport.south, 1000),
        west: roundCoord(viewport.west, 1000),
        north: roundCoord(viewport.north, 1000),
        east: roundCoord(viewport.east, 1000),
      }
    : null

  return useQuery({
    queryKey: ['stops-in-bounds', box],
    queryFn: ({ signal }) =>
      fetchJson(
        `/api/stops/in-bounds?south=${box.south}&west=${box.west}&north=${box.north}&east=${box.east}`,
        { signal },
      ),
    enabled,
    staleTime: 5 * 60_000,
    // Panning shouldn't blank the map while the next box is in flight.
    placeholderData: (previous) => previous,
  })
}

/**
 * The O-Train lines and stations. Static, and small enough to fetch once and
 * keep for the session.
 */
export function useRail() {
  return useQuery({
    queryKey: ['rail'],
    queryFn: ({ signal }) => fetchJson('/api/rail', { signal }),
    staleTime: Infinity,
  })
}
