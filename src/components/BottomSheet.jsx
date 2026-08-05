import { useCallback, useEffect, useRef, useState } from 'react'

// How much of the viewport height the sheet shows at each rest position:
// a peek with the handle and first rows, half, and nearly full.
const SNAP_FRACTIONS = [0.22, 0.55, 0.92]
const SHEET_FRACTION = 0.92

function snapHeights(viewportHeight) {
  return SNAP_FRACTIONS.map((fraction) => Math.round(viewportHeight * fraction))
}

function nearest(heights, value) {
  return heights.reduce((best, height) =>
    Math.abs(height - value) < Math.abs(best - value) ? height : best,
  )
}

/**
 * The draggable sheet the whole UI lives in. Dragging is handled with pointer
 * events on the grab area so it works with touch and a mouse alike; releasing
 * settles on the closest snap point.
 */
export default function BottomSheet({ children, onHeightChange }) {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [height, setHeight] = useState(() => snapHeights(window.innerHeight)[1])
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => {
    const onResize = () => {
      setViewportHeight(window.innerHeight)
      setHeight((current) => nearest(snapHeights(window.innerHeight), current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  const heights = snapHeights(viewportHeight)
  const maxHeight = Math.round(viewportHeight * SHEET_FRACTION)

  const onPointerDown = useCallback(
    (event) => {
      // Ignore secondary buttons so a right-click doesn't strand the sheet.
      if (event.button !== undefined && event.button !== 0) return
      dragRef.current = { startY: event.clientY, startHeight: height }
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
    },
    [height],
  )

  const onPointerMove = useCallback(
    (event) => {
      const drag = dragRef.current
      if (!drag) return
      const next = drag.startHeight + (drag.startY - event.clientY)
      setHeight(Math.min(maxHeight, Math.max(80, next)))
    },
    [maxHeight],
  )

  const endDrag = useCallback(
    (event) => {
      if (!dragRef.current) return
      dragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      setDragging(false)
      setHeight((current) => nearest(heights, current))
    },
    [heights],
  )

  // Keyboard equivalent of dragging, so the sheet isn't mouse-only.
  const onKeyDown = useCallback(
    (event) => {
      const index = heights.indexOf(nearest(heights, height))
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHeight(heights[Math.min(heights.length - 1, index + 1)])
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHeight(heights[Math.max(0, index - 1)])
      }
    },
    [height, heights],
  )

  return (
    <section
      className={`sheet${dragging ? ' sheet--dragging' : ''}`}
      style={{ height: `${height}px` }}
    >
      <div
        className="sheet__grip"
        role="slider"
        tabIndex={0}
        aria-label="Sheet height"
        aria-valuemin={heights[0]}
        aria-valuemax={heights[heights.length - 1]}
        aria-valuenow={Math.round(height)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="sheet__handle" />
      </div>
      <div className="sheet__body">{children}</div>
    </section>
  )
}
