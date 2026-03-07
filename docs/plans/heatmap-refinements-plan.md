# Heatmap Refinements — Implementation Plan

**Date:** 2026-03-07
**Change Size:** M
**Inputs:** requirements doc, research report, architecture decision, current source files

---

## Overview

Six visual and interaction refinements to `HeatmapView` and `WindowPicker`. All changes are frontend-only. The work is organized into four parallel streams that each own an exclusive file set, with a short final integration pass to merge overlapping edits to `HeatmapView.jsx` and `HeatmapView.module.css`. Streams 1 and 2 are the smallest and should finish first; Stream 4 (calendar picker rewrite) is the largest.

Key architectural decisions from the approved architecture doc:
- Aggregate dots stay at 12px (Change B only adds row padding — no dot size change)
- `formatMonthLabel` is modified in place (only two callers, both heatmap components)
- Legend shows 5 states including "No data"
- WindowPicker is a complete rewrite with a new prop interface
- Label column stays at 110px

---

## Changes by Stream

---

### Stream 1: Smart Labels (Change A)

**Scope:** `budgetUtils.js` (new export), `budgetUtils.test.js` (new tests), `HeatmapView.jsx` (call sites)

---

#### File: `frontend/src/utils/budgetUtils.js`
Lines: append after line 79 (after `formatMonthLabel`), before `groupExpenses`
Parallelism: independent

Description: Add `formatGroupLabel(name, maxLen = 14)` export. Implements word-boundary abbreviation with single-long-word fallback.

Details:
- Insert the following function and JSDoc between `formatMonthLabel` and `groupExpenses`:

```js
/**
 * Abbreviate a budget group/category name to fit within maxLen characters.
 * Strategy:
 *   1. null/undefined/empty → return "Other"
 *   2. name.length <= maxLen → return as-is (no-op)
 *   3. Try word-boundary truncation: accumulate whole words (space-joined)
 *      while total length stays within maxLen. If at least one word fits,
 *      return the joined words (no trailing ellipsis — clean word boundary).
 *   4. If the first word alone exceeds maxLen, truncate to maxLen-1 chars
 *      and append the unicode ellipsis character "\u2026".
 *
 * @param {string|null|undefined} name
 * @param {number} maxLen - Maximum character count (default 14)
 * @returns {string}
 */
export function formatGroupLabel(name, maxLen = 14) {
  if (!name) return 'Other'
  if (name.length <= maxLen) return name

  const words = name.split(' ')
  let result = ''
  for (const word of words) {
    const candidate = result ? result + ' ' + word : word
    if (candidate.length <= maxLen) {
      result = candidate
    } else {
      break
    }
  }
  if (result) return result

  // First word alone exceeds maxLen — hard truncate
  return name.slice(0, maxLen - 1) + '\u2026'
}
```

- Export is added alongside other named exports in the file. No changes to existing functions.

---

#### File: `frontend/src/utils/budgetUtils.test.js`
Lines: append after line 192 (after `formatMonthLabel` describe block), before `groupExpenses`
Parallelism: independent

Description: New `describe('formatGroupLabel')` block with 7 test cases.

Details:
- Add import of `formatGroupLabel` to the existing import line at line 3:
  ```js
  import { getBudgetZone, getPillAriaLabel, WARNING_THRESHOLD,
           groupExpenses, formatMonthLabel, formatGroupLabel } from './budgetUtils.js'
  ```
- Insert new describe block after the `formatMonthLabel` describe block and before the `groupExpenses` describe block:

```js
describe('formatGroupLabel', () => {
  it('returns name unchanged when it fits within maxLen (default 14)', () => {
    expect(formatGroupLabel('Housing')).toBe('Housing')
  })

  it('returns name unchanged when length equals maxLen exactly', () => {
    // "Food & Dining" = 13 chars, fits within 14
    expect(formatGroupLabel('Food & Dining')).toBe('Food & Dining')
  })

  it('truncates at word boundary for multi-word names exceeding maxLen', () => {
    // "Auto & Transport" = 16 chars > 14
    // Words: "Auto" (4), "Auto &" (6), "Auto & Transport" (16 > 14) → returns "Auto &"
    const result = formatGroupLabel('Auto & Transport')
    expect(result.length).toBeLessThanOrEqual(14)
    expect(result).toBe('Auto &')
  })

  it('returns only the first word when adding the second word would exceed maxLen', () => {
    // "Entertainment" = 13 chars fits; "Entertainment Bill" = 18 chars
    expect(formatGroupLabel('Entertainment Bill')).toBe('Entertainment')
  })

  it('hard-truncates with ellipsis when first word alone exceeds maxLen', () => {
    // "Miscellaneous" = 13 chars, fits within 14 — use a longer single word
    const result = formatGroupLabel('Extraordinarily', 10)
    expect(result).toHaveLength(10)
    expect(result).toMatch(/…$/)
  })

  it('returns "Other" for null input', () => {
    expect(formatGroupLabel(null)).toBe('Other')
  })

  it('returns "Other" for empty string input', () => {
    expect(formatGroupLabel('')).toBe('Other')
  })

  it('accepts a custom maxLen override', () => {
    // maxLen=12: "Auto & Transport" → "Auto &" (6) fits, "Auto & Transport" (16) does not
    const result = formatGroupLabel('Auto & Transport', 12)
    expect(result.length).toBeLessThanOrEqual(12)
  })
})
```

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: 3 (import line), 69 (groupName span), 90 (categoryLabel div) — Stream 1 edits only
Parallelism: independent (Stream 1 edits are in separate JSX locations from Streams 3 and 4; see Integration Notes)

Description: Import `formatGroupLabel` and apply it at both label render sites.

Details:
- Line 3: Add `formatGroupLabel` to the import from `budgetUtils.js`:
  ```js
  import { groupExpenses, getBudgetZone, formatMonthLabel, formatGroupLabel } from '../../utils/budgetUtils.js'
  ```
- Line 69: Wrap the group name in the `.groupName` span:
  ```jsx
  <span className={styles.groupName}>{formatGroupLabel(group.groupName)}</span>
  ```
- Line 90: Wrap the category label. Child rows use a shorter `maxLen` (12) because `.categoryLabel` has `padding-left: var(--sp-4)` (16px) eating into the 110px column:
  ```jsx
  <div className={styles.categoryLabel} role="rowheader">
    {formatGroupLabel(cat.category_name, 12)}
  </div>
  ```
- No other changes to `HeatmapView.jsx` in this stream.

---

### Stream 2: CSS Polish (Changes B + E)

**Scope:** `HeatmapView.module.css` only — no JSX changes.

Note: Stream 2 and Stream 3 both touch `HeatmapView.module.css`. During integration, apply both sets of CSS changes in one pass to avoid rebase conflicts. The changes are in different sections of the file and do not overlap.

---

#### File: `frontend/src/components/mobile/HeatmapView.module.css`
Lines: 34–41 (`.groupHeaderRow`), 90–96 (`.categoryRow`), 27–32 (`.groupCard`), new class `.groupCardExpanded`, 86–88 (`.groupContentInner`), 159–166 (reduced-motion block)
Parallelism: independent

Description: Add vertical row padding (Change B) and expanded group accent styles (Change E).

Details for Change B (row padding):
- `.groupHeaderRow` (lines 34–41): Change `padding: 0 var(--sp-3)` to `padding: 10px var(--sp-3)`. The existing `min-height: 44px` remains — padding may push height beyond 44px which is acceptable.
- `.categoryRow` (lines 90–96): Change `padding: 0 var(--sp-3)` to `padding: 7px var(--sp-3)`. The existing `min-height: 36px` remains.

Details for Change E (expanded group accent):
- `.groupCard` (lines 27–32): Add `border-left: 3px solid transparent;` to the existing rule. This reserves space permanently so the border appearing on expand causes zero layout shift. The full updated rule:
  ```css
  .groupCard {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 3px solid transparent;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  ```
- Add new class `.groupCardExpanded` immediately after `.groupCard`:
  ```css
  .groupCardExpanded {
    border-left-color: var(--accent);
    transition: border-left-color var(--ease-default);
  }
  ```
- `.groupContentInner` (lines 86–88): Add `background: var(--bg-inset);` so child rows have a darker inset background when the group is expanded:
  ```css
  .groupContentInner {
    min-height: 0;
    background: var(--bg-inset);
  }
  ```
- Add `.groupCardExpanded` to the `prefers-reduced-motion` block (lines 159–166) to suppress the `border-left-color` transition:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .groupContent {
      transition: none;
    }
    .chevron {
      transition: none;
    }
    .groupCardExpanded {
      transition: none;
    }
  }
  ```

---

### Stream 3: Legend (Change D)

**Scope:** `HeatmapView.jsx` (legend markup), `HeatmapView.module.css` (legend styles), `HeatmapView.test.jsx` (legend test)

Note: Stream 3 also needs the `HeatmapView.jsx` `.groupCardExpanded` conditional class (Change E JSX part). That JSX edit is one line inside `HeatmapGroupRow` and can be included in Stream 3's `HeatmapView.jsx` edits since it only touches the component return JSX, not the import line or `HeatmapView` function body.

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: 49 (groupCard div), 143–184 (HeatmapView return body)
Parallelism: independent (Stream 3 edits; Stream 4 edits the WindowPicker usage and adds currentMonthKey — different lines)

Description: Add `.groupCardExpanded` conditional class (Change E JSX), add `LEGEND_ITEMS` constant and legend markup (Change D).

Details for Change E JSX (line 49):
- Change the groupCard div from:
  ```jsx
  <div className={styles.groupCard}>
  ```
  to:
  ```jsx
  <div className={`${styles.groupCard} ${isExpanded ? styles.groupCardExpanded : ''}`}>
  ```

Details for Change D (legend constant + markup):
- Add `LEGEND_ITEMS` as a module-level constant after `ZONE_CLASS_MAP` (after line 15):
  ```js
  const LEGEND_ITEMS = [
    { zone: 'safe',      label: 'Under 85%', dotClass: styles.dotSafe },
    { zone: 'warning',   label: '85 \u2013 100%', dotClass: styles.dotWarning },
    { zone: 'over',      label: 'Over 100%', dotClass: styles.dotOver },
    { zone: 'no-budget', label: 'No budget', dotClass: styles.dotMuted },
    { zone: 'no-data',   label: 'No data',   dotClass: styles.dotFaint },
  ]
  ```
  Note: `'85 \u2013 100%'` uses an en-dash (U+2013) matching the design brief.

- Inside the `HeatmapView` return, between the `<WindowPicker ... />` and the `<div role="grid" ...>`, insert the legend. After integration (Stream 4 moves/updates WindowPicker usage), the final render order inside `.heatmap` is:
  1. `<WindowPicker .../>` (updated by Stream 4)
  2. `<div role="grid">` which contains:
     a. `.columnHeaders` row
     b. Legend strip
     c. Group rows

  The legend lives inside the `role="grid"` div, between the `.columnHeaders` row and the first `HeatmapGroupRow`. Insert after the closing `</div>` of `.columnHeaders` (currently line 174) and before the `{groupedData.map(...)}` call:

  ```jsx
  <div className={styles.legend} aria-label="Dot color legend" role="group">
    {LEGEND_ITEMS.map(item => (
      <span key={item.zone} className={styles.legendItem}>
        <span className={`${styles.legendDot} ${item.dotClass}`} aria-hidden="true" />
        <span className={styles.legendLabel}>{item.label}</span>
      </span>
    ))}
  </div>
  ```

---

#### File: `frontend/src/components/mobile/HeatmapView.module.css`
Lines: append after line 157 (`.empty` class), before the `@media` block
Parallelism: independent (Stream 3 CSS additions; Stream 2 handles `.groupCard`, `.groupCardExpanded`, `.groupContentInner`, and row padding edits; Stream 4 adds `.headerMonthCurrent`)

Description: Add legend styles.

Details:
- Insert the following before the `@media (prefers-reduced-motion: reduce)` block:
  ```css
  .legend {
    display: flex;
    justify-content: center;
    gap: var(--sp-4);
    flex-wrap: wrap;
    padding: 10px var(--sp-3);
  }

  .legendItem {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legendDot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legendLabel {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
  }
  ```
- `legendDot` shares the existing `.dotSafe`, `.dotWarning`, `.dotOver`, `.dotMuted`, `.dotFaint` classes for its color — those classes set `background` only, which is compatible.

---

#### File: `frontend/src/components/mobile/HeatmapView.test.jsx`
Lines: append after line 162
Parallelism: independent

Description: Add legend rendering tests and update the two WindowPicker-dependent tests that will break when Stream 4 rewrites the component's prop interface.

Details for new legend tests (add to the existing `describe('HeatmapView')` block):
```js
it('renders the legend with 5 items', () => {
  renderHeatmap()
  const legend = screen.getByRole('group', { name: /dot color legend/i })
  expect(legend).toBeInTheDocument()
  // 5 legend labels
  expect(screen.getByText('Under 85%')).toBeInTheDocument()
  expect(screen.getByText('85 \u2013 100%')).toBeInTheDocument()
  expect(screen.getByText('Over 100%')).toBeInTheDocument()
  expect(screen.getByText('No budget')).toBeInTheDocument()
  expect(screen.getByText('No data')).toBeInTheDocument()
})

it('legend is always visible regardless of group expand state', () => {
  renderHeatmap()
  expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
  // collapse all (already collapsed) and confirm still present
  const groupHeaders = screen.getAllByRole('rowheader')
    .filter(el => el.hasAttribute('aria-expanded'))
  fireEvent.click(groupHeaders[0])
  expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
})
```

Details for updating broken tests (tests at lines 103–111 reference old `WindowPicker` aria-labels that will no longer exist after Stream 4's rewrite):
- Line 103–106: Test `'renders WindowPicker when months.length > 6'` queries `getByLabelText('Show older months')` — this aria-label belongs to the old arrow button, which is removed. Replace with a query for the new combobox trigger:
  ```js
  it('renders WindowPicker when months.length > 6', () => {
    renderHeatmap()
    expect(screen.getByRole('combobox', { name: /select 6-month window/i })).toBeInTheDocument()
  })
  ```
- Line 108–111: Test `'does not render WindowPicker when months.length <= 6'` also uses the old aria-label. The new WindowPicker always renders (architecture decision: no `hidden` prop). Remove this test entirely or replace with a check that the combobox still renders with few months:
  ```js
  it('renders WindowPicker with fewer than 6 months of data', () => {
    renderHeatmap({ months: MONTHS_8.slice(0, 5) })
    // Picker still renders — shows the range of available months
    expect(screen.getByRole('combobox', { name: /select 6-month window/i })).toBeInTheDocument()
  })
  ```

---

### Stream 4: Picker + Month Format (Changes C + F)

**Scope:** `WindowPicker.jsx` (complete rewrite), `WindowPicker.module.css` (complete rewrite), `WindowPicker.test.jsx` (complete rewrite), `budgetUtils.js` (update `formatMonthLabel`), `HeatmapView.jsx` (WindowPicker prop changes + current-month accent logic + new CSS class for accent header)

Stream 4 also adds `.headerMonthCurrent` to `HeatmapView.module.css`.

---

#### File: `frontend/src/utils/budgetUtils.js`
Lines: 74–79 (`formatMonthLabel` function body)
Parallelism: independent (Stream 1 adds a new function below this one; this edit only changes the body of the existing function. The merge is clean as long as streams don't edit the same lines.)

Description: Update `formatMonthLabel` to output `"Sep '25"` format with a straight apostrophe before the 2-digit year.

Details:
- Replace lines 74–79:
  ```js
  export function formatMonthLabel(monthKey) {
    return new Date(monthKey + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      year:  '2-digit',
    })
  }
  ```
  with:
  ```js
  export function formatMonthLabel(monthKey) {
    const d = new Date(monthKey + 'T00:00:00')
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const year  = d.toLocaleDateString('en-US', { year: '2-digit' })
    return `${month} '${year}`
  }
  ```
- Update the JSDoc `@returns` tag from `'Jan 26'` to `"Sep '25"` example.
- Do not change any other function.

---

#### File: `frontend/src/utils/budgetUtils.test.js`
Lines: 178–192 (`formatMonthLabel` describe block)
Parallelism: independent

Description: Update expected values in the `formatMonthLabel` tests to match the new apostrophe format.

Details:
- Line 180: Change `toBe('Jan 26')` to `toBe("Jan '26")`
- Line 184: Change `toBe('Dec 25')` to `toBe("Dec '25")`
- Line 188–191: The timezone-shift guard test (`not.toBe('Dec 25')`) — update to `not.toBe("Dec '25")`. The assertion logic remains correct: the result for `'2026-01-01'` should not be the December label.
- No other changes to `budgetUtils.test.js` in Stream 4.

---

#### File: `frontend/src/components/mobile/WindowPicker.jsx`
Lines: entire file (complete rewrite)
Parallelism: independent

Description: Replace the arrow-nav component with a combobox trigger (shows window range) that opens a month-grid panel. New prop interface matches the architecture decision.

Details — complete file content:

```jsx
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
 * Format an ISO date string as "Sep 2025" (full month name + 4-digit year).
 * Used for the trigger range label only.
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
 * Combobox trigger showing the current 6-month window range.
 * Opens a month-grid panel (3 columns × 4 rows per year) for jump-to-any-month
 * navigation. Follows the ARIA combobox/listbox pattern.
 *
 * Props:
 *   months            — full sorted array of ISO date strings, most-recent-first
 *   windowStart       — current offset index into months[] (0 = most recent window)
 *   windowSize        — number of months in the window (always 6)
 *   onWindowStartChange — called with new index when user selects a month
 */
export default function WindowPicker({ months, windowStart, windowSize, onWindowStartChange }) {
  const [isOpen, setIsOpen]           = useState(false)
  const [gridYear, setGridYear]       = useState(null)  // year shown in the grid panel
  const [focusedKey, setFocusedKey]   = useState(null)  // ISO key of keyboard-focused cell

  const containerRef = useRef(null)
  const triggerRef   = useRef(null)

  // ── Derived values ─────────────────────────────────────────────────────────

  // The window shows months[windowStart .. windowStart+windowSize-1].
  // displayMonths are in oldest-first order (reversed from the months[] array).
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
    // The selected month becomes the OLDEST in the window (windowStart = its index).
    // If selecting this month would make the window extend beyond the newest available
    // month, it is still valid — the window just shows fewer months. No clamping needed
    // on the oldest side since windowStart cannot exceed months.length - 1.
    return false
  }, [availableSet])

  const handleSelect = useCallback((monthKey) => {
    if (isMonthDisabled(monthKey)) return
    const idx = months.indexOf(monthKey)
    if (idx < 0) return
    onWindowStartChange(idx)
    close()
    triggerRef.current?.focus()
  }, [months, isMonthDisabled, onWindowStartChange, close])

  // ── Click-outside ──────────────────────────────────────────────────────────

  useEffect(() => {
    function handleMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [close])

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
  // (Jan–Dec of gridYear, only those in availableSet)
  const gridMonths = useMemo(() => {
    if (gridYear === null) return []
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      return `${gridYear}-${mm}-01`
    })
  }, [gridYear])

  const handleGridKeyDown = (e) => {
    if (!isOpen || gridMonths.length === 0) return
    const currentIdx = focusedKey ? gridMonths.indexOf(focusedKey) : 0

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = Math.min(currentIdx + 1, gridMonths.length - 1)
      setFocusedKey(gridMonths[next])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = Math.max(currentIdx - 1, 0)
      setFocusedKey(gridMonths[next])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(currentIdx + 3, gridMonths.length - 1)
      setFocusedKey(gridMonths[next])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(currentIdx - 3, 0)
      setFocusedKey(gridMonths[next])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusedKey) handleSelect(focusedKey)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const prevYear = gridYear !== null && availableYears[0] < gridYear ? gridYear - 1 : null
  const nextYear = gridYear !== null && availableYears[availableYears.length - 1] > gridYear ? gridYear + 1 : null

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
        aria-label="Select 6-month window"
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
              const disabled  = isMonthDisabled(monthKey)
              const selected  = monthKey === oldestMonth
              const focused   = monthKey === focusedKey
              const abbrev    = MONTH_ABBREVS[i]
              return (
                <div
                  key={monthKey}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={disabled}
                  tabIndex={focused ? 0 : -1}
                  className={[
                    styles.monthOption,
                    selected  ? styles.monthOptionSelected  : '',
                    disabled  ? styles.monthOptionDisabled  : '',
                    focused   ? styles.monthOptionFocused   : '',
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
```

---

#### File: `frontend/src/components/mobile/WindowPicker.module.css`
Lines: entire file (complete rewrite)
Parallelism: independent

Description: Remove all arrow/monthStrip styles. Add trigger, panel, year-nav, and month-grid styles.

Details — complete file content:

```css
.container {
  position: relative;
  width: 100%;
  margin-bottom: var(--sp-3);
}

/* ── Trigger ─────────────────────────────────────────────────────────── */

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 44px;
  padding: 0 var(--sp-3);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-primary);
}

.triggerOpen {
  border-color: var(--border-focus);
}

.trigger:active {
  background: var(--bg-hover);
}

.triggerLabel {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  font-size: 16px;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform var(--ease-default);
  display: inline-block;
}

.chevronOpen {
  transform: rotate(180deg);
}

/* ── Panel ───────────────────────────────────────────────────────────── */

.panel {
  position: absolute;
  top: calc(100% + var(--sp-2));
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-md);
  padding: var(--sp-3);
  box-shadow: var(--shadow-md);
}

/* ── Year navigation ─────────────────────────────────────────────────── */

.yearRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-3);
}

.yearLabel {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.yearButton {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.yearButton:disabled {
  color: var(--text-faint);
  cursor: default;
}

.yearButton:not(:disabled):active {
  background: var(--bg-hover);
}

/* ── Month grid ──────────────────────────────────────────────────────── */

.monthGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
}

.monthOption {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background var(--ease-quick), color var(--ease-quick);
}

.monthOption:not(.monthOptionDisabled):active {
  background: var(--bg-hover);
}

.monthOptionSelected {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.monthOptionDisabled {
  color: var(--text-faint);
  cursor: default;
}

.monthOptionFocused {
  outline: 2px solid var(--border-focus);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
  .monthOption {
    transition: none;
  }
}
```

---

#### File: `frontend/src/components/mobile/WindowPicker.test.jsx`
Lines: entire file (complete rewrite)
Parallelism: independent

Description: Remove all 8 arrow-nav tests. Write 9 new tests covering the combobox behavior.

Details — complete file content:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WindowPicker from './WindowPicker.jsx'

// months[] sorted most-recent-first, 8 months available
const MONTHS_8 = [
  '2026-03-01', '2026-02-01', '2026-01-01', '2025-12-01',
  '2025-11-01', '2025-10-01', '2025-09-01', '2025-08-01',
]

// windowStart=2 means the window is months[2..7] = Jan, Dec, Nov, Oct, Sep, Aug
// oldest in window = months[7] = '2025-08-01', newest = months[2] = '2026-01-01'
function renderPicker(overrides = {}) {
  const defaults = {
    months: MONTHS_8,
    windowStart: 2,
    windowSize: 6,
    onWindowStartChange: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  return { ...render(<WindowPicker {...props} />), props }
}

describe('WindowPicker', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn()
  })

  it('renders trigger with role="combobox" and aria-label', () => {
    renderPicker()
    expect(screen.getByRole('combobox', { name: /select 6-month window/i })).toBeInTheDocument()
  })

  it('trigger shows the date range of the current window', () => {
    renderPicker()
    // window start=2: oldest=months[7]='2025-08-01', newest=months[2]='2026-01-01'
    // range label: "Aug 2025 — Jan 2026"
    expect(screen.getByRole('combobox')).toHaveTextContent(/Aug 2025/)
    expect(screen.getByRole('combobox')).toHaveTextContent(/Jan 2026/)
  })

  it('trigger has aria-expanded=false when closed', () => {
    renderPicker()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking trigger opens the month grid panel', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('month grid renders month abbreviations for the grid year', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    // Panel opens on the year of the oldest window month (2025)
    // All 12 month cells should be visible (grid always shows full year)
    expect(screen.getByRole('option', { name: /Jan/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dec/ })).toBeInTheDocument()
  })

  it('applies aria-selected to the current window-start month', () => {
    // windowStart=2: oldest month key = months[7] = '2025-08-01' → Aug selected
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    const selectedOptions = options.filter(o => o.getAttribute('aria-selected') === 'true')
    expect(selectedOptions).toHaveLength(1)
    expect(selectedOptions[0]).toHaveTextContent('Aug')
  })

  it('clicking an available month calls onWindowStartChange with correct index', () => {
    const onWindowStartChange = vi.fn()
    renderPicker({ windowStart: 0, onWindowStartChange })
    fireEvent.click(screen.getByRole('combobox'))
    // Find Sep option — '2025-09-01' is at index 6 in MONTHS_8
    // First navigate to 2025 if not already there (windowStart=0 → newest month=2026-03)
    // The grid opens on the year of the oldest month in the window
    // With windowStart=0, oldest = months[5] = '2025-10-01' → year 2025 grid
    const options = screen.getAllByRole('option')
    const novOption = options.find(o => o.textContent === 'Nov')
    fireEvent.click(novOption)
    // '2025-11-01' is at index 4 in MONTHS_8
    expect(onWindowStartChange).toHaveBeenCalledWith(4)
  })

  it('closes the panel after selecting a month', () => {
    renderPicker({ windowStart: 0 })
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    const novOption = options.find(o => o.textContent === 'Nov')
    fireEvent.click(novOption)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('pressing Escape closes the panel without changing selection', () => {
    const onWindowStartChange = vi.fn()
    renderPicker({ onWindowStartChange })
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onWindowStartChange).not.toHaveBeenCalled()
  })

  it('months not in the available dataset are aria-disabled', () => {
    // Use a small months array so some months in the grid year are unavailable
    renderPicker({ months: ['2025-09-01', '2025-10-01', '2025-11-01',
                            '2025-12-01', '2026-01-01', '2026-02-01'],
                   windowStart: 0, windowSize: 6 })
    fireEvent.click(screen.getByRole('combobox'))
    // Grid opens on 2025. Jan–Aug 2025 are not in the months array.
    const options = screen.getAllByRole('option')
    const janOption = options.find(o => o.textContent === 'Jan')
    expect(janOption).toHaveAttribute('aria-disabled', 'true')
    // Sep is available
    const sepOption = options.find(o => o.textContent === 'Sep')
    expect(sepOption).toHaveAttribute('aria-disabled', 'false')
  })
})
```

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: 143–164 (WindowPicker usage in HeatmapView function body), 143 area (currentMonthKey computation), 169–172 (column header map)
Parallelism: depends-on Stream 3 (Stream 3 adds the legend markup in the same function; Stream 4's edits are in adjacent but non-overlapping lines — coordinate during integration)

Description: Update WindowPicker props to new interface, add current-month accent logic, remove old `canGoOlder`/`canGoNewer` computations.

Details:
- Remove lines 143–144 (old `canGoOlder`/`canGoNewer` constants):
  ```js
  const canGoOlder = windowStart + WINDOW_SIZE < months.length
  const canGoNewer = windowStart > 0
  ```
- Add `currentMonthKey` computation (insert before the `groupedData` useMemo):
  ```js
  const currentMonthKey = new Date().toISOString().slice(0, 7) + '-01'
  ```
- Replace the old `<WindowPicker .../>` block (lines 157–164) with:
  ```jsx
  <WindowPicker
    months={months}
    windowStart={windowStart}
    windowSize={WINDOW_SIZE}
    onWindowStartChange={setWindowStart}
  />
  ```
- In the column header `map` (around line 169), add conditional class for the current month:
  ```jsx
  {displayMonths.map(m => (
    <span
      key={m}
      role="columnheader"
      className={`${styles.headerMonth} ${m === currentMonthKey ? styles.headerMonthCurrent : ''}`}
    >
      {formatMonthLabel(m)}
    </span>
  ))}
  ```

---

#### File: `frontend/src/components/mobile/HeatmapView.module.css`
Lines: append after `.headerMonth` rule (lines 20–25)
Parallelism: depends-on Stream 2 (both touch this file; see Integration Notes)

Description: Add `.headerMonthCurrent` class for the accent-colored current-month column header (Change C).

Details:
- Insert immediately after the `.headerMonth` closing brace (line 25):
  ```css
  .headerMonthCurrent {
    color: var(--accent);
    font-weight: 500;
  }
  ```

---

## Dependency Order

The streams are independent in their primary files. The only coordination needed is in the two shared files where multiple streams contribute edits.

**Step 1 — All independent (run in parallel):**
- Stream 1: `budgetUtils.js` (add `formatGroupLabel`) + `budgetUtils.test.js` (new tests) + `HeatmapView.jsx` (import + label call sites)
- Stream 2: `HeatmapView.module.css` (row padding, `.groupCard` border-left, `.groupCardExpanded`, `.groupContentInner`, reduced-motion addition)
- Stream 3: `HeatmapView.jsx` (legend constant + markup + `.groupCardExpanded` class toggle) + `HeatmapView.module.css` (legend styles) + `HeatmapView.test.jsx` (legend tests + WindowPicker test updates)
- Stream 4: `WindowPicker.jsx` (rewrite) + `WindowPicker.module.css` (rewrite) + `WindowPicker.test.jsx` (rewrite) + `budgetUtils.js` (`formatMonthLabel` body change) + `budgetUtils.test.js` (update 3 expected values) + `HeatmapView.jsx` (WindowPicker prop change + currentMonthKey) + `HeatmapView.module.css` (`.headerMonthCurrent`)

**Step 2 — Integration pass (sequential, after all streams):**
All four streams touch `HeatmapView.jsx` and `HeatmapView.module.css` in different sections. After streams complete, perform one integration pass:

For `HeatmapView.jsx`, merge all stream edits in a single read-modify-write:
1. Import line: add `formatGroupLabel` (Stream 1)
2. After `ZONE_CLASS_MAP`: add `LEGEND_ITEMS` constant (Stream 3)
3. `HeatmapGroupRow` groupCard div: add conditional `groupCardExpanded` class (Stream 3)
4. `HeatmapGroupRow` groupName span: wrap with `formatGroupLabel(group.groupName)` (Stream 1)
5. `HeatmapGroupRow` categoryLabel div: wrap with `formatGroupLabel(cat.category_name, 12)` (Stream 1)
6. `HeatmapView` function: remove `canGoOlder`/`canGoNewer` (Stream 4), add `currentMonthKey` (Stream 4)
7. `HeatmapView` return: new WindowPicker props (Stream 4), legend markup after columnHeaders (Stream 3), current-month class on header span (Stream 4)

For `HeatmapView.module.css`, merge all stream edits in a single read-modify-write:
1. `.groupHeaderRow`: add `padding: 10px var(--sp-3)` (Stream 2)
2. `.categoryRow`: add `padding: 7px var(--sp-3)` (Stream 2)
3. `.groupCard`: add `border-left: 3px solid transparent` (Stream 2)
4. `.headerMonth`: after its closing brace, add `.headerMonthCurrent` (Stream 4)
5. `.groupCardExpanded`: new class (Stream 2)
6. `.groupContentInner`: add `background: var(--bg-inset)` (Stream 2)
7. Legend styles: `.legend`, `.legendItem`, `.legendDot`, `.legendLabel` (Stream 3)
8. Reduced-motion block: add `.groupCardExpanded { transition: none; }` (Stream 2)

For `budgetUtils.js`, merge Stream 1 and Stream 4 edits:
1. `formatMonthLabel` body: update format (Stream 4)
2. New `formatGroupLabel` function: insert after `formatMonthLabel` (Stream 1)

For `budgetUtils.test.js`, merge Stream 1 and Stream 4 edits:
1. Import line: add `formatGroupLabel` (Stream 1)
2. `formatMonthLabel` describe: update 3 expected values (Stream 4)
3. New `formatGroupLabel` describe block: insert after `formatMonthLabel` describe (Stream 1)

**Step 3 — Verify:**
- Run `make test` (all tests must pass)
- Playwright QA screenshot at 375px width

---

## Test Strategy

### Stream 1 — New tests

File: `frontend/src/utils/budgetUtils.test.js`

New `describe('formatGroupLabel')` block with 8 test cases:
1. `'returns name unchanged when it fits within maxLen (default 14)'` — "Housing" → "Housing"
2. `'returns name unchanged when length equals maxLen exactly'` — 13-char name with maxLen=14
3. `'truncates at word boundary for multi-word names exceeding maxLen'` — "Auto & Transport" → "Auto &"
4. `'returns only the first word when adding the second word would exceed maxLen'` — "Entertainment Bill" → "Entertainment"
5. `'hard-truncates with ellipsis when first word alone exceeds maxLen'` — "Extraordinarily" with maxLen=10 → ends with "…" and is length 10
6. `'returns "Other" for null input'`
7. `'returns "Other" for empty string input'`
8. `'accepts a custom maxLen override'`

No existing tests break in Stream 1.

### Stream 2 — No tests

Stream 2 is CSS-only. No test changes needed. Verify visually in Playwright QA.

### Stream 3 — New tests + fixes for broken tests

File: `frontend/src/components/mobile/HeatmapView.test.jsx`

New tests (add to existing `describe('HeatmapView')`):
1. `'renders the legend with 5 items'` — checks all 5 label texts are present, legend group is in DOM
2. `'legend is always visible regardless of group expand state'` — legend present before and after expand

Broken tests to fix (caused by Stream 4's WindowPicker rewrite removing the arrow buttons):
- Line 103: `'renders WindowPicker when months.length > 6'` — update query from `getByLabelText('Show older months')` to `getByRole('combobox', { name: /select 6-month window/i })`
- Line 108: `'does not render WindowPicker when months.length <= 6'` — update per new behavior: picker always renders; change assertion to confirm combobox is present with short month list

### Stream 4 — Rewrite + format update fixes

File: `frontend/src/components/mobile/WindowPicker.test.jsx` — complete rewrite (8 old tests removed, 9 new tests added):
1. `'renders trigger with role="combobox" and aria-label'`
2. `'trigger shows the date range of the current window'`
3. `'trigger has aria-expanded=false when closed'`
4. `'clicking trigger opens the month grid panel'`
5. `'month grid renders month abbreviations for the grid year'`
6. `'applies aria-selected to the current window-start month'`
7. `'clicking an available month calls onWindowStartChange with correct index'`
8. `'closes the panel after selecting a month'`
9. `'pressing Escape closes the panel without changing selection'`
10. `'months not in the available dataset are aria-disabled'`

File: `frontend/src/utils/budgetUtils.test.js` — update 3 expected values in `formatMonthLabel` describe:
- `toBe('Jan 26')` → `toBe("Jan '26")`
- `toBe('Dec 25')` → `toBe("Dec '25")`
- `.not.toBe('Dec 25')` → `.not.toBe("Dec '25")`

### Edge cases that must be covered

| Case | Test location | Test name |
|------|---------------|-----------|
| `formatGroupLabel(null)` → "Other" | `budgetUtils.test.js` | test 6 above |
| `formatGroupLabel("")` → "Other" | `budgetUtils.test.js` | test 7 above |
| Single long word → hard truncate with `…` | `budgetUtils.test.js` | test 5 above |
| Month not in dataset → `aria-disabled=true` | `WindowPicker.test.jsx` | test 10 above |
| Escape closes without firing callback | `WindowPicker.test.jsx` | test 9 above |
| Legend always visible | `HeatmapView.test.jsx` | legend test 2 above |
| Current month column header gets accent class | Playwright QA (visual) | — |
| `prefers-reduced-motion` disables transitions | Playwright QA or CSS-only (no unit test needed) | — |

---

## Integration Notes

### File conflicts by stream

| File | Streams that touch it | Conflict level |
|------|-----------------------|----------------|
| `budgetUtils.js` | 1 (add function), 4 (modify existing function) | Low — different lines |
| `budgetUtils.test.js` | 1 (new describe block + import), 4 (update 3 existing assertions) | Low — different sections |
| `HeatmapView.jsx` | 1 (import + 2 call sites), 3 (legend markup + groupCardExpanded class), 4 (WindowPicker props + currentMonthKey + header class) | Medium — 3 streams, but different sections of the file |
| `HeatmapView.module.css` | 2 (row padding + accent styles), 3 (legend styles), 4 (`.headerMonthCurrent`) | Medium — 3 streams, but different sections |
| `HeatmapView.test.jsx` | 3 only | None |
| `WindowPicker.jsx` | 4 only | None |
| `WindowPicker.module.css` | 4 only | None |
| `WindowPicker.test.jsx` | 4 only | None |

### Ordering constraint for the integration pass

The integration pass for `HeatmapView.jsx` must produce this final render structure inside `HeatmapView`:

```jsx
<div className={styles.heatmap}>
  <WindowPicker
    months={months}
    windowStart={windowStart}
    windowSize={WINDOW_SIZE}
    onWindowStartChange={setWindowStart}
  />

  <div role="grid" aria-label="Budget heatmap, 6-month overview">
    <div className={styles.columnHeaders} role="row">
      <div className={styles.headerLabel} />
      {displayMonths.map(m => (
        <span
          key={m}
          role="columnheader"
          className={`${styles.headerMonth} ${m === currentMonthKey ? styles.headerMonthCurrent : ''}`}
        >
          {formatMonthLabel(m)}
        </span>
      ))}
    </div>

    <div className={styles.legend} aria-label="Dot color legend" role="group">
      {LEGEND_ITEMS.map(item => (
        <span key={item.zone} className={styles.legendItem}>
          <span className={`${styles.legendDot} ${item.dotClass}`} aria-hidden="true" />
          <span className={styles.legendLabel}>{item.label}</span>
        </span>
      ))}
    </div>

    {groupedData.map(group => (
      <HeatmapGroupRow
        key={group.groupName}
        group={group}
        months={displayMonths}
      />
    ))}
  </div>
</div>
```

### `formatGroupLabel` test for "Auto & Transport"

"Auto & Transport" has 16 characters. The word-boundary accumulator runs:
- "Auto" → length 4, fits
- "Auto &" → length 6, fits
- "Auto & Transport" → length 16 > 14, stop

Result: "Auto &". The test case must assert `toBe('Auto &')` exactly, not use a regex. If a future group name changes test assumptions, update the fixture.

### `formatMonthLabel` timezone note

The updated `formatMonthLabel` splits the format call into two separate `toLocaleDateString` calls (once for `month: 'short'`, once for `year: '2-digit'`), then string-concatenates with a straight apostrophe `'`. Do not use `{ month: 'short', year: '2-digit' }` in a single call — the combined format can produce output like `"Jan '26"` on some locales but `"01/26"` or other formats on others. The split-call approach is locale-safe for `en-US` (which all callers already pin).

### ARIA ID uniqueness

`WindowPicker` must use `LISTBOX_ID = 'heatmap-window-listbox'`. `MonthDropdown` uses `'month-listbox'`. Both are mounted simultaneously in the `HorizontalSwipeContainer` swipe panes. Sharing an id would break ARIA linking and cause test failures. This is already encoded in the `WindowPicker.jsx` code sketch above.

### `formatGroupLabel` and `category_name` in `HeatmapGroupRow`

The `.categoryLabel` div has `padding-left: var(--sp-4)` (16px) inside the 110px label column, leaving approximately 94px for text. At 13px font with a 12-char max (`formatGroupLabel(cat.category_name, 12)`), the effective width budget is comfortable. The CSS `text-overflow: ellipsis` on `.categoryLabel` remains as a fallback for any font-rendering outliers.

---

## Rollback Notes

All changes are confined to three component files and two utility files, with no backend or schema changes.

- Git revert: `git revert <commit-sha>` restores all files atomically.
- Partial rollback by stream: Each stream's file set is exclusive (except the integration pass files). Reverting `WindowPicker.jsx` + `WindowPicker.module.css` + `WindowPicker.test.jsx` restores Stream 4's changes without affecting other streams. Reverting the three `budgetUtils` changes (formatMonthLabel + formatGroupLabel) restores Streams 1 and 4's utility changes.
- No data migrations. No DB changes. No new npm dependencies.
- The `hidden` prop is removed from WindowPicker — if rolling back only Stream 4, restore the old prop interface in `HeatmapView.jsx` as well (the `canGoOlder`/`canGoNewer` computations and the old `<WindowPicker hidden={...} .../>` call).
