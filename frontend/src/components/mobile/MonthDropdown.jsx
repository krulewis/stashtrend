import { useEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import styles from './MonthDropdown.module.css'

/** Stable ID used to link the trigger's aria-controls to the listbox. */
const LISTBOX_ID = 'month-listbox'

/**
 * Format an ISO date string (e.g. "2025-12-01") as "December 2025".
 * Appends T00:00:00 to prevent timezone-shift from UTC interpretation.
 */
function formatMonth(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * MonthDropdown
 *
 * Scrollable month selector using the ARIA combobox/listbox pattern.
 * Supports keyboard navigation (ArrowUp/ArrowDown/Enter/Escape),
 * click-outside to close, and scrollIntoView on the selected option.
 *
 * Props:
 *   months        — array of ISO date strings sorted most-recent-first
 *   selectedMonth — currently selected ISO date string (or null)
 *   onSelect      — called with the ISO date string when a month is chosen
 */
export default function MonthDropdown({ months, selectedMonth, onSelect }) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const listboxRef = useRef(null)
  // Array of refs for each option element — used for focus management and scrollIntoView.
  const optionRefs = useRef([])

  // ── Open/close helpers ──────────────────────────────────────────────────

  const open = useCallback(() => {
    const selectedIdx = months.indexOf(selectedMonth)
    setFocusedIndex(selectedIdx >= 0 ? selectedIdx : 0)
    setIsOpen(true)
  }, [months, selectedMonth])

  const close = useCallback(() => {
    setIsOpen(false)
    setFocusedIndex(-1)
  }, [])

  const handleTriggerClick = () => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }

  const handleSelect = (month) => {
    onSelect(month)
    close()
    // Return focus to trigger after selection.
    triggerRef.current?.focus()
  }

  // ── Click-outside to close ──────────────────────────────────────────────

  useEffect(() => {
    function handleMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [close])

  // ── Escape key to close ─────────────────────────────────────────────────

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

  // ── ScrollIntoView on open ──────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    const selectedIdx = months.indexOf(selectedMonth)
    if (selectedIdx >= 0 && optionRefs.current[selectedIdx]) {
      optionRefs.current[selectedIdx].scrollIntoView({ block: 'nearest' })
    }
    // Move DOM focus to the focused option.
    const focusTarget = optionRefs.current[focusedIndex >= 0 ? focusedIndex : 0]
    focusTarget?.focus()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally only runs on open — we do not want this to re-run when
  // focusedIndex changes (arrow key navigation handles focus moves itself).

  // ── Arrow key navigation inside the listbox ─────────────────────────────

  const handleListboxKeyDown = (e) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = Math.min(prev + 1, months.length - 1)
        optionRefs.current[next]?.focus()
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = Math.max(prev - 1, 0)
        optionRefs.current[next]?.focus()
        return next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && months[focusedIndex]) {
        handleSelect(months[focusedIndex])
      }
    }
  }

  // ── Derived display values ──────────────────────────────────────────────

  const triggerLabel = selectedMonth ? formatMonth(selectedMonth) : 'Select month'

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={LISTBOX_ID}
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''}`}
        onClick={handleTriggerClick}
      >
        <span className={styles.label}>{triggerLabel}</span>
        <span
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        >
          &#8964;
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <ul
          ref={listboxRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Select month"
          className={styles.panel}
          onKeyDown={handleListboxKeyDown}
        >
          {months.map((m, idx) => {
            const isSelected = m === selectedMonth
            return (
              <li
                key={m}
                ref={(el) => { optionRefs.current[idx] = el }}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() => handleSelect(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelect(m)
                  }
                }}
              >
                {formatMonth(m)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

MonthDropdown.propTypes = {
  months: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedMonth: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
}
