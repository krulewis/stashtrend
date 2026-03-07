import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import styles from './WindowPicker.module.css'

/**
 * Stable DOM id linking trigger's aria-controls to the listbox panel.
 * Must differ from MonthDropdown's 'month-listbox' — both components
 * are mounted simultaneously inside the swipe container.
 */
const LISTBOX_ID = 'heatmap-window-listbox'

/** Month abbreviations for the grid cells (index 0 = January). */
const MONTH_ABBREVS = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Format an ISO date string as "Sep 2025" (short month name + 4-digit year).
 * Used for the trigger range label only.
 * (Finding 6: JSDoc corrected — "short" not "full" month name)
 */
function formatRangeMonth(monthKey) {
  const d = new Date(monthKey + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year  = d.getFullYear()
  return `${month} ${year}`
}

/**
 * WindowPicker
 *
 * Combobox trigger showing the current N-month window range.
 * Opens a month-grid panel (3 columns × 4 rows per year) for jump-to-any-month
 * navigation. Follows the ARIA combobox/listbox pattern.
 *
 * Props:
 *   months              — full sorted array of ISO date strings, most-recent-first
 *   windowStart         — current offset index into months[] (0 = most recent window)
 *   windowSize          — number of months in the window
 *   onWindowStartChange — called with new index when user selects a month
 */
export default function WindowPicker({ months, windowStart, windowSize, onWindowStartChange }) {
  const [isOpen, setIsOpen]         = useState(false)
  const [gridYear, setGridYear]     = useState(null)  // year shown in the grid panel
  const [focusedKey, setFocusedKey] = useState(null)  // ISO key of keyboard-focused cell

  const containerRef = useRef(null)
  const triggerRef   = useRef(null)

  // ── Derived values ─────────────────────────────────────────────────────────

  // months is most-recent-first. windowSlice[0] is the newest month in the window;
  // windowSlice[windowSize-1] is the oldest month in the window.
  const windowSlice = useMemo(
    () => months.slice(windowStart, windowStart + windowSize),
    [months, windowStart, windowSize]
  )
  const oldestMonth = windowSlice[windowSlice.length - 1] ?? months[months.length - 1]
  const newestMonth = windowSlice[0] ?? months[0]

  // Trigger label: "Sep 2025 — Feb 2026"
  const triggerLabel = (oldestMonth && newestMonth)
    ? `${formatRangeMonth(oldestMonth)} \u2014 ${formatRangeMonth(newestMonth)}`
    : 'Select window'

  // Build a Set of available month keys for quick membership testing
  const availableSet = useMemo(() => new Set(months), [months])

  // Available years (sorted ascending) for year navigation
  const availableYears = useMemo(() => {
    const years = new Set(months.map(m => parseInt(m.slice(0, 4), 10)))
    return [...years].sort((a, b) => a - b)
  }, [months])

  // Initialize gridYear to the year of the current window's oldest month when opening
  const open = useCallback(() => {
    const year = oldestMonth ? parseInt(oldestMonth.slice(0, 4), 10) : new Date().getFullYear()
    setGridYear(year)
    setFocusedKey(oldestMonth ?? null)
    setIsOpen(true)
  }, [oldestMonth])

  const close = useCallback(() => {
    setIsOpen(false)
    setFocusedKey(null)
  }, [])

  const handleTriggerClick = () => {
    if (isOpen) {
      close()
      triggerRef.current?.focus()
    } else {
      open()
    }
  }

  // ── Month selection ────────────────────────────────────────────────────────

  const isMonthDisabled = useCallback((monthKey) => {
    // Month must be in the available dataset
    if (!availableSet.has(monthKey)) return true
    return false
  }, [availableSet])

  /**
   * Handle month selection.
   *
   * Finding 1 fix: The selected month should become the OLDEST in the window.
   * months[] is sorted most-recent-first, so months[windowStart] is the newest and
   * months[windowStart + windowSize - 1] is the oldest.
   *
   * To make the selected month the oldest:
   *   newStart = Math.max(0, idx - (windowSize - 1))
   *
   * This places selectedMonth at position (newStart + windowSize - 1) in months[],
   * making it the oldest visible month. Math.max(0, ...) clamps when the selected
   * month is within the first (windowSize-1) entries (i.e., near the newest end).
   */
  const handleSelect = useCallback((monthKey) => {
    if (isMonthDisabled(monthKey)) return
    const idx = months.indexOf(monthKey)
    if (idx < 0) return
    const newStart = Math.max(0, idx - (windowSize - 1))
    onWindowStartChange(newStart)
    close()
    triggerRef.current?.focus()
  }, [months, windowSize, isMonthDisabled, onWindowStartChange, close])

  // ── Click-outside ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, close])

  // ── Escape key ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  // ── Grid keyboard navigation ───────────────────────────────────────────────

  // Build the ordered list of month keys in the grid for the current gridYear
  const gridMonths = useMemo(() => {
    if (gridYear === null) return []
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      return `${gridYear}-${mm}-01`
    })
  }, [gridYear])

  // Find the next enabled month in a direction, skipping disabled ones
  const findNextEnabled = useCallback((fromIdx, step) => {
    let idx = fromIdx + step
    while (idx >= 0 && idx < gridMonths.length) {
      if (!isMonthDisabled(gridMonths[idx])) return idx
      idx += step
    }
    return fromIdx // stay put if no enabled month found
  }, [gridMonths, isMonthDisabled])

  const handleGridKeyDown = (e) => {
    if (!isOpen || gridMonths.length === 0) return
    const currentIdx = focusedKey ? gridMonths.indexOf(focusedKey) : 0

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedKey(gridMonths[findNextEnabled(currentIdx, 1)])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedKey(gridMonths[findNextEnabled(currentIdx, -1)])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedKey(gridMonths[findNextEnabled(currentIdx, 3)])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedKey(gridMonths[findNextEnabled(currentIdx, -3)])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusedKey) handleSelect(focusedKey)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const prevYear = gridYear !== null && availableYears[0] < gridYear ? gridYear - 1 : null
  const nextYear = gridYear !== null && availableYears[availableYears.length - 1] > gridYear ? gridYear + 1 : null

  // Finding 1 fix: aria-selected marks the OLDEST month in the window.
  // That is months[windowStart + windowSize - 1], not months[windowStart].
  const selectedMonthKey = months[windowStart + windowSize - 1] ?? oldestMonth

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={LISTBOX_ID}
        aria-label={`Select ${windowSize}-month window`}
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''}`}
        onClick={handleTriggerClick}
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        <span
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        >
          &#8964;
        </span>
      </button>

      {/* Month grid panel */}
      {isOpen && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Select window start month"
          className={styles.panel}
          onKeyDown={handleGridKeyDown}
        >
          {/* Year navigation row */}
          <div className={styles.yearRow}>
            <button
              type="button"
              className={styles.yearButton}
              aria-label="Previous year"
              disabled={prevYear === null}
              onClick={() => { setGridYear(prevYear); setFocusedKey(null) }}
            >
              ‹
            </button>
            <span className={styles.yearLabel}>{gridYear}</span>
            <button
              type="button"
              className={styles.yearButton}
              aria-label="Next year"
              disabled={nextYear === null}
              onClick={() => { setGridYear(nextYear); setFocusedKey(null) }}
            >
              ›
            </button>
          </div>

          {/* 3×4 month grid */}
          <div className={styles.monthGrid}>
            {gridMonths.map((monthKey, i) => {
              const disabled = isMonthDisabled(monthKey)
              // Finding 1 fix: aria-selected compares against selectedMonthKey
              // (the actual oldest month in the window), not oldestMonth variable.
              const selected = monthKey === selectedMonthKey
              const focused  = monthKey === focusedKey
              const abbrev   = MONTH_ABBREVS[i]
              return (
                <div
                  key={monthKey}
                  role="option"
                  aria-selected={selected}
                  // Finding 2 fix: omit aria-disabled entirely when not disabled.
                  // aria-disabled={disabled || undefined} renders attribute only when true.
                  aria-disabled={disabled || undefined}
                  tabIndex={focused ? 0 : -1}
                  className={[
                    styles.monthOption,
                    selected ? styles.monthOptionSelected : '',
                    disabled ? styles.monthOptionDisabled : '',
                    focused  ? styles.monthOptionFocused  : '',
                  ].join(' ').trim()}
                  onClick={() => !disabled && handleSelect(monthKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!disabled) handleSelect(monthKey)
                    }
                  }}
                >
                  {abbrev}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

WindowPicker.propTypes = {
  months:              PropTypes.arrayOf(PropTypes.string).isRequired,
  windowStart:         PropTypes.number.isRequired,
  windowSize:          PropTypes.number.isRequired,
  onWindowStartChange: PropTypes.func.isRequired,
}
