import RoutePill from './RoutePill.jsx'
import Countdown from './Countdown.jsx'
import { useArrivals } from '../hooks/useArrivals.js'
import { formatDistance, formatScheduledTime } from '../lib/departures.js'

/**
 * Every upcoming departure at one stop, refreshed on the 15-second poll that
 * useArrivals sets up. The list the user came from stays mounted behind this,
 * so going back is instant.
 */
export default function StopView({
  stopId,
  fallbackStop,
  now,
  onBack,
  onSelectRoute,
  selectedRouteId,
}) {
  const { data, isLoading, error } = useArrivals(stopId)
  const stop = data?.stop ?? fallbackStop
  const arrivals = data?.arrivals ?? []

  return (
    <div className="stop-view">
      <header className="sheet-header sheet-header--with-back">
        <button type="button" className="back-button" onClick={onBack}>
          <span aria-hidden="true">‹</span> Nearby
        </button>
        <h1 className="sheet-header__title">{stop?.stop_name ?? 'Stop'}</h1>
        <p className="sheet-header__subtitle">
          {stop?.stop_code ? `Stop #${stop.stop_code}` : `Stop ${stopId}`}
          {Number.isFinite(fallbackStop?.distance) ? ` · ${formatDistance(fallbackStop.distance)}` : ''}
        </p>
      </header>

      {error && (
        <p className="notice notice--error">Couldn&apos;t load departures: {error.message}</p>
      )}

      {isLoading && <p className="notice">Loading departures…</p>}

      {!isLoading && !error && arrivals.length === 0 && (
        <p className="notice">Nothing scheduled in the next 3 hours.</p>
      )}

      <ul className="departure-list">
        {arrivals.map((arrival) => (
          <li key={`${arrival.tripId}-${arrival.scheduledEpoch}`}>
            {/* Tapping a departure puts its route on the map, matching what the
                same row does in the nearby list. */}
            <button
              type="button"
              className={`departure-row${
                arrival.routeId === selectedRouteId ? ' departure-row--active' : ''
              }`}
              aria-pressed={arrival.routeId === selectedRouteId}
              onClick={() =>
                onSelectRoute({
                  routeId: arrival.routeId,
                  routeShortName: arrival.routeShortName,
                  routeColor: arrival.routeColor,
                })
              }
            >
              <RoutePill
                shortName={arrival.routeShortName}
                color={arrival.routeColor}
                size="lg"
              />
              <span className="departure-row__text">
                <span className="departure-row__headsign">{arrival.headsign}</span>
                <span className="departure-row__meta">
                  {formatScheduledTime(arrival.scheduledTime)} scheduled
                  {arrival.isRealtime && arrival.delaySeconds !== null
                    ? ` · ${describeDelay(arrival.delaySeconds)}`
                    : ' · no live data'}
                </span>
              </span>
              <Countdown
                expectedEpoch={arrival.expectedEpoch}
                now={now}
                isRealtime={arrival.isRealtime}
                cancelled={arrival.cancelled}
                size="lg"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function describeDelay(delaySeconds) {
  const minutes = Math.round(delaySeconds / 60)
  if (minutes === 0) return 'on time'
  if (minutes > 0) return `${minutes} min late`
  return `${Math.abs(minutes)} min early`
}
