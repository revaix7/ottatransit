// Vite proxies /api to the Express server on port 3000 in dev.

export async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText} — ${url} ${detail}`.trim())
  }
  return response.json()
}

/**
 * GPS drifts by a few metres constantly. Rounding the coordinates that go into
 * the query key stops every jitter from invalidating the nearby-stops cache;
 * 4 decimal places is roughly 11 m.
 */
export function roundCoord(value) {
  return Math.round(value * 10_000) / 10_000
}
