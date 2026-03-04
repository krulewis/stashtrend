# Staff Engineer Review: Budget Table Progress Bars Implementation Plan

**Agent:** Staff Engineer (Step 4 of planning pipeline)
**Date:** 2026-03-03
**Inputs:** Architecture doc, implementation plan, current source files (BudgetTable.jsx, .module.css, .test.jsx, fixtures.js)

---

## Findings

### 1. MUST FIX — Existing `[class*="over"]` test will match `.barOver` elements, inflating count silently

**File:** `BudgetTable.test.jsx`, line 72

The existing test on line 72 queries `container.querySelectorAll('[class*="over"]')`. After the change, `.barOver` bar divs will also match this selector because "over" is a substring of "barOver" (CSS module transforms produce something like `_barOver_abc123`, which contains "over").

The architecture doc (Section 6.1) claims this is safe because the test uses `toBeGreaterThan(0)`. That is correct — the test will not *fail*. However, this is a silent semantic regression: the test was designed to verify that *text spans* have the over class, and it will now also be counting *bar divs*. If a future bug removes the `.over` class from text spans but leaves `.barOver` on bars, this test will still pass, masking the bug.

**Required change:** Update the existing over-class test to scope its query to `span[class*="over"]` instead of `[class*="over"]`, so it only matches text spans. Do the same for the under-class test (`span[class*="under"]`) for consistency, even though no `.barUnder` class exists today.

---

### 2. MUST FIX — `CellValue` returns a Fragment, but the parent `<td>` expects absolute positioning context

**File:** `BudgetTable.jsx` (proposed change, Section 5.2 of plan)

The plan wraps the bar div and text span in a React Fragment (`<>...</>`). The bar div uses `position: absolute` and relies on `.cell` (`<td>`) as its positioning context. This works because the Fragment is transparent — the bar div becomes a direct child of the `<td>`.

However, the architecture doc (Section 4.2) states the bar should have `left: 0; top: 2px; bottom: 2px`. On a `<td>` element, `position: relative` behaves differently in some browsers. Specifically, per the CSS 2.1 spec, `position: relative` has undefined behavior on `<td>` elements. In practice, all modern browsers (Chrome, Firefox, Safari) do support it correctly, but there is a historical edge case in older Safari versions (pre-14).

**Required change:** No code change needed if targeting modern browsers only, but the plan should explicitly document this browser compatibility assumption. If supporting Safari < 14 matters, the fallback is to wrap bar + span in a `<div style="position: relative">` inside CellValue instead of relying on `position: relative` on the `<td>`.

**Revised severity:** SHOULD FIX — document the assumption. Not a true MUST FIX since the app targets modern browsers.

---

### 3. MUST FIX — `aria-valuenow` exceeds `aria-valuemax`, which is technically invalid per WAI-ARIA spec

**File:** Architecture doc Section 4.4, Plan Section 5.2

The plan sets `aria-valuemax={100}` and `aria-valuenow={105}` for over-budget cells. Per the WAI-ARIA spec (progressbar role), `aria-valuenow` "must be between `aria-valuemin` and `aria-valuemax`." While screen readers generally handle this gracefully in practice, it is technically a spec violation that will flag in automated accessibility audits (axe-core, Lighthouse).

**Required change:** Either:
- (a) Set `aria-valuemax` to `Math.max(100, rawPctRounded)` so the max is always >= the current value. The `aria-label` already conveys the "over 100%" semantics to screen readers.
- (b) Cap `aria-valuenow` at 100 and rely solely on `aria-label` for the ">100%" announcement. This is simpler and equally accessible.

Option (b) is recommended since the `aria-label` already says "105% of budget spent" — the exact `aria-valuenow` number is secondary.

---

### 4. MUST FIX — Test 6 (`bar width reflects actual spend percentage`) checks `aria-valuenow === '98'` but the plan computes `Math.round(0.978 * 100) = 98`; the width is `97.8%` — these are inconsistent

**File:** Plan Section 4, test 6

The test finds the bar by `aria-valuenow === '98'` (which is `Math.round(97.8)`), then checks `style.width === '97.8%'`. This works, but the test comment says "489/500 = 97.8%" without explaining that `aria-valuenow` is **rounded** while width is **1-decimal-place precise**. This will confuse future maintainers.

More importantly: `489 / 500 = 0.978`. `(0.978 * 100).toFixed(1)` = `"97.8"` (correct). But `Math.round(0.978 * 100)` = `98`. So `aria-valuenow` is `98` while the visual bar width is `97.8%`. This discrepancy between the ARIA announcement ("98% of budget spent") and the visual width (97.8%) is minor but sloppy.

**Required change:** Use consistent rounding. Either:
- (a) Use `Math.round(rawPct * 100)` for both `aria-valuenow` and display width (simpler, both show "98%").
- (b) Use `parseFloat((rawPct * 100).toFixed(1))` for both (more precise, both show 97.8).

Option (a) is recommended — `Math.round` for both keeps things simple. The visual precision difference between 97.8% and 98% width is imperceptible (0.2% of a ~100px cell = 0.2px).

---

### 5. MUST FIX — Negative `actual` values will produce a negative bar width

**File:** Plan Section 5.2 (CellValue bar logic)

The plan checks `budgeted > 0` but does not check `actual >= 0`. If `actual` is negative (e.g., a refund credited to the category), `rawPct` will be negative, `barPct` will be negative (since `Math.min(negative, 1.0)` returns the negative number), and `style.width` will be a negative percentage string like `"-5%"`. Browsers will ignore this (width won't render), so it won't visibly break, but:
- `barZoneCls` will be set to `styles.barSafe` (negative < 0.85), so a bar div with `role="progressbar"` will be emitted to the DOM even though it has zero visible width.
- `aria-valuenow` will be a negative number, which is nonsensical for a progressbar.

**Required change:** Add a guard: `if (!isIncome && budgeted > 0 && actual >= 0)`. Alternatively, clamp `actual` to 0 with `Math.max(actual, 0)` before computing `rawPct`.

---

### 6. MUST FIX — `actual === 0` and `budgeted > 0` renders a zero-width bar div for no reason

**File:** Plan Section 5.2

When `actual === 0` and `budgeted > 0`, `rawPct = 0`, `barPct = 0`, `barZoneCls = styles.barSafe`. The code renders a `<div>` with `style.width = "0%"` and `role="progressbar"`. This is:
- Visually invisible (0% width).
- Adds a DOM element with `role="progressbar"` that screen readers will announce as "0% of budget spent" — which is valid but arguably noise.
- Adds 1 unnecessary DOM node per zero-spend cell.

**Required change:** Add `actual > 0` to the guard condition, or check `rawPct > 0` before setting `barZoneCls`. If the user has spent $0 on a budgeted category, no bar should render.

---

### 7. SHOULD FIX — The `pct == 100%` exactly case in the architecture doc contradicts the implementation plan

**File:** Architecture doc Section 4.1 vs. Plan Section 5.2

The architecture doc's color table (Section 4.1) lists a "Neutral" row: "pct == 100% exactly, or budgeted == 0 → No bar rendered." But the implementation plan's zone logic (Section 5.2) assigns `barOver` when `rawPct >= 1.0`, which includes exactly 100%. So a cell at exactly 100% (e.g., actual=500, budgeted=500) will get a red bar, contradicting the architecture doc which says no bar.

In practice, exactly 100% means `variance === 0`, so `isOver` is false and `isUnder` is false — the text span gets `.neutral`. But the bar logic does not check variance; it only checks `rawPct >= 1.0`. The implementation will show a full-width red bar with neutral-colored text, which is visually confusing ("you're exactly on budget but the bar is red?").

**Required change:** Decide and be consistent. Options:
- (a) Follow the architecture doc: no bar at exactly 100%. Add `&& rawPct > 0 && rawPct < 1.0 || rawPct > 1.0` to the bar rendering condition. Or simpler: change `rawPct >= 1.0` to `rawPct > 1.0` for the over zone, and add a `rawPct === 1.0` case that sets `barZoneCls = null` (no bar).
- (b) Show a green or amber bar at exactly 100% (some apps do this — "you're at your limit but not over"). Change the architecture doc to match.

Option (a) is cleaner — at exactly 100%, the user is on budget, and the text is already neutral-colored. No bar avoids mixed signals.

---

### 8. SHOULD FIX — Fixture `totals_by_month` not updated when adding Entertainment category

**File:** `fixtures.js`, lines 127-130

The `totals_by_month` values are labeled as "expense-only totals" and currently reflect `500+200=700` (Groceries + Restaurants budgeted) and `523+215=738` (actual). Adding Entertainment (budgeted: 300, actual: 120 for Nov; 300/280 for Dec) means the totals should become:
- Nov: budgeted=1000, actual=858 (523+215+120)
- Dec: budgeted=1000, actual=954 (489+185+280)

If any test or component uses `totals_by_month`, stale values will cause failures.

**Required change:** Check if `totals_by_month` is consumed anywhere. If yes, update the values. If only the bar chart uses it and no BudgetTable test references it, note this explicitly in the plan so it doesn't become a latent bug.

---

### 9. SHOULD FIX — The fixture's Paycheck Dec has `variance: -200` (negative), meaning income "over budget" — but `isOver` is false because `isIncome` is true

**File:** `fixtures.js`, line 139

Paycheck Dec: `budgeted: 6000, actual: 6200, variance: -200`. The negative variance means income exceeded the budget (which is good for income). The `isIncome` guard prevents the over class from being applied. This is correct behavior.

However, test 3 ("does not render a progressbar for income cells") relies on this. If someone later changes the `isIncome` guard in the bar logic but forgets to update the variance guard, the income Paycheck row could incorrectly get a bar. The test would catch this, which is good.

**No code change needed.** This is informational — the test coverage is adequate.

---

### 10. SHOULD FIX — Test 4 (null budgeted) uses a `sparseCategories` fixture with a missing month, but the plan doesn't account for how `CategoryGroup` renders

**File:** Plan Section 4, test 4

The test creates a `sparseCategories` array with one category in group "Other" that has data for Nov but not Dec. It renders `BudgetTable` with the standard `months` array (`['2025-11-01', '2025-12-01']`). For Dec, `cat.months?.['2025-12-01']` is `undefined`, so the ternary in the JSX hits the `else` branch: `<span className={styles.empty}>—</span>`. This means no `CellValue` is called for Dec, so no bar is rendered. The test expects `allBars.length === 1`, which is correct.

However, this test uses `sparseCategories` alone — it does NOT include the standard `categories` from the fixture. This means the "Income" and "Expenses" section headers will still render, but no income or other expense categories will exist. The `incomeCategories` array will be empty and `expenseCategories` will have one entry. The `SummaryTable` will render with all-zero income values. This is fine for the test's purpose, but worth noting: the test is implicitly also testing that the SummaryTable does not render any bars (it shouldn't, since SummaryTable doesn't use CellValue).

**No code change needed.** The test is correct.

---

### 11. SHOULD FIX — Missing test for `budgeted === 0` edge case

**File:** Plan Section 4 (test list)

The plan checks `budgeted > 0` before computing the bar. But there is no test for the case where `budgeted === 0` and `actual > 0` (e.g., unbudgeted spending). The guard `budgeted > 0` prevents a divide-by-zero, but this edge case should be explicitly tested to prevent regressions.

**Required change:** Add test 11: "does not render a progressbar when budgeted is zero." Fixture: `{ budgeted: 0, actual: 50, variance: -50 }`. Assert no `[role="progressbar"]` in that cell.

---

### 12. SHOULD FIX — `z-index: 1` on `.empty` is unnecessary since empty cells never have a bar

**File:** Plan Section 6.2

The plan adds `position: relative; z-index: 1` to all four text classes: `.over`, `.under`, `.neutral`, `.empty`. The `.empty` class is used when `budgeted == null`, in which case `CellValue` returns early before any bar logic. The bar div is never rendered alongside an `.empty` span. Adding z-index and position to `.empty` is harmless but unnecessary.

**Required change:** Optional cleanup — skip `.empty` from the z-index additions. Not worth blocking on.

---

### 13. SHOULD FIX — CSS uses hardcoded `rgba` values instead of CSS custom properties with alpha

**File:** Plan Section 6.3

The plan uses `rgba(52, 211, 153, 0.18)` etc. with a comment noting the source variable. If the design tokens in `index.css` ever change (e.g., `--green` changes from `#34d399` to something else), the bar colors will be out of sync. The plan acknowledges this but rejects `color-mix()` due to CSS Level 5 concerns.

Modern browser support for `color-mix()` is now >95% (baseline since 2023). Consider using `color-mix(in srgb, var(--green) 18%, transparent)` instead, which stays in sync with token changes automatically.

**Required change:** Not blocking, but strongly recommended for maintainability. At minimum, add a comment in the CSS referencing the source variable and the hex value it was derived from (the plan already does this, which is good).

---

### 14. CONSIDER — No test for the `prefers-reduced-motion` media query

**File:** Plan Section 4

The plan adds a `@media (prefers-reduced-motion: reduce)` rule but includes no test for it. JSDOM does not support `matchMedia` for CSS media queries on rendered styles, so testing this in unit tests is impractical. The plan correctly defers this to the Playwright QA visual check (Section 9).

**No code change needed.** The Playwright verification checklist item is sufficient.

---

### 15. CONSIDER — Performance for large category sets (20+ categories x 12 months)

**File:** Architecture doc Section 7

The architecture doc mentions 240 cells as the worst case and dismisses performance concerns. This is reasonable — 240 lightweight `<div>` elements with no event listeners, no ResizeObserver, and CSS-only transitions have negligible performance impact. React's reconciliation handles this efficiently.

However, if the user has 50+ expense categories (possible with granular budgeting), the count rises to 600+ bar divs. This is still fine for modern browsers, but worth mentioning as a future consideration if the component ever gains per-bar event handlers or animations.

**No code change needed.**

---

### 16. CONSIDER — Bar color semantics when viewing past months where all spending is finalized

**File:** Architecture doc Section 3.3

The bar transition (`width 300ms ease`) fires when data changes, such as switching month ranges. For historical months where all spending is finalized, the bar is purely informational — the "warning" amber zone at 85-99% for a completed month feels like a stale warning. This is a UX consideration, not a bug. Competitors (Monarch, YNAB) also show the same color coding for historical months.

**No code change needed.**

---

### 17. CONSIDER — The `monthName` format `"Nov '25"` in bar `aria-label` is not included

**File:** Plan Section 5.2

The bar's `aria-label` is `"${rawPctRounded}% of budget spent"`. This tells the screen reader the percentage but not *which* category or *which* month. The label would be more useful as `"Groceries: 105% of budget spent in Nov '25"`. However, the text span already contains the dollar amounts and is in the same `<td>`, which is in a `<tr>` with the category name and under a `<th>` with the month — so the context is available via table navigation.

**No code change needed for v1.** Consider enhancing the label in a future iteration if screen reader users report confusion.

---

## Summary

| Severity | Count | Findings |
|----------|-------|----------|
| **MUST FIX** | 6 | #1, #3, #4, #5, #6, #7 |
| **SHOULD FIX** | 4 | #2, #8, #11, #13 |
| **CONSIDER** | 4 | #14, #15, #16, #17 |
| **Informational** | 3 | #9, #10, #12 |

### Priority Changes for the Final Plan

1. **Add guards for `actual <= 0`** (findings #5, #6) — prevent nonsensical bars
2. **Resolve the exactly-100% contradiction** (finding #7) — decide and be consistent between architecture doc and code
3. **Fix `aria-valuenow` / `aria-valuemax` spec violation** (finding #3) — will flag in accessibility audits
4. **Scope existing over/under tests to `span`** (finding #1) — prevent silent test regression
5. **Use consistent rounding for width and ARIA** (finding #4) — avoid confusing inconsistency
6. **Add test for `budgeted === 0`** (finding #11) — missing edge case coverage
7. **Update `totals_by_month` in fixture** (finding #8) — prevent latent bugs
