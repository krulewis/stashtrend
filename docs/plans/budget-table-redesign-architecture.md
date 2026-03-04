# Architecture: Budget Table Redesign with Progress Indicators

**Agent:** Architect (Step 2 of planning pipeline)
**Date:** 2026-03-03
**Inputs:** Research report (`budget-table-redesign-research.md`), current source files
**Next step:** Engineer Agent (sonnet) creates initial implementation plan

---

## 1. Selected Approach

**Approach E: Hybrid Background Bar + 3-Zone Color** — modified.

This approach layers a translucent progress bar behind the existing numeric text inside each budget cell. The bar uses three color zones (green, amber, red) to encode spend status, providing dual encoding (color + width) that satisfies WCAG 2.1 criterion 1.4.1.

### Why This Approach

1. **Zero layout disruption.** The bar is an absolutely-positioned background layer. Cell height, table structure, sticky columns, horizontal scroll, and collapse/expand all remain untouched. This is the single most important constraint — the multi-month grid is Stashtrend's differentiator and must not be compromised.

2. **Zero new dependencies.** Pure CSS + one inline `style.width`. No Recharts overhead, no new packages. The 240-cell worst case adds 240 lightweight `<div>` elements — negligible.

3. **Backward-compatible with existing tests.** The `<span>` retaining `.over` / `.under` classes means the two class-based tests (`querySelectorAll('[class*="over"]')` and `[class*="under"]`) continue to pass without modification.

4. **Three-zone color matches competitor patterns.** Monarch, Rocket Money, and YNAB all use green-to-amber-to-red transitions. The amber "warning" zone is a meaningful new signal that does not exist in the current implementation.

5. **Accessibility.** Color + bar width = dual encoding. ARIA `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` satisfies screen reader requirements. The bar itself is decorative from a keyboard navigation perspective (no focus state needed).

---

## 2. Rejected Alternatives

| Approach | Reason for Rejection |
|----------|---------------------|
| **A: Simple 2-Zone BG Bar** | Loses the amber warning zone. The jump from green directly to red provides no "approaching limit" signal. Approach E is a strict superset with minimal added complexity (one extra `if` branch). |
| **B: Bar Below Numbers** | Increases cell height by ~8px. With 15-20 categories visible, this adds 120-160px of vertical height to the table, pushing content below the fold. The multi-month comparison grid is already vertically dense. The background-layer approach preserves the current compact layout. |
| **C: Heat Map Cell Background** | Fails WCAG 1.4.1 standalone — color is the only encoding. The research correctly identifies that semi-transparent tints on the dark `#1e2130` background require manual tuning and are hard to distinguish at low intensity. Not worth the fragility. |
| **D: Recharts SparkBars** | Performance-disqualifying. 240 SVG/ResizeObserver instances cause measurable frame drops. Recharts is the right tool for the `BudgetChart` component (one chart); it is the wrong tool for per-cell micro-visualizations. |
| **F: Single-Month Focus Mode** | Out of scope. This is a layout redesign, not a visual enhancement. The multi-month grid is Stashtrend's key differentiator. A focus mode could be a future addition but is orthogonal to this task. |

---

## 3. Answers to Open Questions

### 3.1 Income Bars — No

Income categories will **not** receive progress bars. Rationale:

- Income "progress" has inverted semantics (more is better), which conflicts with the expense bar's "filling toward a limit" mental model. A green bar at 50% for income would incorrectly suggest "half done" when it should mean "half received so far."
- The existing guard `!isIncome` already excludes income from over/under logic. Extending this to the bar keeps the logic clean.
- If income progress tracking is desired in the future, it should use a distinct visual treatment (e.g., a blue bar with different semantics), scoped as a separate feature.

### 3.2 Overflow Visual Treatment (>100%) — Color-Only, No Overflow Indicator

When spend exceeds budget (>100%):

- The bar fills to **100% width** (capped). It does not overflow the cell.
- The bar uses the **red** color zone.
- The text remains **red and bold** (the existing `.over` class already handles red text; we add `font-weight: 600`).
- **No notch, no icon, no pulse animation.** Rationale: the bar at 100% + red text already communicates "over budget." Adding a notch or icon introduces visual noise across what could be many cells simultaneously (a bad month could have 10+ over-budget categories). The numeric text `$523 / $500` already communicates the exact overage.

### 3.3 Animation — Yes, With Constraints

- **CSS transition on bar width:** `transition: width 300ms ease` (uses `var(--ease-slow)`).
- **No mount animation.** Bars render at their final width on first paint. The transition only fires when data changes (e.g., switching month ranges or receiving updated data).
- **`prefers-reduced-motion` media query:** Disable the transition for users who have requested reduced motion. This is a single CSS rule.
- **No JavaScript animation.** No requestAnimationFrame, no spring physics. CSS transitions only.

### 3.4 Warning Threshold — 85%, Hardcoded

- **85%** is the threshold where the bar transitions from green to amber.
- This matches Monarch Money's behavior and is the industry-standard threshold for budget warnings.
- **Hardcoded, not configurable.** Rationale: adding a user-configurable threshold requires UI for the setting, persistence, and prop-drilling. The complexity is not justified for a v1. If users request configurability, it can be extracted to a constant and wired to settings later.
- The threshold is defined as a named constant (`WARNING_THRESHOLD = 0.85`) at the top of `BudgetTable.jsx` for easy future extraction.

### 3.5 Column Label Changes — No

- The sub-label stays as `"actual / budget"`. It accurately describes what the cell shows.
- Changing to "spent / budget" would be misleading for income rows (income is not "spent").
- Changing to "vs. budget" loses the information about which number is which.
- The bar is a visual enhancement to the existing data, not a new data dimension that requires relabeling.

### 3.6 Summary Table — Deferred

- No bars in the Summary Table for this iteration. The research correctly identifies that aggregate sums (Total Income, Total Expenses, Net) are semantically different from category-level progress. A negative Net value would make a progress bar nonsensical.

---

## 4. Design Specification

### 4.1 Color Tokens

All colors use existing CSS custom properties from `index.css`. No new color tokens are needed.

| Zone | Condition | Bar Background | Bar Opacity | Text Color |
|------|-----------|---------------|-------------|------------|
| **Safe (under)** | `0% <= pct < 85%` | `var(--green)` (`#34d399`) | `0.18` | `var(--green)` (existing `.under` class) |
| **Warning** | `85% <= pct < 100%` | `var(--amber)` (`#f59e0b`) | `0.22` | `var(--green)` (still under budget) |
| **Over** | `pct >= 100%` | `var(--red)` (`#f87171`) | `0.20` | `var(--red)` (existing `.over` class) |
| **Neutral** | `pct == 100%` exactly, or `budgeted == 0` | No bar rendered | — | `var(--text-primary)` (existing `.neutral` class) |
| **Income** | `isIncome === true` | No bar rendered | — | `var(--text-primary)` (existing `.neutral` class) |
| **Empty** | `budgeted == null` | No bar rendered | — | `var(--text-muted)` (existing `.empty` class) |

**Opacity rationale:** The bar must be visible but must not compromise text readability. At `0.18-0.22` opacity on the `#1e2130` card background, the tinted bars produce colors that maintain >4.5:1 contrast ratio with `var(--text-primary)` text. The amber zone gets slightly higher opacity (`0.22`) because amber is less visually prominent than green or red on a dark background.

### 4.2 Bar Geometry

| Property | Value | Rationale |
|----------|-------|-----------|
| `position` | `absolute` | Layer behind text without affecting layout |
| `left` | `0` | Fills from the left edge of the cell |
| `top` | `2px` | 2px inset from cell top for visual breathing room |
| `bottom` | `2px` | 2px inset from cell bottom |
| `border-radius` | `3px` | Slightly rounded — matches the overall design language (`--radius-sm: 6px` is for cards; bars should be subtler) |
| `width` | `${Math.min(pct, 1.0) * 100}%` | Percentage of cell width, capped at 100% |
| `pointer-events` | `none` | Bar is decorative; clicks pass through to the cell |
| `z-index` | `0` | Behind the text span |
| `transition` | `width var(--ease-slow)` | 300ms ease transition on width changes |

The `.cell` `<td>` requires `position: relative` to serve as the positioning context. The text `<span>` requires `position: relative; z-index: 1` to render above the bar.

### 4.3 Interaction with Existing CSS Classes

The existing `.over`, `.under`, `.neutral`, and `.empty` classes remain **unchanged**. They continue to control text color. The progress bar introduces new CSS classes that operate on a separate element:

```
.cell (td) — gets `position: relative` added
  ├── .bar.barSafe    — green background, 0-84%
  ├── .bar.barWarn    — amber background, 85-99%
  ├── .bar.barOver    — red background, 100%+
  └── span.over/.under/.neutral — text, unchanged
```

No existing class is modified. No existing class is removed.

### 4.4 ARIA Attributes

The progress bar `<div>` receives:

```jsx
<div
  className={`${styles.bar} ${barZoneCls}`}
  style={{ width: `${barPct * 100}%` }}
  role="progressbar"
  aria-valuenow={rawPctRounded}    // actual percentage (can exceed 100)
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={`${rawPctRounded}% of budget spent`}
/>
```

- `aria-valuenow` uses the **raw** (uncapped) percentage so screen readers announce "115% of budget spent" for over-budget cells, even though the visual bar caps at 100%.
- The bar is a supplementary indicator. The text span already contains the dollar amounts, which screen readers will read. The `aria-label` on the bar adds the percentage context.

### 4.5 Mobile Behavior

No special mobile handling required. The existing architecture handles narrow viewports correctly:

- `.tableWrap` has `overflow-x: auto` — horizontal scroll on narrow screens.
- The bar is percentage-based (`width: N%` of its containing `<td>`), so it scales proportionally as cells narrow.
- At very narrow cell widths (< 40px), the bar still provides a color signal even if the exact width is hard to distinguish.
- The text overflow behavior is unchanged — numeric text already clips/scrolls via the table wrapper.

### 4.6 `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  .bar { transition: none; }
}
```

---

## 5. Component Architecture

### 5.1 Modify `CellValue`, Do Not Create a New Component

The progress bar is tightly coupled to `CellValue`'s existing props (`budgeted`, `actual`, `variance`, `isIncome`). Extracting it into a separate `BudgetProgressBar` component would require passing all the same props and would not be reused anywhere else (the Summary Table is explicitly excluded). Keeping the bar inside `CellValue` avoids unnecessary abstraction.

The bar logic adds approximately 10 lines to `CellValue`. This does not warrant a new component.

### 5.2 Updated `CellValue` Signature

Props remain unchanged:

```ts
{ budgeted: number | null, actual: number, variance: number, isIncome: boolean }
```

No new props are needed. All bar logic is derived from existing props.

### 5.3 Data Flow

```
BudgetTable (months, categories)
  └── CategoryGroup (groupName, categories, months, isIncome)
       └── CellValue (budgeted, actual, variance, isIncome)
            ├── compute pct = actual / budgeted
            ├── compute zone: safe | warn | over | null
            ├── render bar div (if zone !== null)
            └── render text span (unchanged)
```

### 5.4 Constant

```js
const WARNING_THRESHOLD = 0.85
```

Defined at module scope in `BudgetTable.jsx`, above the `CellValue` function. Single source of truth for the threshold.

### 5.5 Bar Zone Logic (Pseudocode)

```js
// Inside CellValue, after isOver/isUnder computation:
let barZoneCls = null
let barPct = 0

if (!isIncome && budgeted > 0) {
  const rawPct = actual / budgeted
  barPct = Math.min(rawPct, 1.0)

  if (rawPct >= 1.0)                   barZoneCls = styles.barOver
  else if (rawPct >= WARNING_THRESHOLD) barZoneCls = styles.barWarn
  else                                  barZoneCls = styles.barSafe
}
```

Note: the zone logic checks `rawPct >= 1.0` first (over), then `>= 0.85` (warning), then falls through to safe. This ordering prevents an over-budget cell from incorrectly landing in the warning zone.

### 5.6 Interaction with Collapse/Expand

No interaction. The bar is inside the `<td>`, which is inside the `<tr>`. When `CategoryGroup` collapses rows by conditionally rendering `<tr>` elements, the bars inside those rows are unmounted and remounted with the rows. No special handling needed.

---

## 6. Test Strategy

### 6.1 Existing Tests — Impact Assessment

| Test | Will It Break? | Action |
|------|---------------|--------|
| `renders the section title` | No | No change |
| `renders month column headers` | No | No change |
| `renders actual / budget sub-label` | No | No change |
| `renders Income section header` | No | No change |
| `renders Expenses section header` | No | No change |
| `renders income category name` | No | No change |
| `renders expense category names` | No | No change |
| `renders expense group header` | No | No change |
| `renders Total Income/Expenses/Net rows` | No | No change |
| `over-budget cells have the over class` | **No** — `.over` class stays on the `<span>` | No change |
| `under-budget cells have the under class` | **No** — `.under` class stays on the `<span>` | No change |
| `expense group header can be clicked to collapse` | No | No change |
| `returns null when no data` | No | No change |

**Zero existing tests should break.** The bar is a new DOM element added alongside the existing `<span>`, not a replacement.

### 6.2 New Test Cases

All new tests go in `BudgetTable.test.jsx`, inside a new `describe('progress bars', ...)` block.

1. **Bar renders for over-budget expense cells.** Verify that cells where `actual > budgeted` (e.g., Groceries Nov: 523/500) contain an element with `role="progressbar"`.

2. **Bar renders for under-budget expense cells.** Verify that cells where `actual < budgeted` (e.g., Groceries Dec: 489/500) contain an element with `role="progressbar"`.

3. **Bar does NOT render for income cells.** Verify that the Paycheck row has no `role="progressbar"` elements.

4. **Bar does NOT render for empty cells (budgeted == null).** Verify that a cell with no budget data has no `role="progressbar"`.

5. **Bar width reflects spend percentage.** For Groceries Dec (489/500 = 97.8%), check `style.width` equals `"97.8%"` (or the rounded equivalent). For Groceries Nov (523/500, capped at 100%), check `style.width` equals `"100%"`.

6. **Warning zone class applied at 85-99%.** Need a test fixture category with `actual/budgeted` in the 85-99% range. Verify the bar element has the warning class (check `class` contains `barWarn`).

7. **Safe zone class applied below 85%.** Need a test fixture category with `actual/budgeted < 0.85`. Verify the bar element has the safe class (check `class` contains `barSafe`).

8. **Over zone class applied at 100%+.** Verify the Groceries Nov bar has the over class (`barOver`).

9. **ARIA attributes present and correct.** Check `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` on a progressbar element. For over-budget cells, verify `aria-valuenow` reflects the raw (uncapped) percentage (e.g., 105 for 523/500).

10. **Bars disappear when group is collapsed.** Click the group header to collapse, then verify no `role="progressbar"` elements exist inside that group's rows.

### 6.3 Test Fixture Updates

The existing `MOCK_BUDGET_HISTORY` fixture has:

- Groceries Nov: 523/500 = 104.6% (over zone)
- Groceries Dec: 489/500 = 97.8% (warning zone)
- Restaurants Nov: 215/200 = 107.5% (over zone)
- Restaurants Dec: 185/200 = 92.5% (warning zone)

**Missing: a safe-zone fixture.** Add one category to `MOCK_BUDGET_HISTORY` with spend < 85% to test the safe zone:

```js
{
  category_id: 'cat_3',
  category_name: 'Entertainment',
  group_name: 'Fun',
  group_type: 'expense',
  months: {
    '2025-11-01': { budgeted: 300, actual: 120, variance: 180 },  // 40% — safe zone
    '2025-12-01': { budgeted: 300, actual: 280, variance: 20 },   // 93.3% — warning zone
  },
}
```

This gives us coverage across all three zones without modifying existing fixture data.

### 6.4 How to Test 3-Zone Color Logic

The zone is determined by which CSS class is applied to the bar element. Tests should:

1. Render with known fixture data covering each zone.
2. Query `[role="progressbar"]` elements.
3. Check that their `className` includes the expected zone class string (`barSafe`, `barWarn`, or `barOver`).

CSS module class names are transformed at build time, so tests should use `[class*="barSafe"]`, `[class*="barWarn"]`, `[class*="barOver"]` selectors — the same pattern already used for `.over` and `.under` in existing tests.

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Bar opacity too subtle on dark background.** Users may not notice the bars at the chosen opacity values. | Medium | Low — functional but reduced value | The opacity values (0.18-0.22) are starting points. Playwright QA (step 7) will verify visibility. If too subtle, increase to 0.25-0.30. The cap is ~0.35 before text readability degrades. |
| **`position: relative` on `.cell` breaks sticky column.** Adding `position: relative` to `<td>` elements could interact with the sticky first column's `position: sticky`. | Low | Medium | The sticky column is on `.catName` (the first `<td>`), not on `.cell` (month `<td>` elements). These are different elements. The sticky column will be unaffected. Verify in Playwright QA. |
| **CSS module class name matching in tests becomes fragile.** The `[class*="barWarn"]` pattern depends on the class name substring surviving CSS module transformation. | Low | Low | Vitest + CSS modules produces predictable class names (e.g., `_barWarn_abc123`). The `*=` selector matches substrings. This is the same pattern already used for `.over` and `.under` tests, which work today. |
| **Test fixture addition breaks other tests.** Adding the `Entertainment` category to `MOCK_BUDGET_HISTORY` changes the count of elements matched by existing selectors. | Low | Low | Review all existing tests that use `MOCK_BUDGET_HISTORY`. The tests query by text content (`getByText('Groceries')`) or by class presence (`querySelectorAll('[class*="over"]')`). Adding a new category adds more matching elements but no test asserts an exact count — they all use `toBeGreaterThan(0)`. Safe. |
| **Amber color confusion — does amber mean "bad"?** Users unfamiliar with the green/amber/red pattern may interpret amber as negative. | Low | Low | Amber is an industry-standard "warning/approaching limit" color used by Monarch, traffic lights, and system alerts. The text color remains green (under budget) in the warning zone, reinforcing that the user has not exceeded their budget yet. |

---

## 8. Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/BudgetTable.jsx` | Add `WARNING_THRESHOLD` constant. Extend `CellValue` with bar logic and bar `<div>`. |
| `frontend/src/components/BudgetTable.module.css` | Add `position: relative` to `.cell`. Add `.bar`, `.barSafe`, `.barWarn`, `.barOver` classes. Add `position: relative; z-index: 1` to `.over`, `.under`, `.neutral` spans. Add `prefers-reduced-motion` rule. |
| `frontend/src/components/BudgetTable.test.jsx` | Add `describe('progress bars', ...)` block with 10 new tests. |
| `frontend/src/test/fixtures.js` | Add `Entertainment` category to `MOCK_BUDGET_HISTORY`. |

**No new files created.** Four files modified.

---

## 9. Out of Scope (Explicit)

- Summary Table progress bars
- Income progress bars
- Configurable warning threshold
- Tooltips on bar hover
- Single-month focus mode
- Bar animations on initial mount
- Any changes to `BudgetChart.jsx`
