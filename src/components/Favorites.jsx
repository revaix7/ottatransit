import { useMemo } from 'react'
import StopCard from './StopCard.jsx'
import RoutePill from './RoutePill.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import { useFavorites } from '../store/favorites.js'
import { useArrivalsForStops } from '../hooks/useArrivals.js'
import { useRoutes } from '../hooks/useRouteDetails.js'

/**
 * Saved stops and routes, pinned above the nearby list.
 *
 * Favourite stops poll on the same query keys as the nearby list, so a stop
 * that's both saved and nearby costs one request rather than two, and its
 * countdowns here tick in step with the ones below.
 */
export default function Favorites({ now, onSelectStop, onSelectRoute, selectedRouteId }) {
  const stopIds = useFavorites((state) => state.stopIds)
  const routeIds = useFavorites((state) => state.routeIds)
  const toggleRoute = useFavorites((state) => state.toggleRoute)

  const { byStop, stopById } = useArrivalsForStops(stopIds)
  const { data: allRoutes } = useRoutes()

  // Saved ids resolved back into something drawable. A route that vanished from
  // the feed between GTFS releases simply drops out rather than rendering blank.
  const routes = useMemo(() => {
    if (!allRoutes) return []
    const byId = new Map(allRoutes.map((route) => [route.route_id, route]))
    return routeIds.map((routeId) => byId.get(routeId)).filter(Boolean)
  }, [allRoutes, routeIds])

  const isEmpty = stopIds.length === 0 && routeIds.length === 0

  return (
    <section className="favorites">
      <header className="sheet-header">
        <h1 className="sheet-header__title">Favourites</h1>
        <p className="sheet-header__subtitle">
          {isEmpty ? 'Nothing saved yet' : 'Saved stops and routes'}
        </p>
      </header>

      {isEmpty && (
        <p className="notice notice--hint">
          Tap <span aria-hidden="true">☆</span> on a stop below — or on a route once it&apos;s open
          on the map — to keep it here.
        </p>
      )}

      {routes.length > 0 && (
        <div className="favorites__routes">
          {routes.map((route) => (
            /* The chip opens the route on the map; the star beside it is how a
               saved route gets dropped without having to open it first. */
            <span className="favorites__route" key={route.route_id}>
              <button
                type="button"
                className="route-chip"
                aria-pressed={route.route_id === selectedRouteId}
                title={route.route_long_name}
                onClick={() =>
                  onSelectRoute({
                    routeId: route.route_id,
                    routeShortName: route.route_short_name,
                    routeColor: route.route_color,
                  })
                }
              >
                <RoutePill shortName={route.route_short_name} color={route.route_color} size="sm" />
              </button>
              <FavoriteStar
                active
                size="sm"
                onToggle={() => toggleRoute(route.route_id)}
                label={`route ${route.route_short_name}`}
              />
            </span>
          ))}
        </div>
      )}

      {stopIds.length > 0 && (
        <ul className="stop-list">
          {stopIds.map((stopId) => {
            const stop = stopById.get(stopId)
            // Until the first response lands there's no name to show, so the row
            // waits rather than flashing the raw id at the user.
            if (!stop) {
              return (
                <li key={stopId} className="stop-card">
                  <span className="stop-card__placeholder" aria-hidden="true" />
                </li>
              )
            }
            return (
              <StopCard
                key={stopId}
                stop={stop}
                arrivals={byStop.get(stopId) ?? null}
                now={now}
                onSelect={onSelectStop}
                onSelectRoute={onSelectRoute}
                selectedRouteId={selectedRouteId}
              />
            )
          })}
        </ul>
      )}

    </section>
  )
}
