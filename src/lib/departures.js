/**
 * Group a stop's departures the way Transit's nearby screen does: one line per
 * route *and direction*, since a 7 westbound and a 7 eastbound at the same stop
 * are two different things to wait for. Groups are ordered by whichever is
 * coming first.
 */
export function groupByRouteDirection(arrivals, { perGroup = 2 } = {}) {
  const groups = new Map()

  for (const arrival of arrivals) {
    if (arrival.cancelled) continue
    const key = `${arrival.routeId}|${arrival.headsign ?? ''}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        routeId: arrival.routeId,
        routeShortName: arrival.routeShortName,
        routeColor: arrival.routeColor,
        headsign: arrival.headsign,
        departures: [],
      }
      groups.set(key, group)
    }
    if (group.departures.length < perGroup) group.departures.push(arrival)
  }

  return [...groups.values()].sort(
    (a, b) => a.departures[0].expectedEpoch - b.departures[0].expectedEpoch,
  )
}

/** Metres for anything close by, kilometres once that gets unwieldy. */
export function formatDistance(metres) {
  if (metres < 1000) return `${metres} m`
  return `${(metres / 1000).toFixed(1)} km`
}

/** "11:34:36" (GTFS can exceed 24h for after-midnight trips) → "11:34". */
export function formatScheduledTime(gtfsTime) {
  if (typeof gtfsTime !== 'string') return ''
  const [hours, minutes] = gtfsTime.split(':')
  return `${String(Number(hours) % 24).padStart(2, '0')}:${minutes}`
}
