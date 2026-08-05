// GTFS static (node-GTFS): import the feed into SQLite and query stops,
// routes, shapes, and scheduled times.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import { importGtfs, openDb, getRoutes, getShapesAsGeoJSON } from 'gtfs'

const serverDir = import.meta.dirname
const repoRoot = path.join(serverDir, '..')

// The key lives in server/.env, but the server is started from the repo root —
// dotenv's default cwd lookup would miss it, so point at the file directly.
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true })

const baseConfig = JSON.parse(
  await readFile(path.join(serverDir, 'config.json'), 'utf8'),
)

// OC Transpo's GTFS-Realtime feeds sit behind an Azure API Management gateway.
// Only VehiclePositions and TripUpdates are published — there is no Alerts feed.
const RT_BASE = 'https://nextrip-public-api.azure-api.net/octranspo'
const apiKey = process.env.OC_TRANSPO_API_KEY

export const hasRealtimeKey = Boolean(apiKey)

function realtimeFeeds() {
  if (!apiKey) return {}
  const headers = { 'Ocp-Apim-Subscription-Key': apiKey }
  return {
    realtimeVehiclePositions: {
      url: `${RT_BASE}/gtfs-rt-vp/beta/v1/VehiclePositions?format=protobuf`,
      headers,
    },
    realtimeTripUpdates: {
      url: `${RT_BASE}/gtfs-rt-tp/beta/v1/TripUpdates?format=protobuf`,
      headers,
    },
  }
}

// Paths in config.json are relative, so resolve them against the repo root and
// the server works no matter which directory it was started from. The API key
// is injected here rather than stored in config.json, which is committed.
export const config = {
  ...baseConfig,
  sqlitePath: path.resolve(repoRoot, baseConfig.sqlitePath),
  agencies: baseConfig.agencies.map((agency) => ({
    ...agency,
    path: path.resolve(repoRoot, agency.path),
    ...realtimeFeeds(),
  })),
}

let db

/**
 * Open the SQLite database, importing the GTFS zip first if that hasn't
 * happened yet. The import reads a 146 MB stop_times.txt and takes several
 * minutes, so it only runs when the database file is missing.
 */
export async function initGtfs() {
  if (db) return db

  if (!existsSync(config.sqlitePath)) {
    console.log('[gtfs] no database found — importing feed (takes a few minutes)')
    await importGtfs(config)
    console.log('[gtfs] import complete')
  }

  db = openDb(config)
  return db
}

function requireDb() {
  if (!db) throw new Error('initGtfs() must be awaited before querying')
  return db
}

const toRadians = (deg) => (deg * Math.PI) / 180

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** All routes, with the colour the agency assigns each one. */
export function getAllRoutes() {
  const database = requireDb()
  return getRoutes(
    {},
    ['route_id', 'route_short_name', 'route_long_name', 'route_color', 'route_type'],
    [['route_short_name', 'ASC']],
    { db: database },
  )
}

/**
 * Stops within `radiusMeters` of a point, nearest first, each with the routes
 * serving it. A bounding box narrows the candidates in SQL, then a real
 * great-circle distance filters and sorts them.
 */
export function getNearbyStops(lat, lon, radiusMeters = 800, limit = 25) {
  const database = requireDb()

  // 1 degree of latitude is ~111.32 km; longitude shrinks with cos(latitude).
  const latDelta = radiusMeters / 111320
  const lonDelta = radiusMeters / (111320 * Math.cos(toRadians(lat)))

  const candidates = database
    .prepare(
      `SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon
         FROM stops
        WHERE stop_lat BETWEEN ? AND ?
          AND stop_lon BETWEEN ? AND ?`,
    )
    .all(lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta)

  const nearby = candidates
    .map((stop) => ({
      ...stop,
      distance: Math.round(haversineMeters(lat, lon, stop.stop_lat, stop.stop_lon)),
    }))
    .filter((stop) => stop.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)

  const routesAtStop = database.prepare(
    `SELECT DISTINCT r.route_id, r.route_short_name, r.route_color, r.route_type
       FROM stop_times st
       JOIN trips t  ON t.trip_id  = st.trip_id
       JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id = ?
      ORDER BY r.route_short_name`,
  )

  return nearby.map((stop) => ({
    ...stop,
    routes: routesAtStop.all(stop.stop_id),
  }))
}

/** GeoJSON LineStrings for every shape the route uses. */
export function getRouteShapes(routeId) {
  const database = requireDb()
  return getShapesAsGeoJSON({ route_id: routeId }, { db: database })
}

/** A single stop, or undefined if the id is unknown. */
export function getStopById(stopId) {
  return requireDb()
    .prepare(
      'SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?',
    )
    .get(stopId)
}

export { requireDb }
