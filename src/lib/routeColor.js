// GTFS route_color is a bare 6-digit hex with no '#', and agencies leave it
// blank often enough that every read needs a fallback.

const FALLBACK = '#5a6272'

export function routeBackground(routeColor) {
  if (typeof routeColor !== 'string') return FALLBACK
  const hex = routeColor.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return FALLBACK
  return `#${hex}`
}

/**
 * Black or white text, whichever the WCAG relative luminance of the background
 * calls for. OC Transpo ships white (FFFFFF) on some routes and dark blue on
 * others, so this cannot be hard-coded either way.
 */
export function routeForeground(background) {
  const hex = background.replace(/^#/, '')
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  return luminance > 0.45 ? '#0b0d10' : '#ffffff'
}

/** GTFS route_type 0–2 are the rail modes; OC Transpo uses 2 for the O-Train. */
export function isRail(routeType) {
  return routeType === 0 || routeType === 1 || routeType === 2
}
