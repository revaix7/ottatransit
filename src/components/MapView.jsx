import { useEffect, useRef } from 'react'
// Pinned to maplibre-gl 5.x. In 6.1.0 (currently `latest` on npm) the map never
// finishes loading its style: `load` never fires and no tiles are ever
// requested, so nothing renders. Reproduced with a bare 15-line map, both
// bundled and straight from a CDN, headless and headed. 5.x loads the same
// style in under three seconds. The UMD build is what npm ships as the package
// entry, so this is a default import.
import maplibregl from 'maplibre-gl'
import { routeBackground, routeForeground } from '../lib/routeColor.js'

const { Map: MapLibreMap, LngLatBounds, Marker, NavigationControl } = maplibregl

// OpenFreeMap serves MapLibre styles and tiles with no key and no sign-up.
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'

const STOPS_SOURCE = 'nearby-stops'
const ROUTE_LINE_SOURCE = 'route-line'
const ROUTE_STOPS_SOURCE = 'route-stops'
const VEHICLES_SOURCE = 'vehicles'

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

// Vehicles are interpolated across roughly one poll interval, so the dots drift
// continuously instead of teleporting once every fetch. Finishing just before
// the next response lands keeps them moving without a visible stall.
const TWEEN_MS = 11_000
// At bus speed, 20fps is indistinguishable from 60 and costs a third as much
// when the entire fleet is on screen.
const FRAME_MS = 50
// A vehicle whose last report is this old is drawn faded rather than dropped —
// the feed skips individual buses for a minute or two fairly often.
const STALE_AFTER_S = 300

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function stopsToGeoJSON(stops) {
  return {
    type: 'FeatureCollection',
    features: (stops ?? []).map((stop) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.stop_lon, stop.stop_lat] },
      properties: { stop_id: stop.stop_id, stop_name: stop.stop_name },
    })),
  }
}

/** Vehicle features drawn at `positions` rather than at their reported coordinates. */
function vehiclesToGeoJSON(vehicles, positions, nowSeconds) {
  return {
    type: 'FeatureCollection',
    features: (vehicles ?? []).map((vehicle) => {
      const color = routeBackground(vehicle.routeColor)
      const at = positions.get(vehicle.id) ?? [vehicle.lon, vehicle.lat]
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: at },
        properties: {
          id: vehicle.id,
          routeId: vehicle.routeId ?? '',
          label: vehicle.routeShortName ?? '',
          color,
          textColor: routeForeground(color),
          stale: Boolean(vehicle.timestamp) && nowSeconds - vehicle.timestamp > STALE_AFTER_S,
        },
      }
    }),
  }
}

/** Reported coordinates keyed by vehicle id, dropping anything unplottable. */
function positionsOf(vehicles) {
  return new Map(
    (vehicles ?? [])
      .filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon))
      .map((vehicle) => [vehicle.id, [vehicle.lon, vehicle.lat]]),
  )
}

function boundsOf(featureCollection) {
  const bounds = new LngLatBounds()
  for (const feature of featureCollection?.features ?? []) {
    const { type, coordinates } = feature.geometry ?? {}
    if (type === 'LineString') {
      for (const coord of coordinates) bounds.extend(coord)
    } else if (type === 'MultiLineString') {
      for (const line of coordinates) for (const coord of line) bounds.extend(coord)
    }
  }
  return bounds.isEmpty() ? null : bounds
}

/**
 * The dark basemap behind the sheet. Everything on it — nearby stops, the
 * selected route's line and stops, and the live fleet — is a GeoJSON source
 * rather than DOM markers, so several hundred moving vehicles cost one source
 * update per frame instead of hundreds of style recalculations.
 */
export default function MapView({
  center,
  stops,
  selectedStopId,
  onSelectStop,
  vehicles,
  routeShapes,
  routeStops,
  routeColor,
  onSelectRoute,
  bottomInset = 0,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const userMarkerRef = useRef(null)
  const loadedRef = useRef(false)

  // Handlers are registered once on the map, so the current callbacks are read
  // through refs instead of re-registering on every render.
  const onSelectStopRef = useRef(onSelectStop)
  onSelectStopRef.current = onSelectStop
  const onSelectRouteRef = useRef(onSelectRoute)
  onSelectRouteRef.current = onSelectRoute

  // The animation runs outside React: the latest fetch, where each vehicle is
  // currently drawn, and the in-flight tween.
  const vehiclesRef = useRef(vehicles)
  const drawnRef = useRef(new Map())
  const tweenRef = useRef(null)

  // Props the load handler needs to replay once the style is ready.
  const pendingRef = useRef({})
  pendingRef.current = { stops, routeShapes, routeStops, routeColor, selectedStopId }

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [center.lon, center.lat],
      zoom: 14.5,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    // A handle on the map from the devtools console. Vite evaluates this away
    // in production builds.
    if (import.meta.env.DEV) window.__map = map

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    // Without a handler MapLibre swallows style and tile failures, which looks
    // identical to a map that is simply still loading.
    map.on('error', (event) => {
      console.error('[map]', event.error?.message ?? event.error ?? event)
    })

    map.on('load', () => {
      // Layers are added bottom-up: the route line sits under the stops, and
      // the live fleet sits above everything.
      map.addSource(ROUTE_LINE_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      // A dark casing under the coloured line keeps it legible where it crosses
      // roads of a similar brightness.
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: ROUTE_LINE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0b0d10',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 12],
          'line-opacity': 0.85,
        },
      })

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_LINE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#5a6272',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 7],
        },
      })

      map.addSource(STOPS_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: STOPS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6],
          'circle-color': '#f5f7fa',
          'circle-opacity': 1,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0b0d10',
        },
      })

      map.addSource(ROUTE_STOPS_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      map.addLayer({
        id: 'route-stops-circle',
        type: 'circle',
        source: ROUTE_STOPS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 5],
          'circle-color': '#ffffff',
          'circle-stroke-width': 1.5,
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

      map.addSource(VEHICLES_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      map.addLayer({
        id: 'vehicles-circle',
        type: 'circle',
        source: VEHICLES_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 9, 16, 13],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'stale'], 0.4, 1],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#0b0d10',
        },
      })

      // The route number only fits inside the dot once it is big enough to hold
      // it. Overlap is allowed so a dot never silently loses its number in a
      // busy corridor.
      map.addLayer({
        id: 'vehicles-label',
        type: 'symbol',
        source: VEHICLES_SOURCE,
        minzoom: 12.5,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 9, 16, 12],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': ['get', 'textColor'],
          'text-opacity': ['case', ['get', 'stale'], 0.5, 1],
        },
      })

      map.on('click', 'stops-circle', (event) => {
        const feature = event.features?.[0]
        if (feature) onSelectStopRef.current?.(feature.properties.stop_id)
      })

      // Tapping a bus is the fastest way to ask "where does this one go?".
      map.on('click', 'vehicles-circle', (event) => {
        const routeId = event.features?.[0]?.properties?.routeId
        if (routeId) onSelectRouteRef.current?.(routeId)
      })

      for (const layer of ['stops-circle', 'vehicles-circle']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      loadedRef.current = true

      // Anything that arrived while the style was loading.
      const pending = pendingRef.current
      map.getSource(STOPS_SOURCE).setData(stopsToGeoJSON(pending.stops))
      map.getSource(ROUTE_STOPS_SOURCE).setData(stopsToGeoJSON(pending.routeStops))
      map.getSource(ROUTE_LINE_SOURCE).setData(pending.routeShapes ?? EMPTY_COLLECTION)
      if (pending.routeColor) {
        map.setPaintProperty('route-line', 'line-color', pending.routeColor)
      }
      // The first fetch usually beats the style, so seed the drawn positions
      // here as well as painting them. Without the seed the next poll would
      // have nowhere to animate from and the fleet would sit still for a whole
      // cycle before it started moving.
      drawnRef.current = positionsOf(vehiclesRef.current)
      map.getSource(VEHICLES_SOURCE).setData(
        vehiclesToGeoJSON(vehiclesRef.current, drawnRef.current, Date.now() / 1000),
      )
    })

    return () => {
      loadedRef.current = false
      if (tweenRef.current) cancelAnimationFrame(tweenRef.current.frame)
      tweenRef.current = null
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
    map.getSource(STOPS_SOURCE)?.setData(stopsToGeoJSON(stops))
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

  // The selected route's line and the stops it calls at. Nearby stops fade back
  // while a route is up so the route's own stops are the ones that read.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const hasRoute = Boolean(routeShapes?.features?.length)
    map.getSource(ROUTE_LINE_SOURCE)?.setData(routeShapes ?? EMPTY_COLLECTION)
    map.setPaintProperty('route-line', 'line-color', routeColor ?? '#5a6272')
    map.setPaintProperty('stops-circle', 'circle-opacity', hasRoute ? 0.25 : 1)
  }, [routeShapes, routeColor])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    map.getSource(ROUTE_STOPS_SOURCE)?.setData(stopsToGeoJSON(routeStops))
  }, [routeStops])

  // Frame the whole route when one is picked, leaving room for the sheet.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const bounds = boundsOf(routeShapes)
    if (!bounds) return

    const height = map.getContainer().clientHeight
    map.fitBounds(bounds, {
      padding: {
        top: 56,
        left: 32,
        right: 32,
        bottom: Math.min(bottomInset + 24, height * 0.6),
      },
      maxZoom: 15,
      duration: 700,
    })
    // Refitting on every sheet drag would fight the user; only a new route
    // should reframe the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeShapes])

  // Live vehicles: retarget the tween at the new positions, starting from
  // wherever each dot happens to be right now.
  useEffect(() => {
    vehiclesRef.current = vehicles
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const source = map.getSource(VEHICLES_SOURCE)
    if (!source) return

    const targets = positionsOf(vehicles)

    if (tweenRef.current) cancelAnimationFrame(tweenRef.current.frame)

    const draw = (positions) => {
      drawnRef.current = positions
      source.setData(vehiclesToGeoJSON(vehiclesRef.current, positions, Date.now() / 1000))
    }

    if (prefersReducedMotion()) {
      tweenRef.current = null
      draw(targets)
      return
    }

    // A vehicle seen for the first time has no previous position to leave from,
    // so it simply appears where it is.
    const origins = new Map()
    for (const [id, target] of targets) {
      origins.set(id, drawnRef.current.get(id) ?? target)
    }

    const start = performance.now()
    let lastFrame = 0

    const step = (time) => {
      const progress = Math.min((time - start) / TWEEN_MS, 1)

      if (time - lastFrame >= FRAME_MS || progress === 1) {
        lastFrame = time
        const positions = new Map()
        for (const [id, target] of targets) {
          const from = origins.get(id)
          positions.set(id, [
            from[0] + (target[0] - from[0]) * progress,
            from[1] + (target[1] - from[1]) * progress,
          ])
        }
        draw(positions)
      }

      if (progress < 1) {
        tweenRef.current.frame = requestAnimationFrame(step)
      } else {
        tweenRef.current = null
      }
    }

    tweenRef.current = { frame: requestAnimationFrame(step) }
  }, [vehicles])

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
