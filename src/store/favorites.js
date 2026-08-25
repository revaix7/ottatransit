import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Bumping `version` below would drop everything saved under an older shape, so
// the key and the shape are both meant to stay put.
const STORAGE_KEY = 'ottatransit:favorites'

function without(list, id) {
  return list.filter((item) => item !== id)
}

function toggled(list, id) {
  return list.includes(id) ? without(list, id) : [...list, id]
}

/**
 * Saved stops and routes, by id.
 *
 * Only ids are stored: names, colours and countdowns all come from the API,
 * which keeps a favourite from going stale when the agency renames a stop or
 * recolours a route between GTFS releases. Insertion order is kept so the list
 * doesn't reshuffle itself on the user.
 */
export const useFavorites = create(
  persist(
    (set) => ({
      stopIds: [],
      routeIds: [],

      addStop: (stopId) =>
        set((state) => ({
          stopIds: state.stopIds.includes(stopId) ? state.stopIds : [...state.stopIds, stopId],
        })),
      removeStop: (stopId) => set((state) => ({ stopIds: without(state.stopIds, stopId) })),
      toggleStop: (stopId) => set((state) => ({ stopIds: toggled(state.stopIds, stopId) })),

      addRoute: (routeId) =>
        set((state) => ({
          routeIds: state.routeIds.includes(routeId)
            ? state.routeIds
            : [...state.routeIds, routeId],
        })),
      removeRoute: (routeId) => set((state) => ({ routeIds: without(state.routeIds, routeId) })),
      toggleRoute: (routeId) => set((state) => ({ routeIds: toggled(state.routeIds, routeId) })),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
)

// Membership as a boolean rather than the array, so a star only re-renders when
// its own state changes instead of on every favourite anywhere.
export function useIsFavoriteStop(stopId) {
  return useFavorites((state) => state.stopIds.includes(stopId))
}

export function useIsFavoriteRoute(routeId) {
  return useFavorites((state) => state.routeIds.includes(routeId))
}

export function useHasFavorites() {
  return useFavorites((state) => state.stopIds.length + state.routeIds.length > 0)
}
