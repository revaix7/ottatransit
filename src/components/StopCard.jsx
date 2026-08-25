import RoutePill from './RoutePill.jsx'
import DepartureTimes from './DepartureTimes.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import { SkeletonBar } from './Skeleton.jsx'
import { useFavorites, useIsFavoriteStop } from '../store/favorites.js'
import { formatDistance, groupByRouteDirection } from '../lib/departures.js'

const MAX_LINES_PER_STOP = 3

/**
 * One stop in a list: its name, and the next departures grouped by route and
 * direction. Shared by the nearby list and the favourites section, which is why
 * distance and the stop's full route list are both optional — the arrivals
 * endpoint that backs favourites knows neither.
 */
export default function StopCard({
  stop,
  arrivals,
  now,
  onSelect,
  onSelectRoute,
  selectedRouteId,
}) {
  const groups = arrivals ? groupByRouteDirection(arrivals) : []
  const shown = groups.slice(0, MAX_LINES_PER_STOP)

  const isFavorite = useIsFavoriteStop(stop.stop_id)
  const toggleStop = useFavorites((state) => state.toggleStop)

  // Routes that serve this stop but have nothing due in the look-ahead window —
  // peak-only and night routes, mostly. Worth showing so the stop still reads
  // as "the 61 stops here", just without a countdown.
  const shownRouteIds = new Set(shown.map((group) => group.routeId))
  const quiet = (stop.routes ?? []).filter((route) => !shownRouteIds.has(route.route_id))

  return (
    <li className="stop-card">
      {/* The stop name opens the stop; the lines below it open the route on the
          map, which is the split Transit uses. */}
      <div className="stop-card__top">
        <button type="button" className="stop-card__head" onClick={() => onSelect(stop.stop_id)}>
          <span className="stop-card__name">{stop.stop_name}</span>
          <span className="stop-card__meta">
            {stop.stop_code ? `#${stop.stop_code}` : ''}
            {stop.stop_code && Number.isFinite(stop.distance) ? ' · ' : ''}
            {Number.isFinite(stop.distance) ? formatDistance(stop.distance) : ''}
          </span>
        </button>
        <FavoriteStar
          active={isFavorite}
          onToggle={() => toggleStop(stop.stop_id)}
          label={stop.stop_name}
        />
      </div>

      {arrivals === null ? (
        <span className="skeleton-line" aria-hidden="true">
          <SkeletonBar width="34px" height={20} />
          <SkeletonBar width="45%" height={12} />
          <SkeletonBar width="42px" height={16} />
        </span>
      ) : shown.length === 0 ? (
        <span className="stop-card__quiet">No departures in the next 3 hours</span>
      ) : (
        <ul className="departure-lines">
          {shown.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                className={`departure-line${
                  group.routeId === selectedRouteId ? ' departure-line--active' : ''
                }`}
                aria-pressed={group.routeId === selectedRouteId}
                onClick={() =>
                  onSelectRoute({
                    routeId: group.routeId,
                    routeShortName: group.routeShortName,
                    routeColor: group.routeColor,
                  })
                }
              >
                <RoutePill
                  shortName={group.routeShortName}
                  color={group.routeColor}
                  title={group.headsign}
                />
                <span className="departure-line__headsign">{group.headsign}</span>
                <DepartureTimes departures={group.departures} now={now} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {quiet.length > 0 && (
        <span className="stop-card__quiet-routes">
          {quiet.map((route) => (
            <button
              type="button"
              key={route.route_id}
              className="route-chip"
              aria-pressed={route.route_id === selectedRouteId}
              onClick={() =>
                onSelectRoute({
                  routeId: route.route_id,
                  routeShortName: route.route_short_name,
                  routeColor: route.route_color,
                })
              }
            >
              <RoutePill
                shortName={route.route_short_name}
                color={route.route_color}
                size="sm"
              />
            </button>
          ))}
        </span>
      )}
    </li>
  )
}
