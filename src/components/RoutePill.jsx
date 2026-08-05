import { routeBackground, routeForeground } from '../lib/routeColor.js'

/**
 * The route number as a coloured badge, using the colour the agency publishes
 * in GTFS. `size` switches between the list rows and the larger stop header.
 */
export default function RoutePill({ shortName, color, size = 'md', title }) {
  const background = routeBackground(color)

  return (
    <span
      className={`route-pill route-pill--${size}`}
      style={{ background, color: routeForeground(background) }}
      title={title}
    >
      {shortName || '?'}
    </span>
  )
}
