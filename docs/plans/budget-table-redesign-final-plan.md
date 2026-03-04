# Final Implementation Plan: Budget Table Progress Bars

**Agent:** Engineer (Step 5 of planning pipeline — Final Plan)
**Date:** 2026-03-03
**Inputs:** Initial plan (`budget-table-redesign-plan.md`), staff review (`budget-table-redesign-review.md`), architecture doc (`budget-table-redesign-architecture.md`), current source files
**Status:** All MUST FIX and SHOULD FIX findings from the staff review are addressed below.

---

## Staff Review Corrections Applied

### MUST FIX #1 — Scope existing `[class*="over"]` and `[class*="under"]` tests to `span`

**Finding:** After the change, `.barOver` bar `<div>` elements will also match `[class*="over"]` (since "over" is a substring of "barOver" after CSS module transformation). The existing test was designed to verify text spans — it will silently count bar divs too, masking future regressions.

**Plan change:** In `BudgetTable.test.jsx`, update both existing class tests (lines 72 and 80) to use `span[class*="over"]` and `span[class*="under"]` respectively. This scopes the query to spans only, preserving the test's original intent.

---

### MUST FIX #3 — Cap `aria-valuenow` at 100 to stay within WAI-ARIA spec

**Finding:** Setting `aria-valuenow={105}` when `aria-valuemax={100}` is a spec violation that will flag in axe-core and Lighthouse audits. The `aria-label` already announces the full percentage (e.g., "105% of budget spent"), so `aria-valuenow` need not exceed 100.

**Plan change:** In `CellValue`, compute `ariaValueNow = Math.min(rawPctRounded, 100)` and use that on the `aria-valuenow` attribute. The `aria-label` continues to use `rawPctRounded` (the uncapped value), which is the primary human-readable announcement.

**Consequence for Test #10 (ARIA test):** The test previously expected `aria-valuenow="105"` for the Groceries Nov over-budget bar (523/500 = 105 rounded). The corrected test must expect `aria-valuenow="100"` and verify the `aria-label` still says "105% of budget spent".

---

### MUST FIX #4 — Use consistent integer rounding for both bar width and ARIA

**Finding:** The initial plan used `toFixed(1)` for bar width (producing "97.8%") and `Math.round` for `aria-valuenow` (producing 98). This means the screen reader announces "98%" while the bar is at 97.8% — a minor but unnecessary discrepancy.

**Plan change:** Use `Math.round` for both. Bar width becomes `${Math.round(barPct * 100)}%` (integer percent, no decimals). `aria-valuenow` is the same `rawPctRounded = Math.round(rawPct * 100)`, capped at 100.

**Consequence for Test #6 (bar width test):** The test previously expected `style.width === "97.8%"` and found the bar by `aria-valuenow === '98'`. With integer rounding, `Math.round(489/500 * 100) = Math.round(97.8) = 98`, so the bar width is `"98%"` and `aria-valuenow` is `"98"`. Update the test to `style.width === "98%"`.

**Consequence for Test #5 (width capped at 100%):** `Math.round(523/500 * 100) = Math.round(104.6) = 105`. `barPct = Math.min(105/100, 1.0) = 1.0`. Bar width = `"100%"`. No change needed to this test.

---

### MUST FIX #5 — Guard against negative `actual`

**Finding:** If `actual` is negative (e.g., a refund), `rawPct` is negative, `barZoneCls` is set to `styles.barSafe`, and the bar `<div>` is emitted to the DOM with a nonsensical negative `aria-valuenow` and `style.width = "-5%"` (ignored by browsers but still pollutes the DOM).

**Plan change:** Add `actual > 0` to the bar guard condition. The full guard becomes:
```js
if (!isIncome && budgeted > 0 && actual > 0)
```
This also resolves MUST FIX #6 (zero `actual`) at the same time since `0 > 0` is false.

---

### MUST FIX #6 — Guard against zero `actual`

**Finding:** When `actual === 0` and `budgeted > 0`, a zero-width bar div with `role="progressbar"` is emitted. It is invisible but adds a DOM node and a screen reader announcement of "0% of budget spent" for every zero-spend cell.

**Plan change:** Covered by the `actual > 0` guard in MUST FIX #5 above. No separate change needed.

---

### MUST FIX #7 — Exactly 100% must be amber (warning), not red; over means strictly `> 100%`

**Finding:** The architecture doc (Section 4.1) defines "Over" as `pct >= 100%`, which makes `rawPct >= 1.0` the over zone. The initial plan inherits this. However, the architecture doc's own "Neutral" row says `pct == 100%` exactly should render no bar. The doc is internally contradictory.

The staff review recommends option (a): exactly 100% should show an amber bar (the user is right at their budget limit — warning, not error). Strictly over means `rawPct > 1.0`. This is also the most defensible UX choice: a user who spent exactly $500 on a $500 budget should see amber (at the limit), not red (over budget). The text color is already `.neutral` (no `.over`) when `variance === 0`, so showing a red bar with neutral text would be visually inconsistent.

**Plan change:** Change the zone boundary from `rawPct >= 1.0` (barOver) to `rawPct > 1.0` (barOver). The warning zone becomes `rawPct >= WARNING_THRESHOLD` (which includes exactly 1.0). The full zone logic:

```js
if (rawPct > 1.0)                    barZoneCls = styles.barOver
else if (rawPct >= WARNING_THRESHOLD) barZoneCls = styles.barWarn
else                                  barZoneCls = styles.barSafe
```

At exactly 100%, `rawPct = 1.0`: falls through to `barWarn` (since `1.0 >= 0.85`). Amber bar, consistent with neutral text. This replaces the "no bar at exactly 100%" rule from the architecture doc with "amber bar at exactly 100%", which is strictly better UX.

**Consequence for Test #7 (barOver class test):** This test queries `[role="progressbar"][class*="barOver"]` and expects to find at least one. Groceries Nov is 523/500 = 104.6%, which is `> 1.0`, so it still gets `.barOver`. Test still passes.

**Consequence for Test #8 (barWarn class test):** Groceries Dec is 489/500 = 97.8%, which is `>= 0.85` and `< 1.0`, still `.barWarn`. Test still passes.

---

### SHOULD FIX #8 — Update `totals_by_month` in fixture when adding Entertainment

**Finding:** `totals_by_month` currently reflects only Groceries + Restaurants. Adding Entertainment changes the correct totals. If any component or test consumes `totals_by_month`, stale values cause bugs or silent failures.

**Plan change:** Update `totals_by_month` when adding the Entertainment category. No BudgetTable test directly asserts on `totals_by_month` values (the BudgetTable component computes its own sums from `categories`; `totals_by_month` is consumed by the bar chart, not the table). However, updating the values is the correct practice to keep the fixture accurate and prevent latent bugs in bar chart tests that may be added later.

New values:
- Nov: budgeted = 500 + 200 + 300 = 1000, actual = 523 + 215 + 120 = 858
- Dec: budgeted = 500 + 200 + 300 = 1000, actual = 489 + 185 + 280 = 954

---

### SHOULD FIX #11 — Add test for `budgeted === 0` edge case

**Finding:** The guard `budgeted > 0` prevents divide-by-zero, but there is no test explicitly verifying this. Without a test, a future refactor that removes the guard would not be caught.

**Plan change:** Add test #11: "does not render a progressbar when budgeted is zero." Use an inline fixture with `{ budgeted: 0, actual: 50, variance: -50 }`. Assert no `[role="progressbar"]` is found in that cell.

This brings the new test count to **11** (not 10 as in the initial plan), for a total of **25 tests** (14 existing + 11 new).

---

### SHOULD FIX #12 — Do not add `z-index: 1` to `.empty`

**Finding:** `.empty` is returned when `budgeted == null`, before any bar logic runs. The bar div is never rendered alongside an `.empty` span, so adding `z-index` to `.empty` is unnecessary.

**Plan change:** Apply `position: relative; z-index: 1` only to `.over`, `.under`, and `.neutral`. Leave `.empty` unchanged.

---

### SHOULD FIX #13 — Add CSS comment noting rgba values derive from token colors

**Finding:** If design tokens ever change, hardcoded `rgba` values will drift out of sync. The initial plan already added per-line comments, which is the minimum. The staff review recommends either `color-mix()` (>95% browser support as of 2023) or at minimum clear comments. Since `color-mix()` is now well-supported and stays in sync with token changes automatically, this plan adopts it.

**Plan change:** Use `color-mix(in srgb, var(--green) 18%, transparent)` etc. instead of hardcoded `rgba` values. Fall back to `rgba` with comments only if `color-mix()` is found to be unsupported in the project's test environment (JSDOM in Vitest does not evaluate CSS, so this has no test impact).

If `color-mix()` is rejected for any reason during implementation, the fallback is:
```css
.barSafe { background: rgba(52, 211, 153, 0.18);  /* color-mix equivalent: var(--green)  at 18% opacity */ }
.barWarn { background: rgba(245, 158, 11,  0.22);  /* color-mix equivalent: var(--amber)  at 22% opacity */ }
.barOver { background: rgba(248, 113, 113, 0.20);  /* color-mix equivalent: var(--red)    at 20% opacity */ }
```

---

## 1. Files to Change

| File | Change Type |
|------|-------------|
| `frontend/src/test/fixtures.js` | Add Entertainment category; update `totals_by_month` |
| `frontend/src/components/BudgetTable.test.jsx` | Scope 2 existing tests to `span`; add `describe('progress bars', ...)` block (11 new tests) |
| `frontend/src/components/BudgetTable.jsx` | Add `WARNING_THRESHOLD` constant; extend `CellValue` with bar logic and bar `<div>` |
| `frontend/src/components/BudgetTable.module.css` | Add `position: relative` to `.cell`; add `position: relative; z-index: 1` to `.over`, `.under`, `.neutral` (not `.empty`); add `.bar`, `.barSafe`, `.barWarn`, `.barOver` classes; add `prefers-reduced-motion` rule |

**No new files are created.**

---

## 2. Test Strategy

### 2.1 Write Tests BEFORE Implementation

Per the development workflow, tests must be written first and must fail before implementation exists. The sequence is:

1. Add fixture changes (Step 3)
2. Run existing 14 tests — all must pass
3. Add test block with 11 new tests (Step 4)
4. Run all tests — 11 new must FAIL, 14 existing must still PASS
5. Implement JSX and CSS (Steps 5–6)
6. Run all tests — all 25 must PASS

After adding the fixture and test block, run:
```
cd frontend && npx vitest run src/components/BudgetTable.test.jsx
```

### 2.2 Existing Tests — Corrections

Two existing tests are updated (MUST FIX #1). All others are unchanged.

**Line 72 — over-budget class test:** Change `container.querySelectorAll('[class*="over"]')` to `container.querySelectorAll('span[class*="over"]')`.

**Line 80 — under-budget class test:** Change `container.querySelectorAll('[class*="under"]')` to `container.querySelectorAll('span[class*="under"]')`.

Both tests continue to use `toBeGreaterThan(0)`. The change ensures they only count text spans, not bar divs.

### 2.3 New Test Cases (11 tests)

All 11 new tests go inside `describe('progress bars', () => { ... })` nested inside the existing `describe('BudgetTable', ...)` block.

| # | Test name | What it asserts |
|---|-----------|-----------------|
| 1 | `renders a progressbar for over-budget expense cells` | At least one `[role="progressbar"]` exists in the rendered output |
| 2 | `renders a progressbar for under-budget expense cells` | A `[role="progressbar"]` bar exists with `aria-valuenow` matching Groceries Dec (under-budget) |
| 3 | `does not render a progressbar for income cells` | The Paycheck row contains zero `[role="progressbar"]` elements |
| 4 | `does not render a progressbar when budgeted is null` | A sparse category missing Dec data renders only one bar (Nov only) |
| 5 | `bar width is capped at 100% for over-budget cells` | Groceries Nov (523/500 = 105% rounded) bar has `style.width === "100%"` |
| 6 | `bar width reflects actual spend percentage for under-budget cells` | Groceries Dec (489/500 = 98% rounded) bar has `style.width === "98%"` |
| 7 | `applies barOver class for over-budget cells` | At least one bar has `class*="barOver"` (Groceries Nov is 104.6% — strictly > 100%) |
| 8 | `applies barWarn class for 85–100% spend cells` | At least one bar has `class*="barWarn"` (Groceries Dec is 97.8%) |
| 9 | `applies barSafe class for under 85% spend cells` | At least one bar has `class*="barSafe"` (Entertainment Nov is 40%) |
| 10 | `ARIA attributes are correct on progressbar elements` | Over-budget bar: `aria-valuenow="100"` (capped), `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label` matching `/105% of budget spent/` |
| 11 | `does not render a progressbar when budgeted is zero` | A cell with `budgeted: 0, actual: 50` renders no `[role="progressbar"]` |

---

## 3. Fixture Changes

**File:** `frontend/src/test/fixtures.js`

### 3.1 Update `totals_by_month` (SHOULD FIX #8)

**Current lines 127–130:**
```js
  totals_by_month: {
    '2025-11-01': { budgeted: 700,  actual: 738 },  // 500+200, 523+215
    '2025-12-01': { budgeted: 700,  actual: 674 },  // 500+200, 489+185
  },
```

**Replace with:**
```js
  totals_by_month: {
    '2025-11-01': { budgeted: 1000, actual: 858 },  // 500+200+300, 523+215+120
    '2025-12-01': { budgeted: 1000, actual: 954 },  // 500+200+300, 489+185+280
  },
```

### 3.2 Add Entertainment category

**Location:** After the closing `}` of the Restaurants entry (after line 161), before the closing `]` of the `categories` array (line 162).

Insert:
```js
    {
      category_id: 'cat_3',
      category_name: 'Entertainment',
      group_name: 'Fun',
      group_type: 'expense',
      months: {
        '2025-11-01': { budgeted: 300, actual: 120, variance: 180 },  // 40.0% — safe zone
        '2025-12-01': { budgeted: 300, actual: 280, variance: 20 },   // 93.3% — warning zone
      },
    },
```

**Why group "Fun" and not "Food & Drink":** The collapse test clicks "Food & Drink" and verifies Groceries disappears. Placing Entertainment in a separate group "Fun" keeps Entertainment independent of that interaction, so both the collapse test (existing #14) and the safe-zone bar test (new #9) can pass without interfering with each other.

**After this step:** run the 14 existing tests. All must still pass.

---

## 4. Test File Changes

**File:** `frontend/src/components/BudgetTable.test.jsx`

### 4.1 Scope existing over/under class tests (MUST FIX #1)

**Current line 72:**
```js
    const overCells = container.querySelectorAll('[class*="over"]')
```
**Replace with:**
```js
    const overCells = container.querySelectorAll('span[class*="over"]')
```

**Current line 80:**
```js
    const underCells = container.querySelectorAll('[class*="under"]')
```
**Replace with:**
```js
    const underCells = container.querySelectorAll('span[class*="under"]')
```

### 4.2 Insert progress bar describe block

**Location:** Insert after line 95 (after the `})` that closes the `'returns null when no data provided'` test), before line 96 (the `})` that closes the outer `describe('BudgetTable', ...)`).

Insert the following complete block:

```jsx
  describe('progress bars', () => {
    it('renders a progressbar for over-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBeGreaterThan(0)
    })

    it('renders a progressbar for under-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 = 97.8% → Math.round = 98
      const bar = container.querySelector('[role="progressbar"][aria-valuenow="98"]')
      expect(bar).toBeTruthy()
    })

    it('does not render a progressbar for income cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const paycheckRow = screen.getByText('Paycheck').closest('tr')
      const bars = paycheckRow.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBe(0)
    })

    it('does not render a progressbar when budgeted is null', () => {
      const sparseCategories = [
        {
          category_id: 'cat_sparse',
          category_name: 'Sparse',
          group_name: 'Other',
          group_type: 'expense',
          months: {
            '2025-11-01': { budgeted: 200, actual: 100, variance: 100 },
            // '2025-12-01' deliberately missing — CellValue returns <span class="empty">
          },
        },
      ]
      const { container } = render(
        <BudgetTable months={months} categories={sparseCategories} />
      )
      const allBars = container.querySelectorAll('[role="progressbar"]')
      // Only Nov has data, so only one bar
      expect(allBars.length).toBe(1)
    })

    it('bar width is capped at 100% for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Nov: 523/500 → Math.round(104.6) = 105 — over budget, bar capped at 100%
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(overBars).find(
        el => el.getAttribute('aria-label')?.includes('105')
      )
      expect(groceriesNovBar).toBeTruthy()
      expect(groceriesNovBar.style.width).toBe('100%')
    })

    it('bar width reflects actual spend percentage for under-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 → Math.round(97.8) = 98 — bar width = "98%"
      const bar = container.querySelector('[role="progressbar"][aria-valuenow="98"]')
      expect(bar).toBeTruthy()
      expect(bar.style.width).toBe('98%')
    })

    it('applies barOver class for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Nov: 523/500 = 104.6% — strictly > 100%
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      expect(overBars.length).toBeGreaterThan(0)
    })

    it('applies barWarn class for 85–100% spend cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 = 97.8% (>= 85%, <= 100%)
      const warnBars = container.querySelectorAll('[role="progressbar"][class*="barWarn"]')
      expect(warnBars.length).toBeGreaterThan(0)
    })

    it('applies barSafe class for under 85% spend cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Entertainment Nov: 120/300 = 40% — safe zone (< 85%)
      const safeBars = container.querySelectorAll('[role="progressbar"][class*="barSafe"]')
      expect(safeBars.length).toBeGreaterThan(0)
    })

    it('ARIA attributes are correct on progressbar elements', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Nov: 523/500 → rawPctRounded = 105
      // aria-valuenow is CAPPED at 100; aria-label carries the uncapped "105%"
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(overBars).find(
        el => el.getAttribute('aria-label')?.includes('105')
      )
      expect(groceriesNovBar).toBeTruthy()
      // aria-valuenow capped at 100 (MUST FIX #3 — WAI-ARIA spec compliance)
      expect(groceriesNovBar.getAttribute('aria-valuenow')).toBe('100')
      expect(groceriesNovBar.getAttribute('aria-valuemin')).toBe('0')
      expect(groceriesNovBar.getAttribute('aria-valuemax')).toBe('100')
      expect(groceriesNovBar.getAttribute('aria-label')).toMatch(/105% of budget spent/)
    })

    it('does not render a progressbar when budgeted is zero', () => {
      // Guard: budgeted > 0 prevents divide-by-zero and avoids nonsensical bars
      const zeroCategories = [
        {
          category_id: 'cat_zero',
          category_name: 'Unbudgeted',
          group_name: 'Other',
          group_type: 'expense',
          months: {
            '2025-11-01': { budgeted: 0, actual: 50, variance: -50 },
          },
        },
      ]
      const { container } = render(
        <BudgetTable months={months} categories={zeroCategories} />
      )
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBe(0)
    })
  })
```

**After adding the test block:** run tests. All 11 new tests must FAIL. All 14 existing tests (including the two with updated selectors) must PASS.

---

## 5. JSX Implementation

**File:** `frontend/src/components/BudgetTable.jsx`

### 5.1 Add WARNING_THRESHOLD constant

**Location:** After line 4 (after the import block), before line 6 (`function CellValue`).

Insert at line 5:
```js
const WARNING_THRESHOLD = 0.85
```

The file after this insertion:
```js
import { useState } from 'react'
import PropTypes from 'prop-types'
import styles from './BudgetTable.module.css'
import { fmtBudgetMonth, fmtDollar } from './chartUtils.jsx'

const WARNING_THRESHOLD = 0.85

function CellValue({ budgeted, actual, variance, isIncome }) {
```

### 5.2 Rewrite CellValue

**Current lines 6–16:**
```jsx
function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  const isOver  = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const cls = isOver ? styles.over : isUnder ? styles.under : styles.neutral
  return (
    <span className={cls}>
      {fmtDollar(actual)} / {fmtDollar(budgeted)}
    </span>
  )
}
```

**Replace with:**
```jsx
function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  const isOver  = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const cls = isOver ? styles.over : isUnder ? styles.under : styles.neutral

  // Progress bar — expense cells only.
  // Guards:
  //   actual > 0  — no bar for zero spend or refunds (negative actual)
  //   budgeted > 0 — no bar for unbudgeted categories (avoids divide-by-zero)
  let barZoneCls = null
  let barPct = 0
  let rawPctRounded = 0
  if (!isIncome && budgeted > 0 && actual > 0) {
    const rawPct = actual / budgeted
    barPct = Math.min(rawPct, 1.0)
    rawPctRounded = Math.round(rawPct * 100)
    // Strictly over 100% = red; at or above 85% (including exactly 100%) = amber; below 85% = green
    if (rawPct > 1.0)                    barZoneCls = styles.barOver
    else if (rawPct >= WARNING_THRESHOLD) barZoneCls = styles.barWarn
    else                                  barZoneCls = styles.barSafe
  }

  // aria-valuenow is capped at 100 to stay within [aria-valuemin, aria-valuemax] per WAI-ARIA spec.
  // The aria-label carries the uncapped rawPctRounded so screen readers announce the true overage.
  const ariaValueNow = Math.min(rawPctRounded, 100)

  return (
    <>
      {barZoneCls !== null && (
        <div
          className={`${styles.bar} ${barZoneCls}`}
          style={{ width: `${Math.round(barPct * 100)}%` }}
          role="progressbar"
          aria-valuenow={ariaValueNow}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${rawPctRounded}% of budget spent`}
        />
      )}
      <span className={cls}>
        {fmtDollar(actual)} / {fmtDollar(budgeted)}
      </span>
    </>
  )
}
```

**Design notes:**

- **`actual > 0` guard (MUST FIX #5, #6):** Prevents bars for zero-spend cells and refund cells (negative `actual`). A cell with `actual = 0` correctly shows no progress.
- **`budgeted > 0` guard:** Prevents divide-by-zero for unbudgeted categories.
- **`rawPct > 1.0` for barOver (MUST FIX #7):** Exactly 100% (`rawPct === 1.0`) falls into `barWarn` (amber). This is consistent with the text color: at exactly 100%, `variance === 0`, so `.neutral` text — amber bar paired with neutral text makes visual sense. Red (`.barOver`) is reserved for strictly over-budget cells where text is already `.over` (red).
- **`ariaValueNow = Math.min(rawPctRounded, 100)` (MUST FIX #3):** Keeps `aria-valuenow` within `[aria-valuemin, aria-valuemax]` per WAI-ARIA spec, satisfying axe-core and Lighthouse audits. The `aria-label` still announces the uncapped percentage for screen reader users.
- **Integer rounding for width (MUST FIX #4):** `Math.round(barPct * 100)` for width is consistent with `rawPctRounded = Math.round(rawPct * 100)` for ARIA. No decimal precision mismatch.
- **Fragment wrapper (`<>...</>`):** CellValue now returns two elements (bar + span). The fragment is transparent to the parent `<td>`, so the bar div becomes a direct child of `<td className={styles.cell}>`, which is the positioning context.
- **Browser compatibility (SHOULD FIX #2, now documented):** `position: relative` on `<td>` is fully supported in all modern browsers (Chrome, Firefox, Safari 14+). The app does not target Safari < 14. If Safari < 14 support is ever required, the fallback is to wrap bar + span in `<div style="position: relative">` inside CellValue instead.

---

## 6. CSS Implementation

**File:** `frontend/src/components/BudgetTable.module.css`

### 6.1 Add `position: relative` to `.cell`

**Current lines 134–138:**
```css
.cell {
  padding: 7px 12px;
  text-align: right;
  white-space: nowrap;
}
```

**Replace with:**
```css
.cell {
  padding: 7px 12px;
  text-align: right;
  white-space: nowrap;
  position: relative;      /* positioning context for the progress bar */
}
```

### 6.2 Add `position: relative; z-index: 1` to text span classes — `.over`, `.under`, `.neutral` only (SHOULD FIX #12)

**Current lines 140–143:**
```css
.over    { color: var(--red); }
.under   { color: var(--green); }
.neutral { color: var(--text-primary); }
.empty   { color: var(--text-muted); }
```

**Replace with:**
```css
.over    { color: var(--red);          position: relative; z-index: 1; }
.under   { color: var(--green);        position: relative; z-index: 1; }
.neutral { color: var(--text-primary); position: relative; z-index: 1; }
.empty   { color: var(--text-muted); }
```

**Why `.empty` is excluded (SHOULD FIX #12):** The `.empty` class is only returned when `budgeted == null`, in which case `CellValue` returns early before any bar logic runs. No bar div is ever rendered alongside an `.empty` span. Adding `z-index` to `.empty` would be unnecessary.

**Why `.over`, `.under`, `.neutral` need `z-index: 1`:** The bar div renders before the span in DOM order. Without `z-index: 1` on the span, both elements share `z-index: auto` and some browser rendering engines may place the bar div above the span. Setting `z-index: 0` on `.bar` and `z-index: 1` on the text spans ensures text is always on top.

### 6.3 Add bar classes

**Location:** After line 143 (after the current `.empty` line), before the `/* Section header */` comment (currently line 145).

Insert:
```css
/* ── Progress bars ─────────────────────────────────────────────────────── */
/* Bar colors use color-mix() to stay in sync with token changes.
   Token values for reference: --green: #34d399, --amber: #f59e0b, --red: #f87171 */
.bar {
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
  pointer-events: none;
  z-index: 0;
  transition: width 300ms ease;
}

.barSafe { background: color-mix(in srgb, var(--green) 18%, transparent); }
.barWarn { background: color-mix(in srgb, var(--amber) 22%, transparent); }
.barOver { background: color-mix(in srgb, var(--red)   20%, transparent); }

@media (prefers-reduced-motion: reduce) {
  .bar { transition: none; }
}
```

**`color-mix()` adoption (SHOULD FIX #13):** `color-mix(in srgb, var(--token) N%, transparent)` is supported in all modern browsers since 2023 (caniuse: >95% global coverage). It automatically stays in sync when token values change. The comment line documents the current token values for quick reference without requiring developers to look them up in `index.css`.

**If `color-mix()` must be avoided** (e.g., JSDOM CSS evaluation issue discovered during testing), fall back to:
```css
.barSafe { background: rgba(52, 211, 153, 0.18);  /* var(--green) #34d399 at 18% */ }
.barWarn { background: rgba(245, 158, 11,  0.22);  /* var(--amber) #f59e0b at 22% */ }
.barOver { background: rgba(248, 113, 113, 0.20);  /* var(--red)   #f87171 at 20% */ }
```

Note: JSDOM (Vitest) does not evaluate CSS at all — tests assert on class names and inline `style` attributes, not computed background colors. `color-mix()` vs `rgba` has zero impact on test results.

---

## 7. Ordered Implementation Sequence

Execute in this exact order to honor the "write tests first" rule:

1. **Modify `fixtures.js`** — update `totals_by_month` (Section 3.1) and add Entertainment category (Section 3.2).
2. **Run existing tests** — all 14 must pass with the fixture change.
3. **Modify `BudgetTable.test.jsx`** — update the two existing class tests to use `span` scoping (Section 4.1), then insert the `describe('progress bars', ...)` block (Section 4.2).
4. **Run tests** — all 11 new tests must FAIL (no bar rendered yet); all 14 existing tests must PASS.
5. **Modify `BudgetTable.jsx`** — add `WARNING_THRESHOLD` constant (Section 5.1) and rewrite `CellValue` (Section 5.2).
6. **Modify `BudgetTable.module.css`** — add `position: relative` to `.cell` (Section 6.1), update text span classes (Section 6.2), add bar classes and `prefers-reduced-motion` (Section 6.3).
7. **Run all tests** — all 25 tests must pass (14 existing + 11 new).

---

## 8. Rollback Plan

All changes are contained in 4 files. Git rollback is the primary mechanism.

If a test breaks unexpectedly after Step 7:
```
git diff frontend/src/components/BudgetTable.jsx
git diff frontend/src/components/BudgetTable.module.css
git diff frontend/src/test/fixtures.js
git diff frontend/src/components/BudgetTable.test.jsx
```

Revert individual files:
```
git checkout HEAD -- frontend/src/components/BudgetTable.jsx
git checkout HEAD -- frontend/src/components/BudgetTable.module.css
git checkout HEAD -- frontend/src/test/fixtures.js
git checkout HEAD -- frontend/src/components/BudgetTable.test.jsx
```

**If Playwright QA reveals a visual problem:**
- Bar too subtle: increase `color-mix` percentages (e.g., 18% → 25%) or `rgba` alpha values.
- Text obscured: increase `z-index` on `.over`, `.under`, `.neutral` from `1` to `2`.
- Sticky column broken: the sticky column is `.catName`, not `.cell`. If affected, remove `position: relative` from `.cell` and instead wrap bar + span in `<div style="position: relative">` inside `CellValue`, making the `<div>` (not the `<td>`) the positioning context.

**Scope of rollback risk:** Low. The change is purely additive — no existing class or element is removed or restructured. Worst case is reverting 4 files.

---

## 9. Verification Checklist

After all 25 tests pass, verify visually in the running app.

### Automated (test suite)
- [ ] All 14 pre-existing tests pass (including the two with updated `span` scoping)
- [ ] All 11 new progress bar tests pass
- [ ] Total: 25 tests passing, 0 failing

### Visual (Playwright QA — Step 7 of development workflow)
Navigate to `http://localhost:5173` (local dev) or `http://localhost` (Docker), open the Budgets page.

- [ ] Over-budget cells (> 100%) show a red background bar filling 100% of cell width
- [ ] Exactly-on-budget cells (= 100%) show an amber bar (not red) — amber + neutral text, not red
- [ ] Warning-zone cells (85–99%) show an amber bar at the correct width
- [ ] Safe-zone cells (< 85%) show a green bar at the correct width
- [ ] Bar does not overflow cell boundaries
- [ ] Dollar amount text (`$523 / $500`) is fully legible over the bar
- [ ] Income rows (Paycheck) have no bar
- [ ] Summary table (Total Income / Total Expenses / Net) has no bar
- [ ] Zero-spend cells and null-budget cells have no bar
- [ ] Clicking a group header collapses rows and their bars
- [ ] Horizontal scroll at narrow viewport still works; bars scale with cell width
- [ ] Screenshot taken and confirmed

### ARIA (browser devtools)
- [ ] Inspect a bar element: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label` all present
- [ ] Over-budget bar (e.g., Groceries Nov 523/500): `aria-valuenow="100"` (capped), `aria-label="105% of budget spent"`
- [ ] `aria-valuenow` never exceeds `aria-valuemax` — no accessibility audit violations

### Reduced-motion (browser devtools)
- [ ] Open DevTools > Rendering > "Emulate CSS media feature prefers-reduced-motion: reduce"
- [ ] Bars render at final width with no transition — switching month ranges causes bars to snap, not animate

---

## 10. Complete Diff Summary (by file)

### `frontend/src/test/fixtures.js`
- Lines 128–129: Update `totals_by_month` values for Nov (700→1000 budgeted, 738→858 actual) and Dec (700→1000 budgeted, 674→954 actual)
- After line 161: Insert Entertainment category object (7 lines)

### `frontend/src/components/BudgetTable.test.jsx`
- Line 72: `querySelectorAll('[class*="over"]')` → `querySelectorAll('span[class*="over"]')`
- Line 80: `querySelectorAll('[class*="under"]')` → `querySelectorAll('span[class*="under"]')`
- After line 95 (before outer closing `})`): Insert `describe('progress bars', ...)` block (11 tests, ~80 lines)

### `frontend/src/components/BudgetTable.jsx`
- After line 4 (imports): Insert `const WARNING_THRESHOLD = 0.85` (2 lines with blank)
- Lines 6–16 (`CellValue` function): Replace with updated function (~30 lines) that adds guard conditions, zone logic, `ariaValueNow` cap, and bar `<div>` inside a Fragment

### `frontend/src/components/BudgetTable.module.css`
- Lines 134–138 (`.cell`): Add `position: relative` (1 line added)
- Lines 140–143 (`.over`, `.under`, `.neutral`, `.empty`): Add `position: relative; z-index: 1` to first three; leave `.empty` unchanged
- After line 143: Insert bar classes block (~20 lines: `.bar`, `.barSafe`, `.barWarn`, `.barOver`, `@media prefers-reduced-motion`)
