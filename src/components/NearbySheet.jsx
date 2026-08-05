import RoutePill from './RoutePill.jsx'
import DepartureTimes from './DepartureTimes.jsx'
import { formatDistance, groupByRouteDirection } from '../lib/departures.js'

const MAX_LINES_PER_STOP = 3

function StopCard({ stop, arrivals, now, onSelect, onSelectRoute, selectedRouteId }) {
  const groups = arrivals ? groupByRouteDirection(arrivals) : []
  const shown = groups.slice(0, MAX_LINES_PER_STOP)

  // Routes that serve this stop but have nothing due in the look-ahead window —
  // peak-only and night routes, mostly. Worth showing so the stop still reads
  // as "the 61 stops here", just without a countdown.
  const shownRouteIds = new Set(shown.map((group) => group.routeId))
  const quiet = (stop.routes ?? []).filter((route) => !shownRouteIds.has(route.route_id))

  return (
    <li className="stop-card">
      {/* The stop name opens the stop; the lines below it open the route on the
          map, which is the split Transit uses. */}
      <button type="button" className="stop-card__head" onClick={() => onSelect(stop.stop_id)}>
        <span className="stop-card__name">{stop.stop_name}</span>
        <span className="stop-card__meta">
          {stop.stop_code ? `#${stop.stop_code} · ` : ''}
          {formatDistance(stop.distance)}
        </span>
      </button>

      {arrivals === null ? (
        <span className="stop-card__placeholder" aria-hidden="true" />
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

/**
 * The default sheet contents: nearby stops sorted by distance, each showing the
 * routes that serve it and live countdowns for the next departures.
 */
export default function NearbySheet({
  stops,
  arrivalsByStop,
  now,
  onSelectStop,
  onSelectRoute,
  selectedRouteId,
  isLoading,
  error,
  locationStatus,
}) {
  return (
    <div className="nearby">
      <header className="sheet-header">
        <h1 className="sheet-header__title">Nearby</h1>
        <p className="sheet-header__subtitle">
          {locationStatus === 'located'
            ? 'Around you'
            : locationStatus === 'locating'
              ? 'Finding your location…'
              : 'Downtown Ottawa · location unavailable'}
        </p>
      </header>

      {error && <p className="notice notice--error">Couldn&apos;t load nearby stops: {error.message}</p>}

      {isLoading && !stops?.length && <p className="notice">Loading stops…</p>}

      {!isLoading && stops?.length === 0 && (
        <p className="notice">No stops within walking distance.</p>
      )}

      <ul className="stop-list">
        {(stops ?? []).map((stop) => (
          <StopCard
            key={stop.stop_id}
            stop={stop}
            arrivals={arrivalsByStop.get(stop.stop_id) ?? null}
            now={now}
            onSelect={onSelectStop}
            onSelectRoute={onSelectRoute}
            selectedRouteId={selectedRouteId}
          />
        ))}
      </ul>
    </div>
  )
}
