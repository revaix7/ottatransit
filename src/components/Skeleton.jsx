/**
 * Loading placeholders shaped like the rows they stand in for, so the list
 * doesn't jump as real data lands on top of them.
 *
 * The shimmer is a background sweep rather than an opacity pulse — under
 * prefers-reduced-motion the theme kills the animation and what's left is a
 * flat grey bar, which still reads as "loading" without the movement.
 */
export function SkeletonBar({ width = '100%', height = 12 }) {
  return <span className="skeleton" style={{ width, height: `${height}px` }} aria-hidden="true" />
}

/** One stop card's worth: a name, and a couple of departure lines. */
export function SkeletonStopCard() {
  return (
    <li className="stop-card stop-card--skeleton">
      <div className="stop-card__top">
        <SkeletonBar width="58%" height={14} />
      </div>
      <div className="skeleton-lines">
        <span className="skeleton-line">
          <SkeletonBar width="34px" height={20} />
          <SkeletonBar width="45%" height={12} />
          <SkeletonBar width="42px" height={16} />
        </span>
        <span className="skeleton-line">
          <SkeletonBar width="34px" height={20} />
          <SkeletonBar width="38%" height={12} />
          <SkeletonBar width="42px" height={16} />
        </span>
      </div>
    </li>
  )
}

/** A run of stop-card skeletons, for a list that has nothing in it yet. */
export function SkeletonStopList({ count = 4 }) {
  return (
    <ul className="stop-list" aria-busy="true" aria-label="Loading stops">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonStopCard key={index} />
      ))}
    </ul>
  )
}

/** The stop screen's departure rows, which are taller than the list rows. */
export function SkeletonDepartureList({ count = 6 }) {
  return (
    <ul className="departure-list" aria-busy="true" aria-label="Loading departures">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="departure-row departure-row--skeleton">
          <SkeletonBar width="44px" height={26} />
          <span className="skeleton-stack">
            <SkeletonBar width="62%" height={13} />
            <SkeletonBar width="40%" height={11} />
          </span>
          <SkeletonBar width="46px" height={22} />
        </li>
      ))}
    </ul>
  )
}
