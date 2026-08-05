import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api.js'

// The server repolls OC Transpo every 15s. Asking slightly more often than that
// keeps the map from sitting on a snapshot for most of a full feed cycle.
const REFETCH_MS = 12_000

/**
 * Every live vehicle in the system. The whole fleet is fetched even when a
 * route is selected — filtering happens on the client so switching routes is
 * instant and doesn't blank the map while a new request is in flight.
 */
export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: ({ signal }) => fetchJson('/api/vehicles', { signal }),
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}
