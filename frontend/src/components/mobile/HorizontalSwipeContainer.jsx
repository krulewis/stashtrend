import { useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import styles from './HorizontalSwipeContainer.module.css'

export default function HorizontalSwipeContainer({
  children,
  activeIndex,
  onIndexChange,
  isLocked,
  labels,
}) {
  const containerRef  = useRef(null)
  const isScrollingRef = useRef(false)

  // Sync scroll position when activeIndex changes programmatically
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    isScrollingRef.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({
      left:     activeIndex * el.clientWidth,
      behavior: reduced ? 'auto' : 'smooth',
    })

    // Clear the flag after scroll animation completes (~300ms typical)
    const t = setTimeout(() => { isScrollingRef.current = false }, 400)
    return () => clearTimeout(t)
  }, [activeIndex])

  const handleScroll = (e) => {
    // Ignore scroll events fired by our own scrollTo call
    if (isScrollingRef.current) return
    const index = Math.round(e.target.scrollLeft / e.target.clientWidth)
    onIndexChange(index)
  }

  const containerClassName = [
    styles.container,
    isLocked ? styles.containerLocked : '',
  ].filter(Boolean).join(' ')

  const childArray = Array.isArray(children) ? children : [children]

  return (
    <>
      <div
        ref={containerRef}
        className={containerClassName}
        onScroll={handleScroll}
      >
        {childArray.map((child, i) => (
          <div
            key={i}
            className={styles.pane}
            role="tabpanel"
            aria-labelledby={`view-tab-${i}`}
          >
            {child}
          </div>
        ))}
      </div>

      {/* ViewIndicator — rendered inline; tightly coupled to scroll state */}
      <div role="tablist" className={styles.dots}>
        {childArray.map((_, i) => (
          <button
            key={i}
            role="tab"
            id={`view-tab-${i}`}
            aria-selected={i === activeIndex}
            aria-label={labels?.[i] ?? `View ${i + 1}`}
            className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ''}`}
            onClick={() => { onIndexChange(i) }}
            type="button"
          />
        ))}
      </div>
    </>
  )
}

HorizontalSwipeContainer.propTypes = {
  children:      PropTypes.node.isRequired,
  activeIndex:   PropTypes.number.isRequired,
  onIndexChange: PropTypes.func.isRequired,
  isLocked:      PropTypes.bool,
  labels:        PropTypes.arrayOf(PropTypes.string),
}

HorizontalSwipeContainer.defaultProps = {
  isLocked: false,
}
