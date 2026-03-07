# Heatmap Refinements — Final Implementation Plan

**Date:** 2026-03-07
**Change Size:** M
**Inputs:** initial plan, staff review (7 findings, 2 HIGH / 3 MEDIUM / 2 LOW), architecture decision, source files

---

## Staff Review Resolutions

Each finding addressed before the plan body.

### Finding 1 (HIGH) — WindowPicker handleSelect index mapping is inverted

**Resolution:** The initial plan's `handleSelect` called `onWindowStartChange(idx)` where `idx = months.indexOf(selectedMonth)`. Because `months` is sorted most-recent-first, this made the selected month the *newest* visible month, not the oldest — the opposite of the architecture spec ("selecting a month sets windowStart so that month is the oldest visible month").

**Fix applied:**
- `handleSelect` now computes `const newStart = Math.max(0, idx - (windowSize - 1))` before calling `onWindowStartChange(newStart)`. This ensures the selected month lands at `months[newStart + windowSize - 1]` — the oldest position in the window.
- The `aria-selected` comparison is corrected from `monthKey === oldestMonth` to compare against `months[windowStart + windowSize - 1]` explicitly (the actual oldest month key), making the comparison semantically correct even when the window is clamped at the boundary.
- The test case "clicking an available month calls onWindowStartChange with correct index" is recalculated with the new formula: clicking Nov 2025 (index 4) with `windowSize=6` → `newStart = Math.max(0, 4 - 5) = 0`, so `onWindowStartChange(0)` is expected.
- Variable names `oldestMonth` / `newestMonth` are kept but their computed value is now confirmed correct: `windowSlice[windowSlice.length - 1]` is indeed the oldest (largest index in months array = furthest in the past).

### Finding 2 (HIGH) — aria-disabled should be omitted for enabled options, not set to "false"

**Resolution:** Changed `aria-disabled={disabled}` to `aria-disabled={disabled || undefined}`. When `disabled` is `false`, passing `undefined` causes React to omit the attribute entirely, which is the ARIA best practice (no noise in the accessibility tree). When `disabled` is `true`, the attribute renders as `aria-disabled="true"`.

Test updated: replaced `expect(sepOption).toHaveAttribute('aria-disabled', 'false')` with `expect(sepOption).not.toHaveAttribute('aria-disabled')`.

### Finding 3 (MEDIUM) — Stream 3 / Stream 4 hidden dependency on HeatmapView.test.jsx

**Resolution:** The broken-test fixes (queries for old arrow-button aria-labels in `HeatmapView.test.jsx` lines 103–111) are moved from Stream 3 to the **integration pass (Step 2)**. Stream 3 now only adds the two new legend tests; it does not touch the WindowPicker-dependent assertions. The integration pass applies the broken-test fixes after Stream 4 completes.

Parallelism tags updated accordingly: Stream 3's `HeatmapView.test.jsx` edit is now limited to appending new legend tests (truly independent). The two WindowPicker-dependent test fixes appear only in Step 2 with `depends-on: Stream 4`.

### Finding 4 (MEDIUM) — Missing `undefined` test case for formatGroupLabel

**Resolution:** Added an eighth test case: `'returns "Other" for undefined input'` → `expect(formatGroupLabel(undefined)).toBe('Other')`. The implementation already handles this via `if (!name) return 'Other'` (undefined is falsy), so no code change is needed — only the test was missing. The test suite now explicitly covers `null`, `undefined`, and `""`.

### Finding 5 (MEDIUM) — border-left visual artifact at rounded corners

**Resolution:** The architecture doc explicitly chose `border-left` over `box-shadow` (arch doc section 6 "Rejected alternatives") for predictability reasons. We preserve that decision but add a targeted QA note. The `.groupCard` CSS now also explicitly sets `border-top-left-radius: 0` and `border-bottom-left-radius: 0` when expanded — wait, that would change the shape. Instead, the approach is as the architecture chose: keep `border-radius: var(--radius-lg)` on `.groupCard` and use `border-left: 3px solid transparent` (collapsed) / `border-left-color: var(--accent)` (expanded). The 3px vs 1px asymmetry with 12px border-radius is a known visual judgment call.

**QA checklist addition:** A specific Playwright QA check is added — inspect the top-left and bottom-left corners of an expanded group card at 375px. If the corner artifacts are unacceptable at QA time, the implementer should switch to `box-shadow: inset 3px 0 0 var(--accent)` on `.groupCardExpanded` and remove the `border-left` approach. This is documented as a contingency in the Rollback Notes.

### Finding 6 (LOW) — formatRangeMonth JSDoc says "full month name" but uses short format

**Resolution:** JSDoc updated to say "short month name + 4-digit year" (e.g., "Sep 2025"). The implementation correctly uses `{ month: 'short' }` for the trigger label; the JSDoc was simply wrong. No code change.

### Finding 7 (LOW) — Missing click-outside test for WindowPicker

**Resolution:** Added a tenth test case to `WindowPicker.test.jsx`:
```js
it('closes panel when clicking outside the component', () => {
  renderPicker()
  fireEvent.click(screen.getByRole('combobox'))
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  fireEvent.mouseDown(document.body)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
```
The test count in the Stream 4 section is corrected from "9 tests" to "10 tests".

---

## Overview

Six visual and interaction refinements to `HeatmapView` and `WindowPicker`. All changes are frontend-only. Work is organized into four parallel streams, each owning an exclusive primary file set, plus a sequential integration pass that merges overlapping edits to `HeatmapView.jsx`, `HeatmapView.module.css`, `budgetUtils.js`, and `budgetUtils.test.js`.

Key architectural decisions (from approved architecture doc, unchanged):
- Aggregate dots stay at 12px (Change B only adds row padding)
- `formatMonthLabel` is modified in place (only two callers, both heatmap components)
- Legend shows 5 states including "No data"
- WindowPicker is a complete rewrite with a new prop interface
- Label column stays at 110px

**Stream summary:**
| Stream | Changes | Independently runnable |
|--------|---------|------------------------|
| Stream 1: Smart Labels | A | Yes |
| Stream 2: CSS Polish | B, E | Yes |
| Stream 3: Legend | D | Yes (legend tests only — broken-test fixes moved to integration) |
| Stream 4: Picker + Month Format | C, F | Yes |
| Integration pass | merge all | After all streams |

---

## Changes by Stream

---

### Stream 1: Smart Labels (Change A)

**Scope:** `budgetUtils.js` (new export), `budgetUtils.test.js` (new tests + import update), `HeatmapView.jsx` (import + 2 call sites)

---

#### File: `frontend/src/utils/budgetUtils.js`
Lines: insert after `formatMonthLabel` function (currently lines 74–79), before `groupExpenses`
Parallelism: independent

Description: Add `formatGroupLabel(name, maxLen = 14)` export. Implements word-boundary abbreviation with single-long-word fallback.

Details:
- Insert the following function block (with JSDoc) between `formatMonthLabel` and `groupExpenses`:

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
 * @param {string|null|undefined} name - The group or category name to abbreviate
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

- No changes to existing functions.

---

#### File: `frontend/src/utils/budgetUtils.test.js`
Lines: add import, append new describe block after `formatMonthLabel` describe block, before `groupExpenses` describe block
Parallelism: independent

Description: Add `formatGroupLabel` to the import and add a new `describe('formatGroupLabel')` block with 9 test cases (8 from initial plan + 1 added per Finding 4).

Details:
- Update the import line (line 3) to add `formatGroupLabel`:
  ```js
  import { getBudgetZone, getPillAriaLabel, WARNING_THRESHOLD,
           groupExpenses, formatMonthLabel, formatGroupLabel } from './budgetUtils.js'
  ```

- Insert the following describe block after the `formatMonthLabel` describe block:

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
    // Words: "Auto" (4) fits, "Auto &" (6) fits, "Auto & Transport" (16 > 14) stop
    expect(formatGroupLabel('Auto & Transport')).toBe('Auto &')
  })

  it('returns only the first word when adding the second word would exceed maxLen', () => {
    // "Entertainment" = 13 chars fits; "Entertainment Bill" = 18 chars
    expect(formatGroupLabel('Entertainment Bill')).toBe('Entertainment')
  })

  it('hard-truncates with ellipsis when first word alone exceeds maxLen', () => {
    const result = formatGroupLabel('Extraordinarily', 10)
    expect(result).toHaveLength(10)
    expect(result).toMatch(/…$/)
  })

  it('returns "Other" for null input', () => {
    expect(formatGroupLabel(null)).toBe('Other')
  })

  it('returns "Other" for undefined input', () => {
    // Finding 4: explicitly test undefined (falsy check covers it but test was missing)
    expect(formatGroupLabel(undefined)).toBe('Other')
  })

  it('returns "Other" for empty string input', () => {
    expect(formatGroupLabel('')).toBe('Other')
  })

  it('accepts a custom maxLen override', () => {
    const result = formatGroupLabel('Auto & Transport', 12)
    expect(result.length).toBeLessThanOrEqual(12)
  })
})
```

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: import line (~line 3), groupName span (~line 69), categoryLabel div (~line 90) — Stream 1 edits only
Parallelism: independent (these edits are in different JSX locations from Streams 3 and 4; all HeatmapView.jsx edits are merged in the integration pass)

Description: Import `formatGroupLabel` and apply it at both label render sites.

Details:
- Import line: add `formatGroupLabel` to the existing import from `budgetUtils.js`:
  ```js
  import { groupExpenses, getBudgetZone, formatMonthLabel, formatGroupLabel } from '../../utils/budgetUtils.js'
  ```
- `HeatmapGroupRow` — groupName span: wrap group name:
  ```jsx
  <span className={styles.groupName}>{formatGroupLabel(group.groupName)}</span>
  ```
- `HeatmapGroupRow` — categoryLabel div: wrap category name with shorter maxLen (child rows have `padding-left: var(--sp-4)` eating into the 110px label column):
  ```jsx
  <div className={styles.categoryLabel} role="rowheader">
    {formatGroupLabel(cat.category_name, 12)}
  </div>
  ```

---

### Stream 2: CSS Polish (Changes B + E)

**Scope:** `HeatmapView.module.css` only — no JSX changes.

Note: Stream 2 and Stream 3 both touch `HeatmapView.module.css`. During integration, apply both sets of CSS changes in one pass. The changes target different sections of the file and do not overlap.

---

#### File: `frontend/src/components/mobile/HeatmapView.module.css`
Lines: `.groupHeaderRow` (~lines 34–41), `.categoryRow` (~lines 90–96), `.groupCard` (~lines 27–32), new `.groupCardExpanded`, `.groupContentInner` (~lines 86–88), reduced-motion block (~lines 159–166)
Parallelism: independent

Description: Add vertical row padding (Change B) and expanded group accent styles (Change E). Per Finding 5, the border-radius visual artifact risk is noted and a QA contingency is documented.

Details for Change B (row padding):
- `.groupHeaderRow`: change `padding: 0 var(--sp-3)` to `padding: 10px var(--sp-3)`. Existing `min-height: 44px` remains.
- `.categoryRow`: change `padding: 0 var(--sp-3)` to `padding: 7px var(--sp-3)`. Existing `min-height: 36px` remains.

Details for Change E (expanded group accent):
- `.groupCard`: add `border-left: 3px solid transparent;` to reserve space (zero layout shift on expand). Full updated rule:
  ```css
  .groupCard {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 3px solid transparent;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  ```
  Note (Finding 5): The 3px left vs 1px elsewhere asymmetry combined with `border-radius: var(--radius-lg)` (12px) may create corner artifacts. During Playwright QA, inspect the top-left and bottom-left corners of an expanded group card at 375px width. If the corners look off, switch `.groupCardExpanded` to use `box-shadow: inset 3px 0 0 var(--accent)` and remove the `border-left` color change — this is a drop-in substitute that avoids the asymmetry.

- New class `.groupCardExpanded` immediately after `.groupCard`:
  ```css
  .groupCardExpanded {
    border-left-color: var(--accent);
    transition: border-left-color var(--ease-default);
  }
  ```

- `.groupContentInner`: add `background: var(--bg-inset)`:
  ```css
  .groupContentInner {
    min-height: 0;
    background: var(--bg-inset);
  }
  ```

- Reduced-motion block: add `.groupCardExpanded` suppression:
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

**Scope:** `HeatmapView.jsx` (legend constant + legend markup + groupCardExpanded class toggle), `HeatmapView.module.css` (legend styles), `HeatmapView.test.jsx` (new legend tests ONLY — broken WindowPicker test fixes moved to integration pass per Finding 3)

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: after `ZONE_CLASS_MAP` constant (~line 15), `HeatmapGroupRow` groupCard div (~line 49), `HeatmapView` return body (~lines 143–184)
Parallelism: independent (Stream 3 JSX edits; all HeatmapView.jsx changes merged in integration pass)

Description: Add `LEGEND_ITEMS` constant, add `.groupCardExpanded` conditional class (Change E JSX), add legend markup (Change D).

Details for Change E JSX (groupCard div):
- Change:
  ```jsx
  <div className={styles.groupCard}>
  ```
  to:
  ```jsx
  <div className={`${styles.groupCard} ${isExpanded ? styles.groupCardExpanded : ''}`}>
  ```

Details for Change D (legend):
- Add `LEGEND_ITEMS` as a module-level constant after `ZONE_CLASS_MAP` (after line 15):
  ```js
  const LEGEND_ITEMS = [
    { zone: 'safe',      label: 'Under 85%',      dotClass: styles.dotSafe },
    { zone: 'warning',   label: '85 \u2013 100%', dotClass: styles.dotWarning },
    { zone: 'over',      label: 'Over 100%',      dotClass: styles.dotOver },
    { zone: 'no-budget', label: 'No budget',      dotClass: styles.dotMuted },
    { zone: 'no-data',   label: 'No data',        dotClass: styles.dotFaint },
  ]
  ```
  Note: `'85 \u2013 100%'` uses an en-dash (U+2013) matching the design brief.

- Inside the `HeatmapView` return, within the `role="grid"` div, insert the legend between the `.columnHeaders` row and the `{groupedData.map(...)}` call:
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
Lines: append before the `@media (prefers-reduced-motion: reduce)` block
Parallelism: independent (Stream 3 adds legend styles; Stream 2 handles row padding, accent, and reduced-motion block; Stream 4 adds `.headerMonthCurrent` — all different sections)

Description: Add legend styles.

Details:
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

Note: `.legendDot` pairs with the existing `.dotSafe`, `.dotWarning`, `.dotOver`, `.dotMuted`, `.dotFaint` classes (those set `background` only, which is compatible).

---

#### File: `frontend/src/components/mobile/HeatmapView.test.jsx`
Lines: append after existing last test (~line 162)
Parallelism: independent

Description: Add legend rendering tests ONLY. The two WindowPicker-dependent broken tests (lines 103–111) are NOT touched in Stream 3 — those fixes belong in the integration pass after Stream 4 completes (Finding 3 fix).

Details — append inside the existing `describe('HeatmapView')` block:
```js
it('renders the legend with 5 items', () => {
  renderHeatmap()
  const legend = screen.getByRole('group', { name: /dot color legend/i })
  expect(legend).toBeInTheDocument()
  expect(screen.getByText('Under 85%')).toBeInTheDocument()
  expect(screen.getByText('85 \u2013 100%')).toBeInTheDocument()
  expect(screen.getByText('Over 100%')).toBeInTheDocument()
  expect(screen.getByText('No budget')).toBeInTheDocument()
  expect(screen.getByText('No data')).toBeInTheDocument()
})

it('legend is always visible regardless of group expand state', () => {
  renderHeatmap()
  expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
  const groupHeaders = screen.getAllByRole('rowheader')
    .filter(el => el.hasAttribute('aria-expanded'))
  fireEvent.click(groupHeaders[0])
  expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
})
```

---

### Stream 4: Picker + Month Format (Changes C + F)

**Scope:** `WindowPicker.jsx` (complete rewrite), `WindowPicker.module.css` (complete rewrite), `WindowPicker.test.jsx` (complete rewrite), `budgetUtils.js` (update `formatMonthLabel`), `budgetUtils.test.js` (update 3 expected values), `HeatmapView.jsx` (WindowPicker prop changes + currentMonthKey + current-month accent header), `HeatmapView.module.css` (`.headerMonthCurrent`)

---

#### File: `frontend/src/utils/budgetUtils.js`
Lines: 74–79 (`formatMonthLabel` function body)
Parallelism: independent (Stream 1 adds a new function after this one; no line overlap)

Description: Update `formatMonthLabel` to output `"Sep '25"` format with a straight apostrophe before the 2-digit year.

Details:
- Replace the `formatMonthLabel` function body with:
  ```js
  export function formatMonthLabel(monthKey) {
    const d = new Date(monthKey + 'T00:00:00')
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const year  = d.toLocaleDateString('en-US', { year: '2-digit' })
    return `${month} '${year}`
  }
  ```
- Update the JSDoc `@returns` example from the old format to `"Sep '25"`.
- Do not change any other function.

---

#### File: `frontend/src/utils/budgetUtils.test.js`
Lines: `formatMonthLabel` describe block (~lines 178–192)
Parallelism: independent

Description: Update expected values in the `formatMonthLabel` tests to match the new apostrophe format.

Details:
- `toBe('Jan 26')` → `toBe("Jan '26")`
- `toBe('Dec 25')` → `toBe("Dec '25")`
- `.not.toBe('Dec 25')` → `.not.toBe("Dec '25")`
- No other changes to `budgetUtils.test.js` in Stream 4.

---

#### File: `frontend/src/components/mobile/WindowPicker.jsx`
Lines: entire file (complete rewrite)
Parallelism: independent

Description: Replace the arrow-nav component with a combobox trigger (shows window range) that opens a month-grid panel. New prop interface. Fixes applied per Finding 1 (handleSelect index formula) and Finding 2 (aria-disabled conditional rendering).

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
 * Combobox trigger showing the current 6-month window range.
 * Opens a month-grid panel (3 columns × 4 rows per year) for jump-to-any-month
 * navigation. Follows the ARIA combobox/listbox pattern.
 *
 * Props:
 *   months              — full sorted array of ISO date strings, most-recent-first
 *   windowStart         — current offset index into months[] (0 = most recent window)
 *   windowSize          — number of months in the window (always 6)
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
   * Finding 1 fix: The selected month should become the OLDEST in the 6-month window.
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
      setFocusedKey(gridMonths[Math.min(currentIdx + 1, gridMonths.length - 1)])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedKey(gridMonths[Math.max(currentIdx - 1, 0)])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedKey(gridMonths[Math.min(currentIdx + 3, gridMonths.length - 1)])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedKey(gridMonths[Math.max(currentIdx - 3, 0)])
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

Description: Remove all 8 arrow-nav tests. Write 10 new tests (9 from initial plan + 1 click-outside test per Finding 7). `aria-disabled` assertions updated per Finding 2. `onWindowStartChange` expected value recalculated per Finding 1.

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

// windowStart=2 means the window covers months[2..7]:
//   months[2]='2026-01-01' (newest), months[7]='2025-08-01' (oldest)
// selectedMonthKey = months[windowStart + windowSize - 1] = months[7] = '2025-08-01'
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
    // windowStart=2, windowSize=6:
    //   oldest = months[7] = '2025-08-01' → "Aug 2025"
    //   newest = months[2] = '2026-01-01' → "Jan 2026"
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
    // Panel opens on the year of the oldest window month (2025 for windowStart=2)
    expect(screen.getByRole('option', { name: /Jan/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dec/ })).toBeInTheDocument()
  })

  it('applies aria-selected to the oldest month in the current window', () => {
    // windowStart=2, windowSize=6: selectedMonthKey = months[7] = '2025-08-01' → Aug
    // Finding 1 fix: selection marks the OLDEST month, not months[windowStart]
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    const selectedOptions = options.filter(o => o.getAttribute('aria-selected') === 'true')
    expect(selectedOptions).toHaveLength(1)
    expect(selectedOptions[0]).toHaveTextContent('Aug')
  })

  it('clicking an available month calls onWindowStartChange with correct index', () => {
    // Finding 1 fix: handleSelect computes newStart = Math.max(0, idx - (windowSize - 1))
    // Nov 2025 is at index 4 in MONTHS_8.
    // newStart = Math.max(0, 4 - (6 - 1)) = Math.max(0, 4 - 5) = Math.max(0, -1) = 0
    // So onWindowStartChange(0) is expected.
    const onWindowStartChange = vi.fn()
    renderPicker({ windowStart: 0, onWindowStartChange })
    fireEvent.click(screen.getByRole('combobox'))
    // windowStart=0 → oldest = months[5] = '2025-10-01' → grid opens on year 2025
    const options = screen.getAllByRole('option')
    const novOption = options.find(o => o.textContent === 'Nov')
    fireEvent.click(novOption)
    expect(onWindowStartChange).toHaveBeenCalledWith(0)
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

  it('months not in the available dataset have aria-disabled attribute', () => {
    // Finding 2 fix: aria-disabled="true" is present for disabled months;
    //               aria-disabled is absent (not "false") for enabled months.
    renderPicker({
      months: ['2025-09-01', '2025-10-01', '2025-11-01',
               '2025-12-01', '2026-01-01', '2026-02-01'],
      windowStart: 0,
      windowSize: 6,
    })
    fireEvent.click(screen.getByRole('combobox'))
    // Grid opens on 2025. Jan–Aug 2025 are not in the months array → disabled.
    const options = screen.getAllByRole('option')
    const janOption = options.find(o => o.textContent === 'Jan')
    expect(janOption).toHaveAttribute('aria-disabled', 'true')
    // Sep 2025 is available → aria-disabled attribute must NOT be present
    const sepOption = options.find(o => o.textContent === 'Sep')
    expect(sepOption).not.toHaveAttribute('aria-disabled')
  })

  it('closes panel when clicking outside the component', () => {
    // Finding 7: click-outside test was missing from initial plan
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
```

---

#### File: `frontend/src/components/mobile/HeatmapView.jsx`
Lines: `canGoOlder`/`canGoNewer` constants (~lines 143–144), WindowPicker usage (~lines 157–164), currentMonthKey (~line 145 area), column header map (~line 169)
Parallelism: depends-on Stream 3 (both touch HeatmapView.jsx — merged in integration pass)

Description: Update WindowPicker props to new interface, add `currentMonthKey` computation, remove old `canGoOlder`/`canGoNewer`, add current-month accent class to column headers.

Details:
- Remove: `const canGoOlder = windowStart + WINDOW_SIZE < months.length` and `const canGoNewer = windowStart > 0`
- Add before the `groupedData` useMemo:
  ```js
  const currentMonthKey = new Date().toISOString().slice(0, 7) + '-01'
  ```
- Replace old `<WindowPicker .../>` with:
  ```jsx
  <WindowPicker
    months={months}
    windowStart={windowStart}
    windowSize={WINDOW_SIZE}
    onWindowStartChange={setWindowStart}
  />
  ```
- Column header map update:
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
Lines: after `.headerMonth` rule (~lines 20–25)
Parallelism: depends-on Stream 2 (both touch this file — merged in integration pass)

Description: Add `.headerMonthCurrent` for the cobalt accent on the current month column.

Details:
- Insert immediately after the `.headerMonth` closing brace:
  ```css
  .headerMonthCurrent {
    color: var(--accent);
    font-weight: 500;
  }
  ```

---

## Dependency Order

### Step 1 — All streams in parallel (independent primary files)

Run these four concurrently:

- **Stream 1:** `budgetUtils.js` (add `formatGroupLabel`) + `budgetUtils.test.js` (import + new describe block) + `HeatmapView.jsx` (import + 2 label call sites)
- **Stream 2:** `HeatmapView.module.css` (row padding, `.groupCard` border-left, `.groupCardExpanded`, `.groupContentInner`, reduced-motion block)
- **Stream 3:** `HeatmapView.jsx` (legend constant + markup + groupCardExpanded class) + `HeatmapView.module.css` (legend styles) + `HeatmapView.test.jsx` (legend tests ONLY — no WindowPicker test fixes)
- **Stream 4:** `WindowPicker.jsx` (rewrite) + `WindowPicker.module.css` (rewrite) + `WindowPicker.test.jsx` (rewrite) + `budgetUtils.js` (`formatMonthLabel` update) + `budgetUtils.test.js` (3 expected value updates) + `HeatmapView.jsx` (WindowPicker props + currentMonthKey + header class) + `HeatmapView.module.css` (`.headerMonthCurrent`)

### Step 2 — Integration pass (sequential, after all streams complete)

Apply all stream edits to the four shared files in one read-modify-write per file:

**`HeatmapView.jsx` — merge order:**
1. Import line: add `formatGroupLabel` (Stream 1)
2. After `ZONE_CLASS_MAP`: add `LEGEND_ITEMS` constant (Stream 3)
3. `HeatmapGroupRow` groupCard div: add conditional `groupCardExpanded` class (Stream 3)
4. `HeatmapGroupRow` groupName span: wrap with `formatGroupLabel(group.groupName)` (Stream 1)
5. `HeatmapGroupRow` categoryLabel div: wrap with `formatGroupLabel(cat.category_name, 12)` (Stream 1)
6. Remove `canGoOlder`/`canGoNewer`; add `currentMonthKey` (Stream 4)
7. Replace WindowPicker props (Stream 4); insert legend markup after `.columnHeaders` (Stream 3); add `headerMonthCurrent` class to column header spans (Stream 4)

**`HeatmapView.test.jsx` — apply WindowPicker broken-test fixes (Finding 3: moved from Stream 3 to here):**
- Line 103–106: update `'renders WindowPicker when months.length > 6'` to query `getByRole('combobox', { name: /select 6-month window/i })`
- Line 108–111: update `'does not render WindowPicker when months.length <= 6'` — picker now always renders; replace assertion to confirm combobox is present with a short month list

**`HeatmapView.module.css` — merge order:**
1. `.groupHeaderRow`: add `padding: 10px var(--sp-3)` (Stream 2)
2. `.categoryRow`: add `padding: 7px var(--sp-3)` (Stream 2)
3. `.groupCard`: add `border-left: 3px solid transparent` (Stream 2)
4. After `.headerMonth`: add `.headerMonthCurrent` (Stream 4)
5. `.groupCardExpanded`: new class (Stream 2)
6. `.groupContentInner`: add `background: var(--bg-inset)` (Stream 2)
7. Legend styles: `.legend`, `.legendItem`, `.legendDot`, `.legendLabel` (Stream 3)
8. Reduced-motion block: add `.groupCardExpanded { transition: none; }` (Stream 2)

**`budgetUtils.js` — merge order:**
1. `formatMonthLabel` body: update format (Stream 4)
2. New `formatGroupLabel` function: insert after `formatMonthLabel` (Stream 1)

**`budgetUtils.test.js` — merge order:**
1. Import line: add `formatGroupLabel` (Stream 1)
2. `formatMonthLabel` describe: update 3 expected values (Stream 4)
3. New `formatGroupLabel` describe block: insert after `formatMonthLabel` describe (Stream 1)

### Step 3 — Verify

- Run `make test` — all tests must pass (new + existing)
- Playwright QA screenshot at 375px — inspect legend, picker trigger, expanded group border corners (Finding 5 contingency)

---

## Test Strategy

### Stream 1 — New tests (budgetUtils.test.js)

New `describe('formatGroupLabel')` with 9 cases:
1. Short name within maxLen — no-op
2. Name exactly at maxLen boundary — no-op
3. Multi-word truncation at word boundary — "Auto & Transport" → "Auto &"
4. First word fits but second word would exceed — "Entertainment Bill" → "Entertainment"
5. Single long word hard-truncated with ellipsis
6. `null` input → "Other"
7. `undefined` input → "Other" (Finding 4 addition)
8. Empty string input → "Other"
9. Custom maxLen override

No existing tests break in Stream 1.

### Stream 2 — No tests (CSS-only)

Visual verification in Playwright QA only.

### Stream 3 — New tests (HeatmapView.test.jsx)

New tests (legend tests ONLY — broken WindowPicker tests moved to integration pass per Finding 3):
1. `'renders the legend with 5 items'` — checks all 5 label texts, legend group in DOM
2. `'legend is always visible regardless of group expand state'` — legend present before and after expand

### Stream 4 — Rewrite tests (WindowPicker.test.jsx) + format fix (budgetUtils.test.js)

`WindowPicker.test.jsx` complete rewrite — 10 tests (9 from initial plan + 1 per Finding 7):
1. Renders trigger with role="combobox" and aria-label
2. Trigger shows date range of current window
3. Trigger has aria-expanded=false when closed
4. Clicking trigger opens the month grid panel
5. Month grid renders month abbreviations for the grid year
6. Applies aria-selected to the **oldest** month in the current window (Finding 1 fix — Aug, not Jan)
7. Clicking an available month calls onWindowStartChange with **corrected** index (Finding 1: newStart formula)
8. Closes panel after selecting a month
9. Pressing Escape closes panel without changing selection
10. Closes panel when clicking outside the component (Finding 7 addition)
11. (Numbered as test in the list) Months not in dataset have `aria-disabled="true"`; available months do NOT have `aria-disabled` attribute (Finding 2 fix)

`budgetUtils.test.js` — update 3 expected values in `formatMonthLabel` describe:
- `toBe('Jan 26')` → `toBe("Jan '26")`
- `toBe('Dec 25')` → `toBe("Dec '25")`
- `.not.toBe('Dec 25')` → `.not.toBe("Dec '25")`

### Integration pass — 2 additional test fixes (HeatmapView.test.jsx)

- Update `'renders WindowPicker when months.length > 6'` query
- Update `'does not render WindowPicker when months.length <= 6'` assertion

### Edge cases covered

| Case | Location |
|------|----------|
| `formatGroupLabel(null)` → "Other" | budgetUtils.test.js test 6 |
| `formatGroupLabel(undefined)` → "Other" | budgetUtils.test.js test 7 (Finding 4) |
| `formatGroupLabel("")` → "Other" | budgetUtils.test.js test 8 |
| Single long word → hard truncate with `…` | budgetUtils.test.js test 5 |
| Month not in dataset → `aria-disabled="true"` | WindowPicker.test.jsx test 10 |
| Available month → `aria-disabled` attribute absent | WindowPicker.test.jsx test 10 (Finding 2) |
| Click-outside closes panel | WindowPicker.test.jsx test 11 (Finding 7) |
| Escape closes without firing callback | WindowPicker.test.jsx test 9 |
| Selected month becomes OLDEST in window | WindowPicker.test.jsx test 6 + 7 (Finding 1) |
| Legend always visible | HeatmapView.test.jsx legend test 2 |
| Current month column header gets accent class | Playwright QA (visual) |
| `prefers-reduced-motion` disables transitions | CSS-only, no unit test needed |
| border-left corner artifact on expanded group | Playwright QA (Finding 5 contingency) |

---

## Integration Notes

### File conflicts by stream

| File | Streams that touch it | Conflict level | Resolution |
|------|-----------------------|----------------|------------|
| `budgetUtils.js` | 1 (add function), 4 (modify existing function) | Low — different lines | Single merge in integration pass |
| `budgetUtils.test.js` | 1 (new describe + import), 4 (update 3 assertions) | Low — different sections | Single merge in integration pass |
| `HeatmapView.jsx` | 1 (import + 2 call sites), 3 (legend + groupCardExpanded), 4 (picker props + currentMonthKey + header class) | Medium — 3 streams, different sections | Single merge in integration pass |
| `HeatmapView.module.css` | 2 (row padding + accent styles), 3 (legend styles), 4 (`.headerMonthCurrent`) | Medium — 3 streams, different sections | Single merge in integration pass |
| `HeatmapView.test.jsx` | 3 (legend tests only), integration pass (broken-test fixes) | Low — different times | Stream 3 adds; integration pass fixes |
| `WindowPicker.jsx` | 4 only | None | — |
| `WindowPicker.module.css` | 4 only | None | — |
| `WindowPicker.test.jsx` | 4 only | None | — |

### Final HeatmapView.jsx render structure (authoritative)

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

### WindowPicker selection formula (authoritative — Finding 1)

`months[]` is sorted most-recent-first. Index 0 is the newest month; higher indices are older months.

- `windowSlice = months.slice(windowStart, windowStart + windowSize)`
- `windowSlice[0]` = newest month in window = `months[windowStart]`
- `windowSlice[windowSize - 1]` = oldest month in window = `months[windowStart + windowSize - 1]`

When user selects month M (wanting it to be the oldest in the window):
```
idx = months.indexOf(M)
newStart = Math.max(0, idx - (windowSize - 1))
// months[newStart + windowSize - 1] = M (when not clamped)
```

`aria-selected` marks `months[windowStart + windowSize - 1]` (the actual oldest), stored as `selectedMonthKey` in the component.

### ARIA ID uniqueness

`WindowPicker` uses `LISTBOX_ID = 'heatmap-window-listbox'`. `MonthDropdown` uses `'month-listbox'`. Both are mounted simultaneously in the `HorizontalSwipeContainer`. Sharing an id would break ARIA linking and cause test failures.

### formatMonthLabel timezone safety

The updated `formatMonthLabel` splits into two separate `toLocaleDateString` calls (month, then year) and concatenates with a straight apostrophe `'`. Do NOT use `{ month: 'short', year: '2-digit' }` in a single combined call — combined format output varies by locale. The split-call approach pins `en-US` for both calls safely.

### formatGroupLabel "Auto & Transport" trace

"Auto & Transport" = 16 chars. Word-boundary accumulator:
- "Auto" → length 4, fits (result = "Auto")
- "Auto &" → length 6, fits (result = "Auto &")
- "Auto & Transport" → length 16 > 14, break

Result: "Auto &". Test must assert `toBe('Auto &')` exactly.

---

## Rollback Notes

All changes are confined to three component files, two utility files, and their test files. No backend changes. No schema changes. No new npm dependencies.

- **Full rollback:** `git revert <commit-sha>` restores all files atomically.
- **Stream-level rollback:**
  - Reverting `WindowPicker.jsx` + `WindowPicker.module.css` + `WindowPicker.test.jsx` restores Stream 4's component changes. Also restore the old `canGoOlder`/`canGoNewer` computations and old `<WindowPicker .../>` props in `HeatmapView.jsx`.
  - Reverting `budgetUtils.js` `formatGroupLabel` addition is safe (no callers outside heatmap files).
  - Reverting `budgetUtils.js` `formatMonthLabel` change restores the old format and requires reverting the 3 `budgetUtils.test.js` expected values.
- **Finding 5 contingency (border-left artifact):** If Playwright QA reveals corner artifacts on expanded group cards, apply this targeted fix without reverting other changes:
  - Remove `border-left: 3px solid transparent` from `.groupCard`
  - Change `.groupCardExpanded` to: `box-shadow: inset 3px 0 0 var(--accent); transition: box-shadow var(--ease-default);`
  - Update the reduced-motion block accordingly
  - The `border: 1px solid var(--border)` on `.groupCard` already covers all four sides; the box-shadow inset approach adds the accent stripe without touching the border geometry.
