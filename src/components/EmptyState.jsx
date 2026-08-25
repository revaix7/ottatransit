/**
 * The shared shape for "nothing here" and "that went wrong" — a glyph, a line
 * saying what happened, an optional line saying what to do about it, and an
 * optional action. Keeping them in one component stops the half-dozen states
 * scattered through the sheet from each inventing their own layout.
 */
export default function EmptyState({ icon, title, detail, action, tone = 'neutral' }) {
  return (
    <div className={`empty-state empty-state--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {icon && (
        <span className="empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      {detail && <p className="empty-state__detail">{detail}</p>}
      {action && (
        <button type="button" className="empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
