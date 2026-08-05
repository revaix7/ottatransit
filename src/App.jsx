import { useCallback, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import BottomSheet from './components/BottomSheet.jsx'
import NearbySheet from './components/NearbySheet.jsx'
import StopView from './components/StopView.jsx'
import { useGeolocation } from './hooks/useGeolocation.js'
import { useNearby } from './hooks/useNearby.js'
import { useArrivalsForStops } from './hooks/useArrivals.js'
import { useNow } from './hooks/useNow.js'

const NEARBY_RADIUS_M = 800

// Countdowns are only fetched for the stops near the top of the list. The rest
// fill in when the user opens them; polling all 25 nearby stops every 15s would
// be a lot of requests for rows that are mostly below the fold.
const STOPS_WITH_COUNTDOWNS = 8

export default function App() {
  const location = useGeolocation()
  const now = useNow()
  const [selectedStopId, setSelectedStopId] = useState(null)
  const [sheetHeight, setSheetHeight] = useState(0)

  const { data: stops, isLoading, error } = useNearby(location.lat, location.lon, NEARBY_RADIUS_M)

  const countdownStopIds = useMemo(
    () => (stops ?? []).slice(0, STOPS_WITH_COUNTDOWNS).map((stop) => stop.stop_id),
    [stops],
  )
  const { byStop } = useArrivalsForStops(countdownStopIds)

  const selectedStop = useMemo(
    () => stops?.find((stop) => stop.stop_id === selectedStopId),
    [stops, selectedStopId],
  )

  const clearSelection = useCallback(() => setSelectedStopId(null), [])

  return (
    <div className="app" style={{ '--sheet-height': `${sheetHeight}px` }}>
      <MapView
        center={location}
        stops={stops}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
      />

      <BottomSheet onHeightChange={setSheetHeight}>
        {/* Kept mounted while a stop is open so its polling stays warm and
            going back restores the list instantly, scroll position and all. */}
        <div hidden={Boolean(selectedStopId)}>
          <NearbySheet
            stops={stops}
            arrivalsByStop={byStop}
            now={now}
            onSelectStop={setSelectedStopId}
            isLoading={isLoading}
            error={error}
            locationStatus={location.status}
          />
        </div>

        {selectedStopId && (
          <StopView
            stopId={selectedStopId}
            fallbackStop={selectedStop}
            now={now}
            onBack={clearSelection}
          />
        )}
      </BottomSheet>
    </div>
  )
}
