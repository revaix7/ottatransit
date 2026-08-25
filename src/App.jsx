import { useCallback, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import BottomSheet from './components/BottomSheet.jsx'
import NearbySheet from './components/NearbySheet.jsx'
import Favorites from './components/Favorites.jsx'
import StopView from './components/StopView.jsx'
import RouteBanner from './components/RouteBanner.jsx'
import { useGeolocation } from './hooks/useGeolocation.js'
import { useNearby } from './hooks/useNearby.js'
import { useStopsInBounds, useRail } from './hooks/useMapStops.js'
import { useArrivalsForStops } from './hooks/useArrivals.js'
import { useVehicles } from './hooks/useVehicles.js'
import { useRouteShapes, useRouteStops } from './hooks/useRouteDetails.js'
import { useNow } from './hooks/useNow.js'
import { routeBackground } from './lib/routeColor.js'

const NEARBY_RADIUS_M = 800

// Countdowns are only fetched for the stops near the top of the list. The rest
// fill in when the user opens them; polling all 25 nearby stops every 15s would
// be a lot of requests for rows that are mostly below the fold.
const STOPS_WITH_COUNTDOWNS = 8

export default function App() {
  const location = useGeolocation()
  const now = useNow()
  const [selectedStopId, setSelectedStopId] = useState(null)
  // The whole descriptor rather than just the id, so the banner and the route
  // line have a name and colour without waiting on another request.
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [sheetHeight, setSheetHeight] = useState(0)
  // Where the map is looking, so the stops drawn on it follow the user around
  // instead of staying pinned to wherever they happened to open the app.
  const [viewport, setViewport] = useState(null)

  const {
    data: stops,
    isLoading,
    error,
    refetch: refetchNearby,
  } = useNearby(location.lat, location.lon, NEARBY_RADIUS_M)

  const countdownStopIds = useMemo(
    () => (stops ?? []).slice(0, STOPS_WITH_COUNTDOWNS).map((stop) => stop.stop_id),
    [stops],
  )
  const { byStop } = useArrivalsForStops(countdownStopIds)

  const { data: areaStops } = useStopsInBounds(viewport)
  const { data: rail } = useRail()

  const { data: allVehicles } = useVehicles()
  const routeId = selectedRoute?.routeId ?? null
  const { data: routeShapes, isLoading: shapesLoading } = useRouteShapes(routeId)
  const { data: routeStops } = useRouteStops(routeId)

  // With no route selected the map shows the whole fleet; with one, only its
  // vehicles. Both come from the same fetch, so switching is instant.
  //
  // Around a quarter of the feed is vehicles reporting no trip — buses
  // deadheading or sitting at a garage. They aren't serving anyone, so they
  // stay off the map the way they do in Transit.
  const vehicles = useMemo(() => {
    const inService = (allVehicles ?? []).filter((vehicle) => vehicle.routeId)
    if (!routeId) return inService
    return inService.filter((vehicle) => vehicle.routeId === routeId)
  }, [allVehicles, routeId])

  const selectedStop = useMemo(
    () => stops?.find((stop) => stop.stop_id === selectedStopId),
    [stops, selectedStopId],
  )

  const clearSelection = useCallback(() => setSelectedStopId(null), [])
  const clearRoute = useCallback(() => setSelectedRoute(null), [])

  return (
    <div className="app" style={{ '--sheet-height': `${sheetHeight}px` }}>
      <MapView
        center={location}
        stops={stops}
        areaStops={areaStops}
        rail={rail}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
        onBoundsChange={setViewport}
        vehicles={vehicles}
        routeShapes={routeId ? routeShapes : null}
        routeStops={routeId ? routeStops : null}
        routeColor={routeId ? routeBackground(selectedRoute.routeColor) : null}
        onSelectRoute={setSelectedRoute}
        bottomInset={sheetHeight}
      />

      <RouteBanner
        route={selectedRoute}
        vehicleCount={vehicles.length}
        isLoading={shapesLoading}
        onClear={clearRoute}
      />

      <BottomSheet onHeightChange={setSheetHeight}>
        {/* Kept mounted while a stop is open so its polling stays warm and
            going back restores the list instantly, scroll position and all. */}
        <div hidden={Boolean(selectedStopId)}>
          <Favorites
            now={now}
            onSelectStop={setSelectedStopId}
            onSelectRoute={setSelectedRoute}
            selectedRouteId={routeId}
          />
          <NearbySheet
            stops={stops}
            arrivalsByStop={byStop}
            now={now}
            onSelectStop={setSelectedStopId}
            onSelectRoute={setSelectedRoute}
            selectedRouteId={routeId}
            isLoading={isLoading}
            error={error}
            onRetry={refetchNearby}
            locationStatus={location.status}
          />
        </div>

        {selectedStopId && (
          <StopView
            stopId={selectedStopId}
            fallbackStop={selectedStop}
            now={now}
            onBack={clearSelection}
            onSelectRoute={setSelectedRoute}
            selectedRouteId={routeId}
          />
        )}
      </BottomSheet>
    </div>
  )
}
