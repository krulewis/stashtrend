# Implementation Plan: Budget Table Progress Bars

**Agent:** Engineer (Step 3 of planning pipeline)
**Date:** 2026-03-03
**Architecture input:** `budget-table-redesign-architecture.md`
**Next step:** Staff Engineer Agent (opus) reviews this plan

---

## 1. Files to Change

| File | Change Type |
|------|-------------|
| `frontend/src/test/fixtures.js` | Add Entertainment category to `MOCK_BUDGET_HISTORY` |
| `frontend/src/components/BudgetTable.test.jsx` | Add `describe('progress bars', ...)` block (10 new tests) |
| `frontend/src/components/BudgetTable.jsx` | Add `WARNING_THRESHOLD` constant; extend `CellValue` with bar logic and bar `<div>` |
| `frontend/src/components/BudgetTable.module.css` | Add `position: relative` to `.cell`; add `.bar`, `.barSafe`, `.barWarn`, `.barOver` classes; add `z-index: 1; position: relative` to text span classes; add `prefers-reduced-motion` rule |

**No new files are created.**

---

## 2. Test Strategy

### 2.1 Write Tests BEFORE Implementation

Per the development workflow, tests must be written first and must fail before implementation exists. The test file is modified in Step 4 (below); the implementation happens in Steps 5-6.

After adding the fixture (Step 3) and adding the test block (Step 4), run:
```
cd frontend && npx vitest run src/components/BudgetTable.test.jsx
```
All 10 new tests must FAIL at this point (the bar div does not exist yet). The existing 14 tests must still PASS.

### 2.2 New Test Cases

All 10 new tests go inside `describe('progress bars', () => { ... })` nested inside the existing `describe('BudgetTable', ...)` block.

| # | Test name | What it asserts |
|---|-----------|----------------|
| 1 | `renders a progressbar for over-budget expense cells` | Cells where actual > budgeted contain `[role="progressbar"]` |
| 2 | `renders a progressbar for under-budget expense cells` | Cells where actual < budgeted contain `[role="progressbar"]` |
| 3 | `does not render a progressbar for income cells` | Paycheck row contains zero `[role="progressbar"]` elements |
| 4 | `does not render a progressbar when budgeted is null` | A cell with no `cell` data has no `[role="progressbar"]` |
| 5 | `bar width is capped at 100% for over-budget cells` | Groceries Nov (523/500 = 104.6%) bar has `style.width === "100%"` |
| 6 | `bar width reflects actual spend percentage for under-budget cells` | Groceries Dec (489/500 = 97.8%) bar has `style.width === "97.8%"` |
| 7 | `applies barOver class for over-budget cells` | Groceries Nov bar `className` contains `"barOver"` |
| 8 | `applies barWarn class for 85–99% spend cells` | Groceries Dec (97.8%) bar `className` contains `"barWarn"` |
| 9 | `applies barSafe class for under 85% spend cells` | Entertainment Nov (120/300 = 40%) bar `className` contains `"barSafe"` |
| 10 | `ARIA attributes are correct on progressbar elements` | Over-budget bar has `aria-valuenow="105"` (raw, rounded), `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label` containing "% of budget spent" |

Note on test 6: 489 / 500 = 0.978. `(0.978 * 100).toFixed(1)` = `"97.8"`. The implementation must produce `"97.8%"` exactly. The plan pins the rounding strategy (see Section 5.3).

Note on test 10: 523 / 500 = 1.046. `Math.round(1.046 * 100)` = `105`. `aria-valuenow` must be `105`.

### 2.3 Existing Tests — Expected Outcome After Implementation

All 14 existing tests must continue to pass. Key risks assessed:

- **`over-budget cells have the over class`** — queries `[class*="over"]`. After the change, `.barOver` elements will also match. This test only asserts `length > 0`, so additional matches are harmless. **Will pass.**
- **`under-budget cells have the under class`** — same reasoning for `[class*="under"]`. No `.barUnder` class exists, so the count does not change. **Will pass.**
- **`expense group header can be clicked to collapse rows`** — collapses the Food & Drink group. The new Entertainment category belongs to a new group "Fun" and will not be affected by clicking "Food & Drink". **Will pass.**
- All text-content-based tests (`getByText('Groceries')` etc.) are unaffected. **Will pass.**

---

## 3. Fixture Change (Step 3 — do first, before tests)

**File:** `frontend/src/test/fixtures.js`
**Location:** Lines 130–163 (inside `MOCK_BUDGET_HISTORY.categories` array)

Add the Entertainment category as the third item in the `categories` array, after Restaurants (after line 161, before the closing `]` on line 162):

```js
    {
      category_id: 'cat_3',
      category_name: 'Entertainment',
      group_name: 'Fun',
      group_type: 'expense',
      months: {
        '2025-11-01': { budgeted: 300, actual: 120, variance: 180 },   // 40.0% — safe zone
        '2025-12-01': { budgeted: 300, actual: 280, variance: 20 },    // 93.3% — warning zone
      },
    },
```

**Why a new group ("Fun") and not "Food & Drink":** The collapse test clicks "Food & Drink" and then verifies Groceries is gone. If Entertainment is in "Food & Drink", the collapse test would also hide Entertainment, which is fine — but tests 9 and the collapse test (existing #14) both touch the same group. Using a separate group "Fun" isolates Entertainment from any interaction with "Food & Drink" group collapse tests.

**After adding:** verify existing tests still pass with the fixture change:
```
cd frontend && npx vitest run src/components/BudgetTable.test.jsx
```
All 14 existing tests must still pass.

---

## 4. Test Addition (Step 4 — add tests before implementation)

**File:** `frontend/src/components/BudgetTable.test.jsx`
**Location:** After line 96 (after the closing `})` of the outer `describe` block), insert a new inner `describe` block INSIDE the outer `describe('BudgetTable', ...)` — place it between line 95 (`})` closing `returns null`) and line 96 (`})` closing outer describe).

Insert at line 95, before the outer closing `})`:

```jsx
  describe('progress bars', () => {
    it('renders a progressbar for over-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBeGreaterThan(0)
    })

    it('renders a progressbar for under-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 — under budget, should have a bar
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBeGreaterThan(0)
    })

    it('does not render a progressbar for income cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Find the Paycheck row by text, then check its cells for progressbars
      const paycheckRow = screen.getByText('Paycheck').closest('tr')
      const bars = paycheckRow.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBe(0)
    })

    it('does not render a progressbar when budgeted is null', () => {
      // Render with a category that has no cell data for one month
      const sparseCategories = [
        {
          category_id: 'cat_sparse',
          category_name: 'Sparse',
          group_name: 'Other',
          group_type: 'expense',
          months: {
            '2025-11-01': { budgeted: 200, actual: 100, variance: 100 },
            // '2025-12-01' deliberately missing
          },
        },
      ]
      const { container } = render(
        <BudgetTable months={months} categories={sparseCategories} />
      )
      const allBars = container.querySelectorAll('[role="progressbar"]')
      // Only one month has data, so only one bar
      expect(allBars.length).toBe(1)
    })

    it('bar width is capped at 100% for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Nov: 523/500 = 104.6% — bar must be capped at 100%
      const bars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(bars).find(
        el => el.getAttribute('aria-label')?.includes('104') || el.getAttribute('aria-label')?.includes('105')
      )
      expect(groceriesNovBar).toBeTruthy()
      expect(groceriesNovBar.style.width).toBe('100%')
    })

    it('bar width reflects actual spend percentage for under-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 = 97.8% — bar must reflect this
      const bars = container.querySelectorAll('[role="progressbar"]')
      const groceriesDecBar = Array.from(bars).find(
        el => el.getAttribute('aria-valuenow') === '98'
      )
      expect(groceriesDecBar).toBeTruthy()
      expect(groceriesDecBar.style.width).toBe('97.8%')
    })

    it('applies barOver class for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Nov: 523/500 — over budget
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      expect(overBars.length).toBeGreaterThan(0)
    })

    it('applies barWarn class for 85-99% spend cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 = 97.8% — warning zone (>= 85%, < 100%)
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
      // Groceries Nov: 523/500 = 1.046 — aria-valuenow should be raw rounded = 105
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(overBars).find(
        el => el.getAttribute('aria-valuenow') === '105'
      )
      expect(groceriesNovBar).toBeTruthy()
      expect(groceriesNovBar.getAttribute('aria-valuemin')).toBe('0')
      expect(groceriesNovBar.getAttribute('aria-valuemax')).toBe('100')
      expect(groceriesNovBar.getAttribute('aria-label')).toMatch(/\d+% of budget spent/)
    })
  })
```

**After adding the test block:** run tests again. All 10 new tests must FAIL (no bar rendered yet). All 14 existing tests must still PASS.

---

## 5. JSX Implementation (Step 5)

**File:** `frontend/src/components/BudgetTable.jsx`

### 5.1 Add WARNING_THRESHOLD constant

**Location:** After line 4 (after the import block), before line 6 (`function CellValue`).

Insert at line 5 (new blank line + constant):

```js
const WARNING_THRESHOLD = 0.85
```

The file after this insertion looks like:

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

  // Progress bar — expense cells only, skip when budgeted is 0 (avoid divide-by-zero)
  let barZoneCls = null
  let barPct = 0
  let rawPctRounded = 0
  if (!isIncome && budgeted > 0) {
    const rawPct = actual / budgeted
    barPct = Math.min(rawPct, 1.0)
    rawPctRounded = Math.round(rawPct * 100)
    if (rawPct >= 1.0)                   barZoneCls = styles.barOver
    else if (rawPct >= WARNING_THRESHOLD) barZoneCls = styles.barWarn
    else                                  barZoneCls = styles.barSafe
  }

  return (
    <>
      {barZoneCls !== null && (
        <div
          className={`${styles.bar} ${barZoneCls}`}
          style={{ width: `${parseFloat((barPct * 100).toFixed(1))}%` }}
          role="progressbar"
          aria-valuenow={rawPctRounded}
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

**Width value rationale:** `parseFloat((barPct * 100).toFixed(1))` produces `97.8` for 489/500 and `100` for capped values. `parseFloat` strips trailing zeros so `100.0` becomes `100`. The `%` is appended in the template literal, giving `"97.8%"` and `"100%"` as expected by the tests.

**Fragment wrapper (`<>...</>`):** `CellValue` now returns two elements (bar + span), so it needs a fragment. The fragment is transparent to the parent `<td>` — no layout impact.

**No other JSX changes are needed.** The `<td className={styles.cell}>` already wraps `CellValue`, so the bar div is naturally a sibling of the span inside the same `<td>`.

---

## 6. CSS Implementation (Step 6)

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

### 6.2 Add `position: relative; z-index: 1` to text span classes

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
.empty   { color: var(--text-muted);   position: relative; z-index: 1; }
```

**Why:** The bar div renders before the span in DOM order. Without `z-index: 1` on the span, both elements share `z-index: auto` and the span could be obscured on some browsers. The bar is explicitly set to `z-index: 0` (see below).

### 6.3 Add bar classes

**Location:** After the `.empty` line (after line 143 in the current file, which becomes line 144 after the `.cell` change), before the `/* Section header */` comment.

Insert the following block:

```css
/* ── Progress bars ── */
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

.barSafe { background: rgba(52, 211, 153, 0.18); }   /* var(--green) at 0.18 opacity */
.barWarn { background: rgba(245, 158, 11, 0.22); }   /* var(--amber) at 0.22 opacity */
.barOver { background: rgba(248, 113, 113, 0.20); }  /* var(--red)   at 0.20 opacity */

@media (prefers-reduced-motion: reduce) {
  .bar { transition: none; }
}
```

**Color value notes:**
- `var(--green)` is `#34d399` = `rgb(52, 211, 153)` per the architecture doc. Expressed as `rgba(52, 211, 153, 0.18)`.
- `var(--amber)` is `#f59e0b` = `rgb(245, 158, 11)`. Expressed as `rgba(245, 158, 11, 0.22)`.
- `var(--red)` is `#f87171` = `rgb(248, 113, 113)`. Expressed as `rgba(248, 113, 113, 0.20)`.

**Why not `color-mix()` or `var(--green)` with opacity?** CSS `opacity` on the element would also affect text readability. `background-color` with `rgba` is applied to the bar div only and has no effect on sibling element text.

**Why hardcoded `rgba` and not `var(--green)` with alpha?** `rgba` with explicit RGB values is the most compatible approach. CSS `color-mix(in srgb, var(--green) 18%, transparent)` would also work but adds a CSS level 5 dependency. The `rgba` values are derived from the exact hex values specified in the architecture doc; a comment on each line records the source variable for future maintainability.

---

## 7. Ordered Implementation Sequence

Execute in this exact order to honor the "write tests first" rule:

1. **Modify `fixtures.js`** — add Entertainment category (Section 3 above).
2. **Run existing tests** — confirm all 14 pass with the new fixture.
3. **Add test block to `BudgetTable.test.jsx`** — insert the `describe('progress bars', ...)` block (Section 4 above).
4. **Run tests** — confirm 10 new tests FAIL, 14 existing tests PASS.
5. **Modify `BudgetTable.jsx`** — add `WARNING_THRESHOLD` constant (Section 5.1) and rewrite `CellValue` (Section 5.2).
6. **Modify `BudgetTable.module.css`** — add `position: relative` to `.cell` (Section 6.1), update text span classes (Section 6.2), add bar classes and `prefers-reduced-motion` (Section 6.3).
7. **Run all tests** — confirm all 24 tests pass (14 existing + 10 new).

---

## 8. Rollback Plan

All changes are contained in 4 files. Git rollback is the primary mechanism.

**If a test breaks unexpectedly after Step 7:**
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

**If the Playwright QA step reveals a visual problem** (bar too opaque, bar obscuring text, sticky column broken):
- For opacity: change only the `rgba` alpha values in `.barSafe`, `.barWarn`, `.barOver` in the CSS file.
- For text obscuring: increase `z-index` on `.over`, `.under`, `.neutral`, `.empty` from `1` to `2`.
- For sticky column breakage: the sticky column is `.catName`, not `.cell`. If somehow affected, remove `position: relative` from `.cell` and instead wrap the bar and span in a `<div style="position: relative">` inside `CellValue` — this makes the `<div>` (not the `<td>`) the positioning context.

**Scope of rollback risk:** Low. The change is additive only — no existing class or element is removed or restructured. The worst case is reverting 4 files to their pre-change state.

---

## 9. Verification Checklist

After all 24 tests pass, verify visually in the running app.

### Automated (test suite)
- [ ] All 14 pre-existing tests pass
- [ ] All 10 new progress bar tests pass
- [ ] Total: 24 tests passing, 0 failing

### Visual (Playwright QA — Step 7 of development workflow)
Navigate to `http://localhost:5173` (local dev) or `http://localhost` (Docker), open the Budgets page.

- [ ] Over-budget cells show a red background bar filling 100% of the cell width
- [ ] Warning-zone cells (85-99%) show an amber background bar at the correct width
- [ ] Safe-zone cells (<85%) show a green background bar at the correct width
- [ ] Bar does not overflow the cell boundaries
- [ ] Existing dollar amount text (`$523 / $500`) is fully legible over the bar
- [ ] Income rows (Paycheck) have no bar
- [ ] Summary table (Total Income / Total Expenses / Net) has no bar
- [ ] Clicking a group header to collapse hides the rows and their bars
- [ ] Horizontal scroll (narrow viewport) still works; bars scale with cell width
- [ ] Screenshot taken and confirmed

### ARIA (browser devtools)
- [ ] Inspect a bar element: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label` all present
- [ ] Over-budget bar `aria-valuenow` reflects the raw percentage (e.g. 105 for 523/500), not the visual cap

### Reduced-motion (browser devtools)
- [ ] Open DevTools > Rendering > "Emulate CSS media feature prefers-reduced-motion: reduce"
- [ ] Confirm bars render at final width with no transition (switch month range; bars snap, do not animate)
