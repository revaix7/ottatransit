/**
 * A departure countdown in Transit's style: the number carries the weight, the
 * unit sits small beside it. Derived from the absolute timestamp and the
 * ticking `now` so it counts down between refetches rather than sitting on
 * whatever minute count the last response happened to contain.
 */
export default function Countdown({
  expectedEpoch,
  now,
  isRealtime = false,
  cancelled = false,
  size = 'md',
  showUnit = true,
  showLive = true,
}) {
  if (cancelled) {
    return <span className="countdown countdown--cancelled">Cancelled</span>
  }

  const minutes = Math.round((expectedEpoch - now) / 60)
  const classes = [
    'countdown',
    `countdown--${size}`,
    isRealtime ? 'countdown--live' : 'countdown--scheduled',
    isRealtime && showLive ? 'countdown--dot' : '',
  ].filter(Boolean)

  if (minutes <= 0) {
    return <span className={`${classes.join(' ')} countdown--now`}>Now</span>
  }

  return (
    <span className={classes.join(' ')}>
      <span className="countdown__value">{minutes}</span>
      {showUnit && <span className="countdown__unit">min</span>}
    </span>
  )
}
