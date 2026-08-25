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
const RAIL_LINE_SOURCE = 'rail-lines'
const RAIL_STATION_SOURCE = 'rail-stations'
const VEHICLES_SOURCE = 'vehicles'

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

// At bus speed, 20fps is indistinguishable from 60 and costs a third as much
// when the entire fleet is on screen.
const FRAME_MS = 50
// A vehicle whose last report is this old is drawn faded rather than dropped —
// the feed skips individual buses for a minute or two fairly often.
const STALE_AFTER_S = 300
// How quickly a dot closes the gap to where dead reckoning says it should be.
// Long enough that a corrected report slides in rather than snapping, short
// enough that the lag it introduces is a few metres.
const SMOOTHING_TAU_MS = 1500
// Dead reckoning follows a dead-straight line, and a straight line stops
// resembling a bus route within a block or two — so the distance it is allowed
// to travel is bounded twice over.
//
// The projection decays toward an asymptote of speed x TAU instead of growing
// with elapsed time, and is then hard-capped. Without these, a median report
// (69s old, 11.6 m/s) was drawn 724m from where the bus actually was, the worst
// offender 2.5km — which is how buses ended up mid-river, sailing straight on
// where the road they were last seen on turns.
const PROJECTION_TAU_S = 15
const MAX_PROJECTION_M = 150
// Below this the vehicle is treated as parked and drawn where it reported.
const MIN_SPEED_MS = 0.5

const M_PER_DEG_LAT = 111320

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

/** O-Train stations, carrying the lines that call there so a dot can be coloured. */
function stationsToGeoJSON(stations) {
  return {
    type: 'FeatureCollection',
    features: (stations ?? []).map((station) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.stop_lon, station.stop_lat] },
      properties: {
        stop_id: station.stop_id,
        stop_name: station.stop_name,
        color: routeBackground(station.color),
        label: station.name,
      },
    })),
  }
}

/** Rail LineStrings recoloured from bare GTFS hex to something MapLibre accepts. */
function railLinesToGeoJSON(lines) {
  return {
    type: 'FeatureCollection',
    features: (lines?.features ?? []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        color: routeBackground(feature.properties?.route_color),
      },
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

/**
 * Where a vehicle should be by now, given where it last reported and how fast it
 * was going.
 *
 * OC Transpo republishes VehiclePositions only about once a minute, and each
 * report is already ~40s old when it arrives. Drawing the raw coordinates leaves
 * every dot motionless for most of each cycle, so instead the reported bearing
 * and speed carry it forward between reports and the next report corrects the
 * guess.
 */
function projectPosition(vehicle, nowSeconds) {
  const { lat, lon, bearing, speed, timestamp } = vehicle
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const reported = [lon, lat]
  if (!Number.isFinite(speed) || speed < MIN_SPEED_MS) return reported
  if (!Number.isFinite(bearing) || !Number.isFinite(timestamp)) return reported

  const elapsed = Math.max(nowSeconds - timestamp, 0)
  if (elapsed === 0) return reported

  // Equirectangular is exact to within centimetres over the couple of hundred
  // metres this projects, and costs a fraction of a great-circle step per frame.
  const distance = Math.min(
    speed * PROJECTION_TAU_S * (1 - Math.exp(-elapsed / PROJECTION_TAU_S)),
    MAX_PROJECTION_M,
  )
  const radians = (bearing * Math.PI) / 180
  const dLat = (distance * Math.cos(radians)) / M_PER_DEG_LAT
  const dLon =
    (distance * Math.sin(radians)) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

  return [lon + dLon, lat + dLat]
}

/** Dead-reckoned positions keyed by vehicle id, dropping anything unplottable. */
function projectAll(vehicles, nowSeconds) {
  const positions = new Map()
  for (const vehicle of vehicles ?? []) {
    const at = projectPosition(vehicle, nowSeconds)
    if (at) positions.set(vehicle.id, at)
  }
  return positions
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
  areaStops,
  rail,
  selectedStopId,
  onSelectStop,
  onBoundsChange,
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
  const onBoundsChangeRef = useRef(onBoundsChange)
  onBoundsChangeRef.current = onBoundsChange

  // The animation runs outside React: the latest fetch, and where each vehicle
  // is currently drawn.
  const vehiclesRef = useRef(vehicles)
  const drawnRef = useRef(new Map())

  // Props the load handler needs to replay once the style is ready.
  const pendingRef = useRef({})
  pendingRef.current = {
    stops,
    areaStops,
    rail,
    routeShapes,
    routeStops,
    routeColor,
    selectedStopId,
  }

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
      // Layers are added bottom-up: rail sits under the selected route, which
      // sits under the stops, and the live fleet sits above everything.
      map.addSource(RAIL_LINE_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      map.addLayer({
        id: 'rail-line-casing',
        type: 'line',
        source: RAIL_LINE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0b0d10',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 16, 11],
          'line-opacity': 0.9,
        },
      })

      map.addLayer({
        id: 'rail-line',
        type: 'line',
        source: RAIL_LINE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 16, 6],
        },
      })

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

      map.addSource(RAIL_STATION_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

      // Stations read as stations rather than as another bus stop: bigger, in
      // the line colour, with a white core.
      map.addLayer({
        id: 'rail-station-circle',
        type: 'circle',
        source: RAIL_STATION_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 6, 16, 8],
          'circle-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 16, 3.5],
          'circle-stroke-color': ['get', 'color'],
        },
      })

      map.addLayer({
        id: 'rail-station-label',
        type: 'symbol',
        source: RAIL_STATION_SOURCE,
        minzoom: 12,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': '#e8ecf2',
          'text-halo-color': '#0b0d10',
          'text-halo-width': 1.5,
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

      map.on('click', 'rail-station-circle', (event) => {
        const feature = event.features?.[0]
        if (feature) onSelectStopRef.current?.(feature.properties.stop_id)
      })

      for (const layer of ['stops-circle', 'vehicles-circle', 'rail-station-circle']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      // Which stops to fetch depends on where the map is looking, so every
      // settled move reports the viewport back up. moveend covers panning,
      // zooming and the programmatic easeTo/fitBounds calls below alike.
      const reportBounds = () => {
        const bounds = map.getBounds()
        onBoundsChangeRef.current?.({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
          zoom: map.getZoom(),
        })
      }
      map.on('moveend', reportBounds)
      reportBounds()

      loadedRef.current = true

      // Anything that arrived while the style was loading.
      const pending = pendingRef.current
      map.getSource(RAIL_LINE_SOURCE).setData(railLinesToGeoJSON(pending.rail?.lines))
      map.getSource(RAIL_STATION_SOURCE).setData(stationsToGeoJSON(pending.rail?.stations))
      map.getSource(STOPS_SOURCE).setData(stopsToGeoJSON(pending.areaStops ?? pending.stops))
      map.getSource(ROUTE_STOPS_SOURCE).setData(stopsToGeoJSON(pending.routeStops))
      map.getSource(ROUTE_LINE_SOURCE).setData(pending.routeShapes ?? EMPTY_COLLECTION)
      if (pending.routeColor) {
        map.setPaintProperty('route-line', 'line-color', pending.routeColor)
      }
      // The first fetch usually beats the style. Seeding the drawn positions
      // here means the animation loop starts from real coordinates instead of
      // easing the whole fleet in from wherever it first saw them.
      const seededAt = Date.now() / 1000
      drawnRef.current = projectAll(vehiclesRef.current, seededAt)
      map.getSource(VEHICLES_SOURCE).setData(
        vehiclesToGeoJSON(vehiclesRef.current, drawnRef.current, seededAt),
      )
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

  // The stops layer draws everything in the viewport once the map is zoomed in
  // far enough to fetch them, and falls back to the nearby list — which is only
  // ever the 25 closest — when it is zoomed out past that.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    map.getSource(STOPS_SOURCE)?.setData(stopsToGeoJSON(areaStops ?? stops))
  }, [areaStops, stops])

  // The rail network is static, so this runs once whenever the fetch lands.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    map.getSource(RAIL_LINE_SOURCE)?.setData(railLinesToGeoJSON(rail?.lines))
    map.getSource(RAIL_STATION_SOURCE)?.setData(stationsToGeoJSON(rail?.stations))
  }, [rail])

  // Selection changed — highlight it and bring it into the visible top half of
  // the screen, since the bottom sheet covers the rest.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    map.setFilter('stops-selected', ['==', ['get', 'stop_id'], selectedStopId ?? '__none__'])

    // The selection can come from the sheet (nearby), from a dot anywhere on
    // screen, or from a station, so all three are searched for its coordinates.
    const stop =
      stops?.find((candidate) => candidate.stop_id === selectedStopId) ??
      areaStops?.find((candidate) => candidate.stop_id === selectedStopId) ??
      rail?.stations?.find((station) => station.stop_id === selectedStopId)
    if (stop) {
      map.easeTo({
        center: [stop.stop_lon, stop.stop_lat],
        zoom: Math.max(map.getZoom(), 15.5),
        offset: [0, -map.getContainer().clientHeight * 0.2],
        duration: 500,
      })
    }
  }, [selectedStopId, stops, areaStops, rail])

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

  // New data from the feed. The animation loop below picks it up on its next
  // frame; dots that dropped out of the feed stop being drawn.
  useEffect(() => {
    vehiclesRef.current = vehicles
    const live = new Set((vehicles ?? []).map((vehicle) => vehicle.id))
    for (const id of drawnRef.current.keys()) {
      if (!live.has(id)) drawnRef.current.delete(id)
    }
  }, [vehicles])

  // The fleet animates on its own clock rather than on the fetch cycle, because
  // four out of five fetches carry coordinates identical to the last one. Every
  // frame each dot is redrawn where dead reckoning puts it by now, eased toward
  // that estimate so a correction slides into place instead of snapping.
  useEffect(() => {
    const reduced = prefersReducedMotion()
    let frame = requestAnimationFrame(tick)
    let lastDraw = 0

    function tick(time) {
      frame = requestAnimationFrame(tick)

      const map = mapRef.current
      if (!map || !loadedRef.current) return
      if (time - lastDraw < FRAME_MS) return

      const source = map.getSource(VEHICLES_SOURCE)
      if (!source) return

      const elapsed = lastDraw ? time - lastDraw : FRAME_MS
      lastDraw = time

      const nowSeconds = Date.now() / 1000
      // The fraction of the remaining gap to close this frame, derived from the
      // real frame time so the easing looks the same at 20fps or 60.
      const alpha = reduced ? 1 : 1 - Math.exp(-elapsed / SMOOTHING_TAU_MS)

      const positions = new Map()
      for (const vehicle of vehiclesRef.current ?? []) {
        const target = projectPosition(vehicle, nowSeconds)
        if (!target) continue

        // A vehicle seen for the first time has nowhere to ease from, so it
        // simply appears where it is.
        const drawn = drawnRef.current.get(vehicle.id)
        positions.set(
          vehicle.id,
          drawn
            ? [
                drawn[0] + (target[0] - drawn[0]) * alpha,
                drawn[1] + (target[1] - drawn[1]) * alpha,
              ]
            : target,
        )
      }

      drawnRef.current = positions
      source.setData(vehiclesToGeoJSON(vehiclesRef.current, positions, nowSeconds))
    }

    return () => cancelAnimationFrame(frame)
  }, [])

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
