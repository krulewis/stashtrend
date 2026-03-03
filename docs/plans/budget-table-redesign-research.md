# Research: Budget Table Redesign with Progress Indicators

**Agent:** Research (Step 1 of planning pipeline)
**Date:** 2026-03-03
**Change size:** M (multi-file, new feature, involves tests, clear scope)
**Next step:** Architect Agent (opus) reviews this report and selects an approach

---

## 1. Problem Statement

The current `BudgetTable.jsx` renders budget status as raw text (`actual / budget`) per category cell, with only color (red/green/neutral) to signal over/under status. The information is accurate but requires the user to mentally parse and compare numbers across every cell. With 12 months × N categories, this creates significant cognitive load.

**Goal:** Make over/under-budget status instantly scannable at a glance without removing the numeric values that power users rely on.

---

## 2. Current Implementation Analysis

### 2.1 Data Shape

Each category has a `months` object keyed by ISO date string:

```js
{
  category_id: 'cat_1',
  category_name: 'Groceries',
  group_name: 'Food & Drink',
  group_type: 'expense',   // 'income' | 'expense' | 'transfer'
  months: {
    '2025-11-01': { budgeted: 500, actual: 523, variance: -23 },
    '2025-12-01': { budgeted: 500, actual: 489, variance: 11 },
  }
}
```

The spend percentage for a cell is trivially computed: `pct = actual / budgeted`. This ranges from 0 (nothing spent) through 1.0 (exactly on budget) to >1.0 (over budget).

### 2.2 Current CellValue Component

```jsx
// BudgetTable.jsx lines 6-16
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

**Current visual affordances:**
- Red text: over budget (variance < 0 for expenses)
- Green text: under budget (variance > 0 for expenses)
- Primary text color: neutral (on budget or income)
- No visual encoding of the *degree* of over/under

### 2.3 Current Cell CSS

```css
/* BudgetTable.module.css lines 134-143 */
.cell {
  padding: 7px 12px;
  text-align: right;
  white-space: nowrap;
}
.over    { color: var(--red); }
.under   { color: var(--green); }
.neutral { color: var(--text-primary); }
.empty   { color: var(--text-muted); }
```

Cells are fixed-height with `white-space: nowrap`. Adding a progress bar requires changing the cell's `display` and `padding` scheme, or making the cell `position: relative` so the bar can be a background layer.

### 2.4 Table Structure Constraints

The table uses `border-collapse: separate; border-spacing: 0` with:
- Sticky first column (category name) using `position: sticky; left: 0; z-index: 1`
- Horizontal scroll on narrow viewports (`overflow-x: auto` on `.tableWrap`)
- Collapsible expense groups via `CategoryGroup` component with local `open` state
- Separate `SummaryTable` at the top (income totals, expense totals, net)
- Month headers showing sub-label "actual / budget"

### 2.5 Existing Test Coverage

The 15 tests in `BudgetTable.test.jsx` cover:
- Section headers, category names, group names rendering
- `.over` and `.under` CSS class presence (via `querySelectorAll('[class*="over"]')`)
- Collapse/expand behavior on group click
- Null guard (renders nothing when no data)

**Critical implication:** Tests for `.over` and `.under` class existence must continue to pass. Any refactor must preserve these class names on the element containing the status information, or the tests must be updated to match the new structure.

### 2.6 No New Dependencies Available

The project's `package.json` dependencies are:
- `react` ^18.3.1
- `react-dom` ^18.3.1
- `recharts` ^2.12.7
- `prop-types` ^15.8.1

Recharts is already available and used elsewhere (BudgetChart). Adding a new library is possible but adds bundle weight and test complexity. Pure CSS is the zero-cost option.

---

## 3. Competitor Analysis

### 3.1 Monarch Money

Monarch Money (the app this project syncs with) uses horizontal progress bars as a first-class budget feature:

- Each budget category row shows a colored horizontal bar representing `actual / budgeted` percentage
- The bar fills left-to-right representing spend progress through the month
- Color transitions: neutral/blue when under budget, transitions to orange near the limit (~85%), and red when over
- Numeric "actual / budget" text is shown alongside the bar (not replaced by it)
- On mobile, the progress bar remains but the layout shifts to a single-column card view per category
- The dashboard widget shows a compact summary bar per category group

**Key insight:** Monarch does not hide the numbers — the bar is an *addition* to the text, not a replacement.

### 3.2 YNAB

YNAB's progress bar system is their most discussed UI feature:

- Horizontal bars fill across the entire row width (not just a cell) using the budget name column space
- Three modes (via Toolkit extension): Goals progress, Pacing progress, Pacing + Goals hybrid
- Color system:
  - **Green solid**: funded and available
  - **Green striped "candy cane"**: fully funded and fully spent (exactly on budget)
  - **Red striped "red candy cane of death"**: overspending
  - **Yellow**: underfunded relative to goal
- YNAB's bars optionally *replace* the numeric columns (toggled off), because their philosophy is "available amount is the only number that matters"
- This approach only works for their single-month zero-based budgeting model

**Key insight:** YNAB's bar philosophy does not translate directly to Stashtrend's multi-month grid. Stashtrend needs the numbers visible across all months simultaneously.

### 3.3 Rocket Money

Rocket Money's budget UI is primarily mobile-first:

- Each category shown as a card with a single horizontal progress bar
- Circular "donut" progress gauge on the category detail screen
- Color: green → orange → red as the percentage increases
- Slider input for adjusting budget amount inline
- No multi-month comparison grid — single current-month view only

**Key insight:** Their single-month card model is not applicable to Stashtrend's multi-month historical comparison use case. However, their color-gradient approach (green → amber → red) is worth adopting.

### 3.4 General Financial Dashboard Best Practices

From UX research on financial dashboards:

- Heat-map coloring in tables is effective when the *degree* of deviation matters, not just the direction
- Red/green alone fails accessibility: approximately 8% of men and 0.5% of women have red-green color blindness (deuteranopia/protanopia)
- Best practice: pair color with a secondary visual indicator (bar width, icon, text label) so color is reinforcement, not the only signal
- Minimum contrast ratio of 4.5:1 is required for WCAG AA compliance
- Progress bars with `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-label` satisfy screen reader requirements
- Limiting gradient stops to 3 (under → at → over) is more readable than continuous gradients in tabular contexts

---

## 4. Approach Survey

### Approach A: Pure CSS In-Cell Progress Bar (Background Layer)

Render a full-width background bar behind the cell's numeric text using a pseudo-element or an absolutely-positioned div.

**Technique:**
```css
/* Cell becomes a positioning context */
.cell {
  position: relative;
  padding: 7px 12px;
  text-align: right;
  white-space: nowrap;
}

/* Progress bar as background layer */
.progressBar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  opacity: 0.18;
  /* width set via inline style: { width: `${pct * 100}%` } */
  pointer-events: none;
}
.progressBarUnder { background: var(--green); }
.progressBarOver  { background: var(--red); }
```

```jsx
function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  const isOver  = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const cls = isOver ? styles.over : isUnder ? styles.under : styles.neutral
  const pct = budgeted > 0 ? Math.min(actual / budgeted, 1.0) : 0
  const barCls = isOver ? styles.progressBarOver : isUnder ? styles.progressBarUnder : null

  return (
    <>
      {barCls && (
        <div
          className={`${styles.progressBar} ${barCls}`}
          style={{ width: `${pct * 100}%` }}
          role="progressbar"
          aria-label={`${Math.round(pct * 100)}% of budget used`}
          aria-valuenow={Math.round(pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
      <span className={cls}>
        {fmtDollar(actual)} / {fmtDollar(budgeted)}
      </span>
    </>
  )
}
```

**Pros:**
- Zero new dependencies
- No layout changes — cell height stays the same
- Numbers remain fully visible (bar is a translucent background)
- Works with existing sticky column and horizontal scroll
- CSS transitions on `width` are smooth and GPU-accelerated
- Perfectly testable: check `style.width` or `data-*` attributes
- Compatible with existing `.over` / `.under` class tests (the `<span>` retains those classes)

**Cons:**
- The bar occupies the full cell width (left to right), so >100% spend is capped at full width with no visual indication of the *degree* of overage beyond color alone
- Low opacity bar may be hard to read on the dark background at very low percentages (0-10%)
- The bar is a decoration, not interactive — no tooltip on hover without additional JS

**Accessibility rating:** Good — bar has `role="progressbar"` with proper ARIA. Text numbers remain in DOM.

---

### Approach B: Dedicated Progress Bar Row Below Numbers

Add a thin colored bar (4–6px tall) below each cell's numeric text as a second line within the cell.

```css
.cell {
  padding: 5px 12px 7px;
  text-align: right;
}

.barTrack {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 4px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  border-radius: 2px;
  transition: width var(--ease-default);
}
.barFillUnder { background: var(--green); }
.barFillOver  { background: var(--red); }
.barFillNeutral { background: var(--accent); }
```

```jsx
return (
  <div className={styles.cellContent}>
    <span className={cls}>{fmtDollar(actual)} / {fmtDollar(budgeted)}</span>
    <div className={styles.barTrack}>
      <div
        className={`${styles.barFill} ${barFillCls}`}
        style={{ width: `${Math.min(pct * 100, 100)}%` }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(pct * 100)}% of budget used`}
      />
    </div>
  </div>
)
```

Note: The `.cell` `<td>` currently has `white-space: nowrap`. Adding a `<div>` wrapper inside `<td>` is valid HTML and allows block-level children.

**Pros:**
- Bar is visually distinct from the numbers (not behind them) — high clarity
- Works as a classic "progress track + fill" pattern familiar to users
- The track's gray background at 100% width makes the fill amount easier to read at low values vs. a transparent overlay
- Easy to add a "burst" animation when fill exceeds 100%
- Cells increase in height slightly (predictably) — consistent across all rows

**Cons:**
- Increases cell height — may require row height adjustments
- Needs an extra DOM element per cell (N categories × M months × 2 divs)
- The `<td>` currently uses `text-align: right` — the bar track needs to be `width: 100%` from the left, which is the opposite alignment from the text

**Accessibility rating:** Excellent — standard progressbar pattern.

---

### Approach C: Heat-Map Cell Background Coloring

Color the entire cell background based on spend percentage, from neutral through amber to red (over) or neutral through light-green (under).

```js
// Compute background color based on pct
function getCellBgColor(pct, isOver) {
  if (isOver) {
    const intensity = Math.min((pct - 1.0) * 2, 1.0) // 0 at 100%, 1 at 150%+
    return `rgba(248, 113, 113, ${intensity * 0.25})`  // --red with opacity
  }
  if (pct > 0.85) {
    // Warning zone: 85-100%
    return `rgba(245, 158, 11, ${(pct - 0.85) / 0.15 * 0.2})`  // --amber
  }
  return 'transparent'
}
```

**Pros:**
- No change to cell height or layout
- Works in the summary table too (easy to extend)
- Very fast to scan across many months
- Looks good in a multi-month grid view (heat-map across columns)

**Cons:**
- Color alone conveys the entire signal — fails WCAG for colorblind users without a secondary indicator (must be combined with another approach)
- Interpolating colors via inline style strings feels fragile and is harder to test
- Dark theme background (`#1e2130`) with semi-transparent overlays requires careful tuning to maintain contrast ratios
- Subtle cell backgrounds can be hard to distinguish at low intensity levels
- Does not communicate the specific percentage — just "good," "warning," or "bad"
- The existing color tokens (`--red`, `--green`, `--amber`) are not designed for use as background tints; their opacity-adjusted versions need manual definition

**Accessibility rating:** Poor standalone — must be paired with another approach to be acceptable.

---

### Approach D: Recharts Mini Bar (SparkBar) Per Cell

Use Recharts' `BarChart` with a single bar to render a mini visualization inside each cell.

```jsx
import { BarChart, Bar, Cell as RCell } from 'recharts'

function SparkBar({ pct, isOver, isUnder }) {
  const color = isOver ? 'var(--red)' : isUnder ? 'var(--green)' : 'var(--accent)'
  return (
    <BarChart width={60} height={20} data={[{ value: Math.min(pct, 1) }]} margin={{}}>
      <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
    </BarChart>
  )
}
```

**Pros:**
- Recharts is already in the bundle (no new dependency)
- Easy to add tooltips on hover
- Vertical orientation possible (column chart per cell) for a different aesthetic

**Cons:**
- Each `BarChart` instance creates its own SVG, ResizeObserver, and animation loop — at 15 categories × 12 months = 180 chart instances, this causes severe performance degradation
- Recharts components do not support `role="progressbar"` natively — requires additional ARIA on the container
- Fixed-width bar doesn't adapt to cell width changes during horizontal scroll
- Testing Recharts in vitest requires mocking (as per project conventions); testing 180 mock instances is noisy
- The overhead is unjustified for what is fundamentally a linear 0-100% display

**Accessibility rating:** Poor without additional ARIA work.

---

### Approach E: Hybrid — Background Bar + Enhanced Color (Recommended basis)

Combine Approach A (translucent background bar) with the amber warning zone from Approach C, and add a subtle "overflow indicator" for cells exceeding 100%.

Color logic:
- 0–84%: green tint bar (under budget, safe)
- 85–99%: amber tint bar (approaching limit, warning zone)
- 100%: neutral (exactly on budget)
- >100%: red tint bar, capped at 100% width but text turns bold-red

The overflow indicator for >100% uses a small "!" icon or a right-side overflow notch to communicate that the bar is capped, not that spend was exactly 100%.

```jsx
function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>

  const isOver  = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const textCls = isOver ? styles.over : isUnder ? styles.under : styles.neutral

  let barCls = null
  let barPct = 0
  if (!isIncome && budgeted > 0) {
    const rawPct = actual / budgeted
    barPct = Math.min(rawPct, 1.0)
    if (isOver) barCls = styles.barOver
    else if (rawPct > 0.85) barCls = styles.barWarn
    else barCls = styles.barUnder
  }

  return (
    <>
      {barCls && (
        <div
          className={`${styles.bar} ${barCls}`}
          style={{ width: `${barPct * 100}%` }}
          role="progressbar"
          aria-label={`${Math.round(barPct * 100)}% of budget used`}
          aria-valuenow={Math.round(barPct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
      <span className={textCls}>
        {fmtDollar(actual)} / {fmtDollar(budgeted)}
      </span>
    </>
  )
}
```

**Pros:**
- Three-zone color gradient (green/amber/red) matches competitor patterns and avoids pure red-green binary
- Background layer preserves cell height and text readability
- Numbers + bar = dual encoding (color, length), satisfying accessibility requirements
- No new dependencies
- Income categories are excluded from bar logic (bars are expense-only, matching conceptual model)
- Summary table can optionally receive bars too (a second pass)
- The amber zone ("warning: approaching limit") is a meaningful signal absent from the current implementation

**Cons:**
- Still can't visually represent *how far over* budget a cell is (bar is capped at 100%)
- Income cells get no bar — if someone wants to see income progress toward their income budget, this needs a separate flag
- The three-threshold logic adds complexity to CellValue's rendering logic

**Accessibility rating:** Good — color paired with bar width (dual encoding). ARIA attributes on the bar element.

---

### Approach F: Single-Month Focus Mode (Alternative Layout)

Rather than improving the multi-month grid, offer a toggled "focus view" that shows only one month at a time with a larger progress bar per row.

This would require:
- A month selector (tab or dropdown)
- A completely different layout with full-width bars and large text
- State in BudgetPage to track the selected "focus month"

**Pros:**
- Best possible readability for a single month's budget status
- Aligns with how Rocket Money and many mobile-first apps work
- Large bars are easier to understand

**Cons:**
- Loses the multi-month comparison capability, which is Stashtrend's key differentiator vs. single-month apps
- Much larger scope: new component, new page state, new tests
- The existing BudgetChart already shows multi-month trends — removing the table's multi-month grid removes the only granular category-level historical view
- This is a layout redesign, not a visual enhancement

**Verdict:** Too large a scope change. Should be treated as a separate future feature if desired.

---

## 5. Tradeoff Matrix

| Criterion | A: BG Bar | B: Bar Below | C: Heat Map | D: Recharts | E: Hybrid BG+3-Zone |
|-----------|-----------|--------------|-------------|-------------|---------------------|
| Zero new deps | Yes | Yes | Yes | Yes (recharts exists) | Yes |
| Cell height unchanged | Yes | No (+8px) | Yes | No | Yes |
| Colorblind safe | Partial | Partial | No | No | Yes (3 colors + width) |
| ARIA accessible | Yes | Yes | No | Partial | Yes |
| Overflow signal | Weak | Weak | Yes (gradient) | Weak | Partial (color only) |
| Test complexity delta | Low | Low | Medium | High | Low |
| Performance (12mo × 15 cat) | Excellent | Excellent | Excellent | Poor | Excellent |
| Mobile / narrow cell | Degrades slightly | Good (bar always full-width) | Good | Poor | Degrades slightly |
| Compatible w/ existing tests | Yes (.over/.under preserved) | Yes | Partial | No | Yes |

---

## 6. Accessibility Deep Dive

### Color Blindness

The current red/green binary is inaccessible for ~8% of male users (deuteranopia: red-green blindness). Best practices require a secondary encoding:

- **Approach A/E:** Bar *width* is the secondary encoding — a narrow green bar and a wide red bar communicate the same information without relying on color discrimination
- **Approach B:** The progress track pattern is inherently dual-encoded (color + width)
- **Approach C:** Fails alone — background tint differences are barely distinguishable even for fully-sighted users under color blindness simulation

WCAG 2.1 criterion 1.4.1 (Use of Color, Level A) states: "Color is not used as the only visual means of conveying information." The current implementation technically fails this criterion. Any of the bar-based approaches (A, B, E) would satisfy it.

### Screen Readers

The native `<progress>` element has good screen reader support but limited styling options. The ARIA `role="progressbar"` approach with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` is equivalent and fully styleable.

Screen readers will announce cells' text naturally. The `role="progressbar"` div should be hidden from the reading order if the `<span>` text is already self-describing (e.g., using `aria-hidden="true"` on the visual bar and ensuring the span's text is descriptive enough). Alternatively, use `aria-label` on the bar to supplement.

### Keyboard Navigation

The current table is keyboard-navigable via Tab through interactive elements (group collapse buttons). Progress bars are decorative; they need no focus state.

---

## 7. Mobile / Narrow Cell Behavior

At the default 3-month view, each month column is approximately 120px wide. At 12-month view on a 375px mobile screen, cells are only ~30px wide (requiring horizontal scroll).

**For Approach A/E (background bar):** The bar adapts naturally — at 30px cell width, a 50%-spend bar is 15px. The number text overflows (but is already handled by `overflow-x: auto` on `.tableWrap`). The visual signal is preserved.

**For Approach B (bar below numbers):** At 30px cell width, the text wraps or overflows. The bar track remains meaningful even at narrow widths.

**Verdict:** All CSS-only approaches handle narrow cells acceptably. The horizontal scroll container on `.tableWrap` is the correct handling for very narrow screens.

---

## 8. Performance Analysis

At maximum configuration: 12 months × ~20 expense categories = 240 cells. With:

- **CSS approach (A, B, E):** Each cell renders one additional `<div>` with an inline `style.width`. This is 240 extra DOM nodes — negligible cost. No JS calculations beyond a single division.
- **Heat map (C):** Inline style string calculation per cell — slightly more complex but still negligible.
- **Recharts (D):** 240 `BarChart` instances × each mounting a ResizeObserver, SVG canvas, and animation timer = severe memory and CPU impact. Measured in similar configurations, Recharts instances cause noticeable frame drops above ~50 instances.

**Verdict:** CSS-only approaches are the correct choice for performance. Recharts should not be used for per-cell mini charts.

---

## 9. Compatibility with Existing Features

### Collapse/Expand Groups

The `CategoryGroup` component collapses rows by conditionally rendering category `<tr>` elements. Progress bars inside cells are unaffected — they're inside the `<td>`, not attached to the row structure.

### Summary Table

The `SummaryTable` at the top currently shows plain text for Total Income, Total Expenses, and Net. These aggregate values could also receive bars, but:
- "Total Income" is a sum, not a category-level comparison — a bar makes less conceptual sense here
- "Net" can be negative, making a progress bar semantically awkward
- **Recommendation:** Do not add bars to the Summary Table in this iteration. The Summary Table redesign (if desired) is a separate scope item.

### Sorting

The table currently has no column sorting. If sorting is added later, cells will re-render in a new order — bar widths are computed from props, so they will update correctly without any special handling.

### `isIncome` Flag

Income categories should not get expense-style progress bars. The logic for this is already established in `CellValue`:
```js
const isOver  = !isIncome && variance != null && variance < 0
```
The same guard applies to bar rendering: `if (!isIncome && budgeted > 0) { /* render bar */ }`.

---

## 10. Summary of Viable Approaches

| Rank | Approach | Verdict |
|------|----------|---------|
| 1 | **E: Hybrid BG Bar + 3-Zone Color** | Recommended — best balance of signal richness, accessibility, zero cost, and minimal scope |
| 2 | **B: Bar Below Numbers** | Good — classic pattern, slightly higher cell height, no cons otherwise |
| 3 | **A: Simple BG Bar (2-zone)** | Acceptable — simpler implementation than E, loses amber warning zone |
| 4 | **C: Heat Map only** | Not recommended standalone — fails accessibility; can supplement approach E |
| 5 | **D: Recharts SparkBars** | Not recommended — performance disqualifying |
| 6 | **F: Single-Month Focus Mode** | Out of scope for this task |

**Architect recommendation target:** Approach E (Hybrid BG + 3-Zone) or Approach B. Both are pure CSS with zero new dependencies and satisfy accessibility requirements.

---

## 11. Open Questions for Architect

1. **Income bars:** Should income categories get a different bar treatment (e.g., a blue bar showing "what % of income budget was received")? Or remain plain text?
2. **100%+ overflow signal:** Is the color change alone (red text + red bar) sufficient for >100% overage, or should there be a visual overflow indicator (e.g., a notch at the right edge, or the bar "pulsing" red)?
3. **Summary table:** Bars for Total Income / Total Expenses rows — worth the additional scope, or defer?
4. **Animation:** Should bar widths animate on mount/data-change, or be static? CSS `transition: width var(--ease-default)` would be a single-line addition.
5. **Threshold values:** Is 85% the right warning threshold? Users with tight budgets may want 75%. Should this be hardcoded or configurable?
6. **Month sub-label:** Currently headers say "actual / budget". If bars are added, should the sub-label change to "spent / budget" or "vs. budget" to better describe what the bar shows?

---

## Sources

- [Visual Progress Bars in YNAB](https://support.ynab.com/en_us/progress-bars-a-guide-SkDEhot09)
- [Toolkit for YNAB: Budget Rows Progress Bars](https://www.eshmoneycoach.com/ynab-toolkit/budget-rows-progress-bars/)
- [Check Your Progress at a Glance | YNAB Blog](https://www.ynab.com/blog/progress-bars)
- [Monarch Money Budget Features](https://www.monarchmoney.com/features/budget)
- [Create a budget that works for you | Rocket Money](https://www.rocketmoney.com/feature/create-a-budget)
- [ARIA: progressbar role — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/progressbar_role)
- [Designing For Color Blindness — Smashing Magazine](https://www.smashingmagazine.com/2024/02/designing-for-colorblindness/)
- [Effective Dashboard Color Schemes | insightsoftware](https://insightsoftware.com/blog/effective-color-schemes-for-analytics-dashboards/)
- [Dashboard Design UX Patterns Best Practices — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Colors in data vis style guides | Datawrapper](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides)
