import StopCard from './StopCard.jsx'
import EmptyState from './EmptyState.jsx'
import { SkeletonStopList } from './Skeleton.jsx'

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
  onRetry,
  locationStatus,
}) {
  const isEmpty = !isLoading && !error && stops?.length === 0

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

      {error && (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Couldn't load nearby stops"
          detail={error.message}
          action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
        />
      )}

      {isLoading && !stops?.length && <SkeletonStopList />}

      {isEmpty && (
        <EmptyState
          icon="🚏"
          title="No stops within walking distance"
          detail="Pan the map to somewhere with service, or check your location permission."
        />
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
