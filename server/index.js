import express from 'express'
import cors from 'cors'
import {
  initGtfs,
  hasRealtimeKey,
  getAllRoutes,
  getNearbyStops,
  getStopsInBounds,
  getRailNetwork,
  getRouteShapes,
  getRouteStops,
  getStopById,
} from './gtfs.js'
import {
  startRealtime,
  getVehicles,
  getStopArrivals,
  realtimeStatus,
} from './realtime.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true, realtime: hasRealtimeKey, feed: realtimeStatus() })
})

app.get('/api/routes', (req, res) => {
  res.json(getAllRoutes())
})

app.get('/api/stops/nearby', (req, res) => {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon are required numbers' })
  }
  const radius = Number(req.query.radius) || 800
  res.json(getNearbyStops(lat, lon, radius))
})

// Everything the map is currently looking at. The nearby endpoint above backs
// the list in the sheet and is deliberately capped at 25; the map needs whatever
// is on screen, however far that is from the user.
app.get('/api/stops/in-bounds', (req, res) => {
  const bounds = {
    south: Number(req.query.south),
    west: Number(req.query.west),
    north: Number(req.query.north),
    east: Number(req.query.east),
  }
  if (!Object.values(bounds).every(Number.isFinite)) {
    return res.status(400).json({ error: 'south, west, north and east are required numbers' })
  }
  res.json(getStopsInBounds(bounds))
})

// The O-Train lines and stations, from the static feed. Kept separate from
// /api/shapes/:routeId because rail is drawn permanently rather than only while
// its route is selected.
app.get('/api/rail', (req, res) => {
  res.json(getRailNetwork())
})

app.get('/api/stops/:id/arrivals', (req, res) => {
  const stop = getStopById(req.params.id)
  if (!stop) return res.status(404).json({ error: 'unknown stop' })
  res.json({ stop, arrivals: getStopArrivals(req.params.id) })
})

app.get('/api/vehicles', (req, res) => {
  res.json(getVehicles(req.query.routeId))
})

app.get('/api/shapes/:routeId', (req, res) => {
  res.json(getRouteShapes(req.params.routeId))
})

// Backs the map's stop highlighting when a route is selected.
app.get('/api/routes/:routeId/stops', (req, res) => {
  res.json(getRouteStops(req.params.routeId))
})

// OC Transpo's developer portal publishes VehiclePositions and TripUpdates
// only — there is no Alerts feed. The route exists so the frontend contract
// holds if one is added later.
app.get('/api/alerts', (req, res) => {
  res.json([])
})

// Trip planning (/api/plan) proxies to OpenTripPlanner in Phase 5.

// Express identifies error middleware by arity, so the fourth parameter has to
// stay even though it is unused.
app.use((err, req, res, _next) => {
  console.error('[server]', err)
  res.status(500).json({ error: err.message })
})

await initGtfs()
startRealtime()

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
  if (!hasRealtimeKey) {
    console.warn('[server] OC_TRANSPO_API_KEY missing — realtime endpoints will be empty')
  }
})
