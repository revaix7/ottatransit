/**
 * The star that saves a stop or a route.
 *
 * Always rendered as a sibling of whatever row it belongs to rather than inside
 * it — the rows are themselves buttons, and a button can't contain one.
 */
export default function FavoriteStar({ active, onToggle, label, size = 'md' }) {
  return (
    <button
      type="button"
      className={`fav-star fav-star--${size}${active ? ' fav-star--on' : ''}`}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favourites` : `Save ${label} to favourites`}
      title={active ? 'Saved' : 'Save'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <span aria-hidden="true">{active ? '★' : '☆'}</span>
    </button>
  )
}
