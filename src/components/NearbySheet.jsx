import StopCard from './StopCard.jsx'

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
