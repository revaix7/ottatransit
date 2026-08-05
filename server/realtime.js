// GTFS-Realtime: node-GTFS fetches and decodes the OC Transpo protobuf feeds
// into the same SQLite database as the schedule, so realtime predictions can be
// matched against scheduled times directly.
//
// Each refresh deletes the previous realtime rows before inserting the new
// ones, which leaves a short window where the tables are empty. Requests that
// land in that window would see no vehicles at all, so every successful poll
// takes a snapshot into memory and reads are served from that instead.

import { updateGtfsRealtime, getServiceIdsByDate } from 'gtfs'
import { config, hasRealtimeKey, requireDb } from './gtfs.js'

const POLL_INTERVAL_MS = 15_000

let pollTimer
let lastUpdated = null
let lastError = null
let vehicleSnapshot = []
let predictionIndex = new Map()

function readVehicles() {
  const db = requireDb()
  return db
    .prepare(
      `SELECT vp.vehicle_id,
              vp.trip_id,
              vp.latitude,
              vp.longitude,
              vp.bearing,
              vp.speed,
              vp.timestamp,
              t.route_id,
              t.trip_headsign,
              t.direction_id,
              r.route_short_name,
              r.route_color
         FROM vehicle_positions vp
         LEFT JOIN trips  t ON t.trip_id  = vp.trip_id
         LEFT JOIN routes r ON r.route_id = t.route_id
        WHERE vp.latitude IS NOT NULL
          AND vp.longitude IS NOT NULL`,
    )
    .all()
    .map((row) => ({
      id: row.vehicle_id,
      tripId: row.trip_id,
      routeId: row.route_id,
      routeShortName: row.route_short_name,
      routeColor: row.route_color,
      headsign: row.trip_headsign,
      directionId: row.direction_id,
      lat: row.latitude,
      lon: row.longitude,
      bearing: row.bearing,
      speed: row.speed,
      timestamp: Number(row.timestamp) || null,
    }))
}

/** Predictions keyed by trip + stop, which is how arrivals look them up. */
function readPredictions() {
  const db = requireDb()
  const rows = db
    .prepare(
      `SELECT trip_id, stop_id, arrival_timestamp, departure_timestamp,
              arrival_delay, departure_delay, schedule_relationship
         FROM stop_time_updates`,
    )
    .all()

  const index = new Map()
  for (const row of rows) {
    index.set(`${row.trip_id}|${row.stop_id}`, row)
  }
  return index
}

async function poll() {
  try {
    await updateGtfsRealtime(config)
    vehicleSnapshot = readVehicles()
    predictionIndex = readPredictions()
    lastUpdated = new Date()
    lastError = null
  } catch (error) {
    // Keep the previous snapshot rather than blanking the map — the feed drops
    // out for a few seconds fairly regularly.
    lastError = error.message
    console.error('[realtime] update failed:', error.message)
  }
}

export function startRealtime() {
  if (!hasRealtimeKey) {
    console.warn('[realtime] no API key — skipping feed polling')
    return
  }

  // Seed from whatever the last run left behind so the first requests after a
  // restart aren't empty while the initial poll is still in flight.
  try {
    vehicleSnapshot = readVehicles()
    predictionIndex = readPredictions()
  } catch (error) {
    console.warn('[realtime] could not seed snapshot:', error.message)
  }

  poll()
  pollTimer = setInterval(poll, POLL_INTERVAL_MS)
  pollTimer.unref?.()
}

export function stopRealtime() {
  clearInterval(pollTimer)
  pollTimer = undefined
}

export function realtimeStatus() {
  return {
    lastUpdated,
    lastError,
    polling: Boolean(pollTimer),
    vehicles: vehicleSnapshot.length,
    predictions: predictionIndex.size,
  }
}

/** Live vehicles, optionally narrowed to a single route. */
export function getVehicles(routeId) {
  if (!routeId) return vehicleSnapshot
  return vehicleSnapshot.filter((vehicle) => vehicle.routeId === routeId)
}

/** Midnight local time as a unix timestamp — the base for GTFS seconds-since-midnight. */
function serviceDayStart(now) {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return Math.floor(midnight.getTime() / 1000)
}

/**
 * Upcoming departures at a stop, each with a countdown adjusted by TripUpdates
 * wherever the feed has a prediction for that trip and stop.
 */
export function getStopArrivals(stopId, { limit = 20, now = new Date() } = {}) {
  const db = requireDb()

  const dateKey = Number(
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`,
  )
  const serviceIds = getServiceIdsByDate(dateKey, { db })
  if (serviceIds.length === 0) return []

  const nowEpoch = Math.floor(now.getTime() / 1000)
  const dayStart = serviceDayStart(now)
  const nowSeconds = nowEpoch - dayStart
  const placeholders = serviceIds.map(() => '?').join(',')

  // Look ahead three hours. The upper bound keeps the scan bounded on a table
  // of 2.9M rows; departure_timestamp is a generated column and is indexed.
  const rows = db
    .prepare(
      `SELECT st.trip_id,
              st.departure_time,
              st.departure_timestamp AS scheduled_seconds,
              st.stop_sequence,
              t.route_id,
              t.trip_headsign,
              t.direction_id,
              r.route_short_name,
              r.route_color
         FROM stop_times st
         JOIN trips  t ON t.trip_id  = st.trip_id
         JOIN routes r ON r.route_id = t.route_id
        WHERE st.stop_id = ?
          AND t.service_id IN (${placeholders})
          AND st.departure_timestamp BETWEEN ? AND ?
        ORDER BY st.departure_timestamp
        LIMIT ?`,
    )
    .all(stopId, ...serviceIds, nowSeconds, nowSeconds + 3 * 3600, limit)

  return rows
    .map((row) => {
      const scheduledEpoch = dayStart + row.scheduled_seconds
      const prediction = predictionIndex.get(`${row.trip_id}|${stopId}`)

      const predicted =
        Number(prediction?.departure_timestamp) ||
        Number(prediction?.arrival_timestamp) ||
        null
      const delay = prediction?.departure_delay ?? prediction?.arrival_delay ?? null

      let expectedEpoch = scheduledEpoch
      let isRealtime = false
      if (predicted) {
        expectedEpoch = predicted
        isRealtime = true
      } else if (delay !== null && delay !== undefined) {
        expectedEpoch = scheduledEpoch + delay
        isRealtime = true
      }

      return {
        tripId: row.trip_id,
        routeId: row.route_id,
        routeShortName: row.route_short_name,
        routeColor: row.route_color,
        headsign: row.trip_headsign,
        directionId: row.direction_id,
        scheduledTime: row.departure_time,
        scheduledEpoch,
        expectedEpoch,
        minutes: Math.round((expectedEpoch - nowEpoch) / 60),
        delaySeconds: isRealtime ? expectedEpoch - scheduledEpoch : null,
        isRealtime,
        cancelled: prediction?.schedule_relationship === 'CANCELED',
      }
    })
    .filter((arrival) => arrival.minutes >= 0)
    // The SQL orders by scheduled time; once predictions are applied an early
    // bus can overtake a late one, so re-sort by when it will actually arrive.
    .sort((a, b) => a.expectedEpoch - b.expectedEpoch)
}
