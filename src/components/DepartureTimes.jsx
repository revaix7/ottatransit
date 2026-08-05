import { Fragment } from 'react'
import Countdown from './Countdown.jsx'

/**
 * The next couple of departures on one line — "4 · 19 min". Only the last
 * entry carries the unit, which is how Transit prints them.
 */
export default function DepartureTimes({ departures, now, size = 'lg' }) {
  if (departures.length === 0) {
    return <span className="times times--empty">No service</span>
  }

  return (
    <span className="times">
      {departures.map((departure, index) => (
        <Fragment key={departure.tripId}>
          {index > 0 && <span className="times__sep">·</span>}
          <Countdown
            expectedEpoch={departure.expectedEpoch}
            now={now}
            isRealtime={departure.isRealtime}
            cancelled={departure.cancelled}
            size={index === 0 ? size : 'sm'}
            showUnit={index === departures.length - 1}
            // One live marker per line is enough; the later times still read as
            // live or scheduled from their colour.
            showLive={index === 0}
          />
        </Fragment>
      ))}
    </span>
  )
}
