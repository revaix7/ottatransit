// Vite proxies /api to the Express server in dev; the port comes from
// server/.env, which vite.config.js reads so the two cannot drift apart.

export async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText} — ${url} ${detail}`.trim())
  }
  return response.json()
}

/**
 * GPS drifts by a few metres constantly, and so does a map under a finger.
 * Rounding the coordinates that go into a query key stops every jitter from
 * invalidating the cached response. The default of 10,000 is 4 decimal places,
 * roughly 11 m — right for a GPS fix; viewport boxes pass something coarser.
 */
export function roundCoord(value, scale = 10_000) {
  return Math.round(value * scale) / scale
}
