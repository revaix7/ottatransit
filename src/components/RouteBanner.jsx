import RoutePill from './RoutePill.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import { useFavorites, useIsFavoriteRoute } from '../store/favorites.js'

/**
 * The chip that sits above the sheet while a route is selected, naming what the
 * map is currently showing and giving the user a way back out of it.
 */
export default function RouteBanner({ route, vehicleCount, isLoading, onClear }) {
  // Hooks run before the early return below, so they can't sit after it.
  const routeId = route?.routeId ?? null
  const isFavorite = useIsFavoriteRoute(routeId)
  const toggleRoute = useFavorites((state) => state.toggleRoute)

  if (!route) return null

  return (
    <div className="route-banner">
      <RoutePill shortName={route.routeShortName} color={route.routeColor} size="lg" />
      <span className="route-banner__text">
        <span className="route-banner__title">Route {route.routeShortName}</span>
        <span className="route-banner__meta">
          {isLoading
            ? 'Loading route…'
            : vehicleCount === 0
              ? 'No vehicles running right now'
              : `${vehicleCount} ${vehicleCount === 1 ? 'vehicle' : 'vehicles'} live`}
        </span>
      </span>
      <FavoriteStar
        active={isFavorite}
        onToggle={() => toggleRoute(routeId)}
        label={`route ${route.routeShortName}`}
      />
      <button
        type="button"
        className="route-banner__clear"
        onClick={onClear}
        aria-label="Clear selected route"
      >
        ✕
      </button>
    </div>
  )
}
