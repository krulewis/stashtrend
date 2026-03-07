# Architecture Decision: Budget Heatmap View

## Decision Summary

The Budget Heatmap View is a mobile-only 6-month budget health grid that becomes View 1 in the existing `HorizontalSwipeContainer` (pushing Month Detail to View 2 and Monthly Summary to View 3). It displays expense groups as rows with colored dots per month, using the existing `getBudgetZone()` classification from `budgetUtils.js`. The implementation requires no backend changes -- all data comes from the existing `fetchBudgetHistory(12)` call. Key architectural choices: CSS Grid without subgrid for browser compatibility, a shared `groupExpenses()` pure function extracted to `budgetUtils.js`, a new `WindowPicker` component (not extending `MonthDropdown`), and a `labels` prop added to `HorizontalSwipeContainer`.

---

## Decision 1: Grid Layout Strategy

### Chosen Approach: CSS Grid (flat, no subgrid)

**Description.** Use `display: grid` with `grid-template-columns: 110px repeat(6, 1fr)` on each row. Each row (group header or category) is its own grid container with the same column template. Month header labels use an identical grid. No `subgrid` is used.

**Rationale.** Subgrid provides automatic column alignment between parent and child grids, which is elegant but introduces a Safari 16+ floor (October 2022). The heatmap rows are flat -- there is no parent-child grid nesting that would benefit from subgrid. Each row has the same 7-column template. Repeating the template on each row achieves identical alignment without any browser floor concern. The column widths are: 110px for the label, then 6 equal fractions for dot cells. In a 375px viewport with 16px padding on each side, that leaves 343px total -- 110px label + 233px for 6 columns = ~38px per dot cell, which comfortably fits a 12px dot with touch padding.

**Alignment with requirements.** Uniform column alignment across all rows. Works on all mobile browsers the app currently targets. No polyfill or feature detection needed.

### Rejected Alternatives

**CSS Grid + subgrid.** Rejected because (a) the layout does not have a nested parent-child grid relationship that would benefit from subgrid -- every row is independent with the same column count, and (b) it raises the browser floor to Safari 16+ for no practical gain. Subgrid solves a problem we do not have here.

**Flexbox with fixed widths.** Rejected because achieving exact column alignment across independent flex containers requires hardcoded pixel widths on every cell, which is fragile across viewport sizes. CSS Grid with `repeat(6, 1fr)` handles this naturally. Flexbox also lacks the `grid-template-columns` shorthand, making the column contract less explicit.

**CSS Table (`display: table`).** Rejected because table display lacks scroll-snap integration, makes row-level styling (hover, focus) harder, and is semantically misleading for a visualization grid. Grid is the correct modern layout primitive.

---

## Decision 2: Grouping Logic Extraction

### Chosen Approach: Extract a pure `groupExpenses()` function to `budgetUtils.js`

**Description.** Extract the grouping logic from `MonthDetailView.jsx` (lines 82-138) into a pure function in `frontend/src/utils/budgetUtils.js`:

```js
/**
 * Group expense categories by their effective custom group.
 * Returns: [{ groupName, categories: [{ category_id, category_name, effectiveGroup, sort_order }] }]
 * Does NOT extract month-specific actual/budgeted -- callers do that.
 */
export function groupExpenses(categories, customGroups)
```

The function performs steps 1-2 and 4-5 from the existing `useMemo` block: filter to expenses, resolve effective group (custom override or Monarch `group_name` fallback), group by effective group name, sort within groups by `sort_order` then `category_name`. It does NOT extract `monthData.actual/budgeted` for any specific month -- that is left to the caller.

`MonthDetailView` calls `groupExpenses(categories, effectiveGroups)` and then maps over the result to extract `cat.months[selectedMonth]` for each category. `HeatmapView` calls the same function and maps over the result to extract `cat.months[windowMonth]` for each of its 6 window months per row.

**Rationale.** The grouping logic (filter expenses, resolve custom group, sort) is identical between MonthDetailView and HeatmapView. The only difference is how month data is extracted afterward: MonthDetailView needs one month, HeatmapView needs six. By extracting grouping-only (no month extraction), both views share the expensive part and diverge only in the cheap part.

A custom hook (`useGroupedExpenses`) was considered but rejected -- the logic is a pure data transformation with no hooks dependency (no state, no effects, no refs). A plain function is simpler and more testable. Both views wrap it in their own `useMemo` with their specific dependencies.

**Alignment with requirements.** No duplication of the ~50-line grouping logic. Single source of truth in `budgetUtils.js` alongside `getBudgetZone` and `WARNING_THRESHOLD`. MonthDetailView's existing behavior (including `effectiveGroups` with draft state) is preserved because it passes `effectiveGroups` (which may be `draftGroups` during reorder mode) as the `customGroups` argument.

### Rejected Alternatives

**Duplicate in HeatmapView.** Rejected because it creates a maintenance burden -- any change to grouping logic (new sort rules, new group resolution fallback) must be applied in two places. The grouping logic is already ~50 lines with non-trivial `sort_order` and `effectiveGroup` resolution. Duplication invites divergence.

**`useGroupedExpenses` hook.** Rejected because the logic has no hook-specific needs. A hook would force it to live in a `hooks/` directory, require hook rules compliance in tests, and add ceremony (importing as `useX`, calling only at top level) for zero benefit. The function is a pure `(categories, customGroups) => groupedResult[]` transformation.

**Shared component wrapping both views.** Rejected because MonthDetailView and HeatmapView have completely different rendering (group cards with DnD vs. grid rows with dots). The shared part is the data transformation, not the UI tree.

---

## Decision 3: Aggregate Dot Computation

### Chosen Approach: Sum-then-classify

**Description.** For each group row's aggregate dot in a given month: sum all `actual` values across the group's categories for that month, sum all `budgeted` values, then call `getBudgetZone(totalActual, totalBudgeted)` to determine the dot color. This matches the existing pattern in `BudgetGroup.jsx` lines 40-41 which already computes `groupActual` and `groupBudgeted` as sums.

**Rationale.** The spec explicitly states "sum of all budgeted and actual amounts." This is also consistent with how `BudgetGroup` already shows aggregate pills. The zone classification rules in `getBudgetZone` (safe/warning/over/no-budget/no-data) apply cleanly to summed values.

**Alignment with requirements.** Consistent with existing aggregate display in BudgetGroup. Uses the single source of truth (`getBudgetZone`) for classification.

### Rejected Alternatives

**Majority vote (classify each category, then pick the most common zone).** Rejected because (a) the spec says to sum, not vote; (b) majority vote obscures magnitude -- a group with one massively over-budget category and four safe ones would still show "safe"; (c) it requires defining tie-breaking rules for equal vote counts, adding complexity for a worse result.

**Worst-zone (use the worst zone among categories).** Rejected because it would make almost every group appear "over" or "warning" if even one small category exceeds its budget, which is not useful signal. Sum-then-classify gives a more accurate picture of the group's overall health.

---

## Decision 4: Window Picker Component

### Chosen Approach: New `WindowPicker` component

**Description.** Create `frontend/src/components/mobile/WindowPicker.jsx` as a new component, separate from `MonthDropdown`. It renders a row of 6 month labels (abbreviated, e.g., "Jan", "Feb") with left/right arrow buttons to shift the window. No dropdown/listbox -- just a horizontal strip showing which 6 months are currently visible, with arrow taps to shift the window by one month.

The component receives `months` (full sorted array), `windowStart` (index into months), and `onWindowChange` (callback with new start index). The parent (`HeatmapView`) owns the window state.

**Rationale.** `MonthDropdown` uses a hardcoded `const LISTBOX_ID = 'month-listbox'` for ARIA linkage. Both `MonthDropdown` (in MonthDetailView, View 2) and any new picker (in HeatmapView, View 1) would be mounted simultaneously inside the swipe container. Two elements with the same `id` violate the HTML spec and break ARIA `aria-controls` linkage. Fixing the ID collision in MonthDropdown (e.g., accepting an `id` prop) is possible but changes MonthDropdown's contract for a use case it was not designed for -- the heatmap picker is not a dropdown at all, it is a horizontal window slider.

The spec says "calendar-style picker," which aligns better with a compact strip of month abbreviations with shift arrows than with a combobox dropdown. The UX goal is to show which months are in the grid and let the user slide the window, not to select a single month from a list.

**Alignment with requirements.** No ARIA ID collision. Purpose-built for the heatmap's 6-month window concept. Clean separation of concerns -- MonthDropdown stays a single-month selector, WindowPicker manages a range.

### Rejected Alternatives

**Extend MonthDropdown.** Rejected because (a) the LISTBOX_ID collision requires contract changes to MonthDropdown that affect its existing consumers; (b) a 6-month window slider is fundamentally different from a single-month combobox -- forcing both behaviors into one component violates single responsibility; (c) MonthDropdown's keyboard navigation (ArrowUp/Down to select one month) does not map to the window-shift interaction.

**Native `<select>`.** Rejected because (a) it is a single-value selector, not a range/window control; (b) native selects cannot be styled to show the current window's month labels inline; (c) it would be the only native form control in the mobile budget UI, breaking visual consistency with the custom-styled MonthDropdown and BudgetPill components.

---

## Decision 5: HorizontalSwipeContainer Changes

### Chosen Approach: Add a `labels` prop (array of strings)

**Description.** Add an optional `labels` prop to `HorizontalSwipeContainer`:

```js
HorizontalSwipeContainer.propTypes = {
  // ...existing
  labels: PropTypes.arrayOf(PropTypes.string),
}
```

When provided, `labels[i]` is used as the `aria-label` on the `role="tab"` dot button for pane `i`. When not provided, fall back to the existing hardcoded labels. The current code has:

```js
aria-label={i === 0 ? 'Month detail view' : 'Monthly summary view'}
```

This hardcodes 2-pane knowledge into a generic container. With 3 panes, it would need to become a ternary chain, which is fragile. Instead:

```js
aria-label={labels?.[i] ?? `View ${i + 1}`}
```

**Rationale.** The container is a general-purpose scroll-snap layout primitive. It should not know about budget view names. A `labels` prop lets the parent (`MobileBudgetPage`) declare the names while keeping the container generic. The fallback `View ${i + 1}` ensures backward compatibility if `labels` is omitted.

**Alignment with requirements.** Container remains a reusable primitive. Adding a third child "just works" -- the dot indicators already render from `childArray.map()`. Only the ARIA labels need the parent's input.

### Rejected Alternatives

**Derive labels from children.** Rejected because React children do not have a standard "label" concept. Deriving labels would require a convention like `child.props.viewLabel` or `child.type.displayName`, both of which are fragile (displayName is stripped in production builds, and requiring a specific prop on children couples the container to its consumers).

**Hardcode 3 labels.** Rejected because it makes the container non-reusable and requires editing the container every time a view is added or removed. The current 2-label hardcoding is already a minor code smell; extending it to 3 would entrench the pattern.

---

## Decision 6: Data Flow

### Chosen Approach: No API changes -- use existing `fetchBudgetHistory(12)` data

**Description.** The existing data flow provides everything the heatmap needs:

1. `BudgetPage` fetches via `fetchBudgetHistory(12)` on mobile, yielding `budgetData.categories` (array of category objects with `cat.months[monthKey].actual/budgeted`).
2. `MobileBudgetPage` receives `budgetData` and `customGroups` as props.
3. `HeatmapView` receives `categories`, `customGroups`, and `months` from `MobileBudgetPage`.
4. For each group row, for each of the 6 window months, `HeatmapView` reads `cat.months[monthKey]` to get `{ actual, budgeted }`.

The 12-month fetch provides ample coverage for any 6-month window the user selects. No new API endpoint is needed.

**Confirmed constraints:**
- Expenses only -- no income rows in the heatmap. Income categories are filtered out by `groupExpenses()` (same filter as MonthDetailView: `group_type !== 'income' && group_type !== 'transfer'`).
- Grey dot for no-data/no-budget: `getBudgetZone` returns `'no-data'` or `'no-budget'`, both styled with `var(--text-muted)` in the heatmap dot CSS.

**Alignment with requirements.** Zero backend work. Data already available. 12 months of history > 6-month window with room for scroll.

### Rejected Alternatives

**New `/api/budgets/heatmap` endpoint.** Rejected because the existing data is sufficient. A new endpoint would duplicate the budget query with a different shape, adding maintenance burden for no performance gain -- the data volume is small (typically 20-40 categories x 12 months).

**Fetch 6 months instead of 12.** Rejected because `fetchBudgetHistory(12)` is already called and shared across all three views. Reducing to 6 would break MonthlySummaryView's 12-month range option.

---

## Decision 7: Window Default and Behavior

### Chosen Approach: Default to the 6 most recent months, window state owned by HeatmapView

**Description.** On initial render, the heatmap window shows the 6 most recent months from `monthsDesc` (already sorted most-recent-first by `MobileBudgetPage`). The window is defined by a `windowStart` index (0 = most recent). Left arrow increments `windowStart` (shifts older), right arrow decrements (shifts newer). The window cannot shift past the available data bounds.

Window state (`windowStart`) lives in `HeatmapView` as local `useState(0)`. It does not need to be lifted to `MobileBudgetPage` because no other view consumes it.

**Alignment with requirements.** Most recent data is most relevant. Consistent with how `MonthlySummaryView` defaults to showing recent months first.

---

## Open Questions -- Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Extract grouping logic or duplicate? | Extract to `groupExpenses()` in `budgetUtils.js` | See Decision 2 |
| 2 | Subgrid browser floor acceptable? | No -- use flat CSS Grid | See Decision 1 |
| 3 | Window default? | 6 most recent months | See Decision 7 |
| 4 | Edit Groups button on heatmap? | No | Edit Groups triggers reorder mode with DnD, which is specific to MonthDetailView's BudgetGroup cards. The heatmap has no DnD. Users swipe to Month Detail to edit groups. |
| 5 | Income rows in heatmap? | No -- expenses only | Matches MonthDetailView's filter. Income categories have different semantics (under-budget is bad, not good), which would require inverted zone logic. Out of scope. |
| 6 | No-budget/no-data dot color? | `var(--text-muted)` (#4A6080) | Both `no-data` and `no-budget` zones render as grey dots. Distinguishing them visually adds noise for minimal user value on a 12px dot. The ARIA label distinguishes them for accessibility. |

---

## Design Details

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/mobile/HeatmapView.jsx` | Main heatmap grid component (View 1) |
| `frontend/src/components/mobile/HeatmapView.module.css` | Grid layout, dot styles, row styles |
| `frontend/src/components/mobile/WindowPicker.jsx` | 6-month window shift control |
| `frontend/src/components/mobile/WindowPicker.module.css` | Picker strip styling |
| `frontend/src/components/mobile/HeatmapView.test.jsx` | Unit tests |
| `frontend/src/components/mobile/WindowPicker.test.jsx` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/utils/budgetUtils.js` | Add `groupExpenses(categories, customGroups)` function |
| `frontend/src/utils/budgetUtils.test.js` | Tests for `groupExpenses()` |
| `frontend/src/components/mobile/MonthDetailView.jsx` | Import and call `groupExpenses()` instead of inline logic; extract month data in a separate map step |
| `frontend/src/components/mobile/HorizontalSwipeContainer.jsx` | Add optional `labels` prop, use for dot `aria-label` |
| `frontend/src/pages/MobileBudgetPage.jsx` | Add `HeatmapView` as first child of swipe container; pass `labels` to container; adjust `activeView` default to 0 (heatmap) |

### Component Data Flow

```
BudgetPage
  useEffect → fetchBudgetHistory(12) + fetchCustomGroups()
    ↓ props
MobileBudgetPage
  monthsDesc, budgetData.categories, customGroups
    ↓ props to each child in HorizontalSwipeContainer
  ┌─────────────────────────────────────────────────┐
  │ HorizontalSwipeContainer (labels prop)          │
  │  [0] HeatmapView                               │
  │       → groupExpenses(categories, customGroups) │
  │       → for each group, for each windowMonth:   │
  │           sum actual/budgeted → getBudgetZone   │
  │       → WindowPicker (window shift control)     │
  │  [1] MonthDetailView (unchanged behavior)       │
  │  [2] MonthlySummaryView (unchanged behavior)    │
  └─────────────────────────────────────────────────┘
```

### Dot Color Mapping

| Zone | CSS Variable | Hex | Dot Meaning |
|------|-------------|-----|-------------|
| `safe` | `--color-positive` | #2ECC8A | Under 85% of budget |
| `warning` | `--color-warning` | #F5A623 | 85-100% of budget |
| `over` | `--color-negative` | #FF5A7A | Over 100% of budget |
| `no-budget` | `--text-muted` | #4A6080 | Spending exists, no budget set |
| `no-data` | `--text-muted` | #4A6080 | No data for this month |

### Grid Layout (375px viewport)

```
| 16px | 110px label | 38px | 38px | 38px | 38px | 38px | 38px | 16px |
|      |             | dot  | dot  | dot  | dot  | dot  | dot  |      |
```

- Total: 16 + 110 + (6 x 38) + 16 = 370px (5px flex slack absorbed by `1fr`)
- Dot: 12px circle, centered in cell
- Row height: ~36px (group header), ~28px (category row)
- Group header row: bold label + aggregate dots
- Category row: indented label (via `padding-left`) + per-category dots
- Expand/collapse: group header tap toggles category rows (CSS `grid-template-rows: 0fr` pattern, consistent with BudgetGroup)

### `groupExpenses()` Function Signature

```js
/**
 * Group expense categories by effective custom group.
 *
 * @param {Array} categories - Raw categories from budgetData.categories
 *   Each has: category_id, category_name, group_type, group_name, months
 * @param {Object} customGroups - { "Group Name": [{ category_id, sort_order }] }
 * @returns {Array<{ groupName: string, categories: Array<{ category_id, category_name, effectiveGroup, sort_order, months }> }>}
 *
 * NOTE: Unlike MonthDetailView's current useMemo, this function preserves
 * the full `months` object on each category so callers can extract
 * whichever months they need.
 */
export function groupExpenses(categories, customGroups)
```

### `WindowPicker` Component Interface

```jsx
<WindowPicker
  months={monthsDesc}         // full array, most-recent-first
  windowStart={windowStart}   // index into months (0 = most recent)
  windowSize={6}              // always 6 for heatmap
  onWindowChange={setWindowStart}
/>
```

Renders: `[<] Jan  Feb  Mar  Apr  May  Jun [>]`

Arrow buttons disabled at bounds (left disabled when `windowStart + windowSize >= months.length`, right disabled when `windowStart <= 0`).

---

## Risks and Mitigations

### Risk 1: MonthDetailView Regression

**Risk.** Refactoring MonthDetailView to use the extracted `groupExpenses()` could introduce subtle behavioral differences, especially around the `effectiveGroups` (draftGroups during reorder mode) path.

**Mitigation.** The extraction is mechanical -- the same logic, same inputs, same output shape. MonthDetailView's existing tests will catch any regression. The refactored MonthDetailView adds only a post-grouping `.map()` to extract `cat.months[selectedMonth]` for each category, which is a trivial transformation. Run the full frontend test suite after the refactor, before implementing HeatmapView.

### Risk 2: Performance with 40+ Categories x 6 Months

**Risk.** Computing zone classifications for every category in every group across 6 months on every render could be slow on low-end mobile devices.

**Mitigation.** The computation is O(categories x months) -- typically 30-40 categories x 6 months = 180-240 `getBudgetZone` calls, each of which is a few comparisons. This is trivially fast. The `useMemo` in HeatmapView depends on `[categories, customGroups, windowStart]`, so it only recomputes when the data or window changes, not on every render. No concern at current data volumes.

### Risk 3: Swipe Container Height with 3 Panes

**Risk.** The tallest pane determines the scroll height. If HeatmapView is significantly shorter or taller than the other views, the swipe container's fixed height (`calc(100dvh - 60px - 56px - ...)`) may cause awkward whitespace or clipping.

**Mitigation.** Each pane already has `overflow-y: auto` in `HorizontalSwipeContainer.module.css`, so each pane scrolls independently. HeatmapView's height depends on the number of groups (typically 5-8), which fits comfortably in the viewport. If groups are collapsed, the view will be short but the pane scroll handles this gracefully.

### Risk 4: WindowPicker Arrow Button Discoverability

**Risk.** Users may not realize they can shift the 6-month window if the arrow buttons are too subtle.

**Mitigation.** Use `var(--accent)` for arrow buttons and `var(--text-muted)` for disabled state. The arrows are the standard mobile pattern for horizontal pagination. If user testing reveals discoverability issues, a swipe gesture on the month header strip could be added later as an enhancement.

---

## Acceptable Risk Thresholds

- MonthDetailView regression: Unacceptable -- must pass all existing tests before proceeding.
- Performance: Acceptable -- current data volumes are well within budget. Revisit only if category count exceeds 200+.
- Height variation: Acceptable -- independent pane scroll handles this.
- Arrow discoverability: Acceptable for v1 -- monitor user feedback.
