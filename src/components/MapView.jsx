import { useEffect, useRef } from 'react'
// maplibre-gl 6 ships named exports only — there is no default export to import.
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'

// OpenFreeMap serves MapLibre styles and tiles with no key and no sign-up.
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'
const STOPS_SOURCE = 'nearby-stops'

function stopsToGeoJSON(stops) {
  return {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.stop_lon, stop.stop_lat] },
      properties: { stop_id: stop.stop_id, stop_name: stop.stop_name },
    })),
  }
}

/**
 * The dark basemap behind the sheet, with the nearby stops drawn on it. Stops
 * are a GeoJSON source rather than DOM markers so Phase 3 can add hundreds of
 * live vehicles the same way without the DOM falling over.
 */
export default function MapView({ center, stops, selectedStopId, onSelectStop }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const userMarkerRef = useRef(null)
  const loadedRef = useRef(false)
  // The click handler is registered once on the map, so read the current
  // callback through a ref instead of re-registering it on every render.
  const onSelectStopRef = useRef(onSelectStop)
  onSelectStopRef.current = onSelectStop

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [center.lon, center.lat],
      zoom: 14.5,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    // Without a handler MapLibre swallows style and tile failures, which looks
    // identical to a map that is simply still loading.
    map.on('error', (event) => {
      console.error('[map]', event.error?.message ?? event.error ?? event)
    })

    map.on('load', () => {
      map.addSource(STOPS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: STOPS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6],
          'circle-color': '#f5f7fa',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0b0d10',
        },
      })

      map.addLayer({
        id: 'stops-selected',
        type: 'circle',
        source: STOPS_SOURCE,
        filter: ['==', ['get', 'stop_id'], '__none__'],
        paint: {
          'circle-radius': 9,
          'circle-color': '#ffb020',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#0b0d10',
        },
      })

      map.on('click', 'stops-circle', (event) => {
        const feature = event.features?.[0]
        if (feature) onSelectStopRef.current?.(feature.properties.stop_id)
      })
      map.on('mouseenter', 'stops-circle', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'stops-circle', () => {
        map.getCanvas().style.cursor = ''
      })

      loadedRef.current = true
      map.getSource(STOPS_SOURCE).setData(stopsToGeoJSON(stops ?? []))
    })

    return () => {
      loadedRef.current = false
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
    // Built once; the effects below push every later change into the instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nearby stops changed.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    map.getSource(STOPS_SOURCE)?.setData(stopsToGeoJSON(stops ?? []))
  }, [stops])

  // Selection changed — highlight it and bring it into the visible top half of
  // the screen, since the bottom sheet covers the rest.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    map.setFilter('stops-selected', ['==', ['get', 'stop_id'], selectedStopId ?? '__none__'])

    const stop = stops?.find((candidate) => candidate.stop_id === selectedStopId)
    if (stop) {
      map.easeTo({
        center: [stop.stop_lon, stop.stop_lat],
        zoom: Math.max(map.getZoom(), 15.5),
        offset: [0, -map.getContainer().clientHeight * 0.2],
        duration: 500,
      })
    }
  }, [selectedStopId, stops])

  // The user's position: a blue dot, recentred as the fix improves.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!userMarkerRef.current) {
      const element = document.createElement('div')
      element.className = 'user-dot'
      userMarkerRef.current = new Marker({ element })
        .setLngLat([center.lon, center.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat([center.lon, center.lat])
    }
  }, [center.lat, center.lon])

  return <div className="map" ref={containerRef} />
}
