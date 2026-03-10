# Phase 6: Benchmark Comparison — Design Specification

**Date:** 2026-03-09
**Author:** Frontend Designer Agent
**Status:** Complete — ready for engineering plan
**Depends on:** phase6-requirements.md, phase6-research.md, phase6-architecture.md, phase3-design-spec.md

---

## Visual Overview

Phase 6 is a purely additive enhancement to the Phase 3 Investments page. No new page, no new nav items, no structural changes to the existing layout. Every new element slots into space that already exists or expands a section that already renders.

Two distinct feature areas:

**Benchmark overlay (performance chart):** A toggle in the chart header switches the performance chart from dollar mode into percentage-return mode and draws a dashed amber S&P 500 line alongside the portfolio line. The toggle is a checkbox control matching the existing "Show contributions" pattern. A small freshness indicator appears near the toggle. When benchmark is active, a new summary card appears in the stats row showing the return delta.

**Allocation targets (holdings drill-down):** A "Set Target" button in the allocation section of the drill-down opens a centered modal (using a native `<dialog>`) where the user enters integer targets per asset class. When targets are saved, the existing allocation legend table gains two new columns — Target % and Delta — with drift color coding. The donut chart itself is unchanged.

All design decisions use existing tokens from `index.css`. No new CSS custom properties are required. Chart SVG attributes use constants from `chartUtils.jsx` per established convention. The existing Dark Cobalt theme, card surface pattern, and typography scale are preserved without modification.

---

## Page Layout

### How Phase 6 Elements Integrate

Phase 6 touches two distinct views within the existing Investments page. Neither view requires a new page or route.

**Dashboard view (at `/investments`) — changes:**

```
[Page Header]
[Summary Stats Cards — 3 or 4 cards depending on benchmark state]   ← 4th card appears when benchmark toggle is ON
[Performance Chart card — with benchmark toggle + freshness label]   ← toggle and label added to chart header
[Investment Accounts Table]
```

When benchmark toggle is off, the stats row is exactly as Phase 3 defined it (3 cards). When benchmark is on, a 4th card — "vs S&P 500" delta — appears at the right of the row. The grid widens gracefully from 3 to 4 columns at desktop width. On mobile the 4th card stacks below the first three.

**Holdings drill-down view (at `/investments/:accountId`) — changes:**

```
[Account Detail Header]
[Two-column grid: Holdings Table (left) | Allocation section (right)]
  Right column:
    [AllocationChart — donut, unchanged]
    [Allocation legend table — gains Target% and Delta columns when targets set]
    [Set Target button — always visible when account has holdings]
    [Clear Targets link — visible only when targets exist]
```

The allocation card grows vertically when targets are set (more columns in the legend table). No horizontal layout changes — the `3fr 2fr` desktop grid from Phase 3 is preserved.

---

## Component Designs

### 1. BenchmarkToggle (embedded in InvestmentPerformanceChart)

**File:** Not a separate file. Rendered inline within `InvestmentPerformanceChart.jsx` and styled via `InvestmentPerformanceChart.module.css`.

**Placement:** In the chart header row, to the right of the `RangeSelector`. On desktop (600px+), the header row is a flex row; the toggle group sits at the far right. On mobile (< 600px), the header stacks vertically and the toggle row appears below the range selector on its own line.

**Desktop header layout:**

```
[Performance]          [3M] [6M] [1Y] [3Y] [5Y] [All]     [□ Compare to S&P 500]
                                                             S&P 500 data as of Mar 6
```

**Mobile header layout:**

```
[Performance]
[3M] [6M] [1Y] [3Y] [5Y] [All]
[□ Compare to S&P 500]  S&P 500 data as of Mar 6
```

**Toggle control — checkbox style:**

The existing "Show contributions" checkbox pattern from Phase 3 is the direct model. Use an identical visual approach:

- Rendered as a `<label>` wrapping a visually hidden `<input type="checkbox">` + a custom visual checkbox box
- Custom box: `width: 14px; height: 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-inset)` when unchecked
- Checked state: `background: var(--accent); border-color: var(--accent)` with a white checkmark (✓) at 10px centered
- Label text: "Compare to S&P 500" — 13px / weight 400 / `--text-secondary`
- Label hover: `--text-primary` — transition `var(--ease-quick)`
- Full `<label>` is the click target — 36px min-height for touch accessibility
- `cursor: pointer`

**Disabled state (account has < 1 month of history, AC-2.3):**

- Custom box and label text both at `opacity: 0.4`
- `cursor: not-allowed` on the label
- Native `<input disabled>` attribute
- Tooltip on hover of the disabled label: "Need at least 1 month of history to compare"
  - Tooltip uses the existing informational tooltip pattern from Phase 3 (positioned above, `--bg-raised` background, `--shadow-md`, `--radius-md`, 12px / `--text-secondary`, max-width 220px)
- When no benchmark data exists at all (first run before any sync): same disabled treatment with tooltip "Benchmark data unavailable. Run a sync to fetch S&P 500 data."
- When benchmark data is available but for the portfolio-level view with no accounts having sufficient history: disabled with tooltip "No accounts have sufficient history for comparison."

**States summary:**

| State | Visual |
|---|---|
| Unchecked, enabled | Box empty, label `--text-secondary` |
| Checked, enabled | Box filled cobalt, checkmark, label `--text-primary` |
| Disabled (< 1 month history) | Opacity 0.4, not-allowed cursor, tooltip on hover |
| Disabled (no benchmark data) | Opacity 0.4, not-allowed cursor, tooltip on hover |
| Loading benchmark data (after check) | Checked + small inline spinner (12px) to right of label while fetching |

---

### 2. BenchmarkFreshnessLabel (embedded in InvestmentPerformanceChart)

**File:** Inline within `InvestmentPerformanceChart.jsx`, styled via `InvestmentPerformanceChart.module.css`.

**Placement:** On a separate line directly below the benchmark toggle checkbox. Visible only when benchmark data exists (whether toggle is on or off — the label is informational about data availability, not about whether the toggle is active).

**Default appearance (data fresh — within 3 calendar days):**

- Text: "S&P 500 data as of [date]" where date is formatted as `fmtDatetime(last_updated)` shortened to date only (e.g., "Mar 6, 2026")
- Font: 11px / weight 400 / `--text-muted`
- No icon

**Stale appearance (data older than 3 calendar days, AC-4.2):**

- Text: "• S&P 500 data as of [date]" — amber dot prepended as a text character (•), no separate icon element
- Color: `var(--color-warning)` for the entire line (dot + text)
- Font: 11px / weight 500 (slightly bolder to reinforce the warning)
- No tooltip — the color change is sufficient for the "nice-to-have" staleness indicator

**Responsive:** Hidden entirely on mobile (< 480px) to preserve header vertical space. The freshness information is secondary to the toggle itself.

**States summary:**

| State | Visual |
|---|---|
| No benchmark data (never synced) | Hidden |
| Data fresh (≤ 3 days) | Gray text, 11px, no dot |
| Data stale (> 3 days) | Amber text with • prefix, 11px weight 500 |

---

### 3. BenchmarkOverlay (modifications to InvestmentPerformanceChart)

**File:** `frontend/src/components/InvestmentPerformanceChart.jsx` — modifications only, not a new file.

These are the chart rendering changes when `showBenchmark` is true.

**Chart mode switch:**

When benchmark is activated, the chart switches from dollar mode to percentage-return mode. This is a different axis mode from the existing "% Change" Y-axis toggle in Phase 3. The benchmark toggle overrides the Y-axis mode toggle — when benchmark is on, the chart is forced into % mode and the Y-axis toggle buttons are disabled (opacity 0.5, cursor not-allowed, title="Disabled while comparing to benchmark").

**Percentage normalization rule:**

For each visible series (portfolio lines and benchmark line): `return_pct[i] = ((value[i] / value[0]) - 1) * 100` where `value[0]` is the first data point within the current range. Both series start at exactly 0% at the left edge of the visible range.

Benchmark data is aligned to the portfolio date range using forward-fill: for each portfolio date point, use the most recent benchmark price on or before that date. Weekends and holidays in the benchmark data (when markets are closed) are filled with the previous trading day's value.

**Benchmark line properties (Recharts `<Line>` element):**

- `dataKey="benchmark_return_pct"`
- `name="S&P 500 (SPY)"`
- `stroke={COLOR_AMBER}` — `#F5A623`
- `strokeWidth={1.5}` — thinner than the 2.5px portfolio "All Combined" line to keep the user's portfolio visually dominant
- `strokeDasharray="6 3"` — dashed pattern; ensures color is not the only visual differentiator (accessibility requirement)
- `dot={false}`
- `activeDot={{ r: 4, fill: COLOR_AMBER, stroke: '#1C2333', strokeWidth: 2 }}`
- `connectNulls`
- `type="monotone"`

**Contribution bars when benchmark is active:**

When `showBenchmark` is true, contribution bars are hidden (unmounted). The "Show contributions" toggle is disabled (opacity 0.4, cursor not-allowed, title="Contributions hidden in comparison mode"). When benchmark is turned off, contribution bars return to their previous visibility state.

**Y-axis when benchmark is active:**

- Formatter: `(n) => \`${n > 0 ? '+' : ''}${n.toFixed(1)}%\``
- Width: 52px mobile / 64px desktop (slightly wider than $ mode due to longer tick labels like "+12.3%")
- Label: No Y-axis label text — the "Return %" context is communicated by the chart header subtitle (see below)

**Chart header subtitle when benchmark is active:**

Below the main "Performance" title, a secondary line appears:
- Text: "% return from period start"
- Font: 12px / weight 400 / `--text-muted`
- Shown only when benchmark is active

**Chart legend when benchmark is active:**

The Recharts `<Legend>` (if Phase 3 uses one) or the custom legend should include a "S&P 500 (SPY)" entry with:
- Color swatch: 20px × 3px dashed line (SVG or CSS-painted) in `COLOR_AMBER`, matching the actual line style
- Text: "S&P 500 (SPY)" — 12px / `--text-secondary`
- Placed after the portfolio series entries

**Error state — benchmark data unavailable:**

When `showBenchmark` is true but the API returns no data (API failure, no sync yet):
- Chart renders portfolio-only in % mode (with no benchmark line)
- An inline message appears below the chart area, above the bottom of the card:
  - Text: "Benchmark data unavailable."
  - Font: 12px / weight 400 / `--text-muted` / italic
  - Aligned: center
  - No border, no icon — subtle, non-blocking

**Loading state — benchmark data fetching:**

After the toggle is checked, benchmark data is fetched. During the fetch:
- Chart continues to show portfolio data at full opacity
- The benchmark line position is shimmer-hinted: a thin shimmer strip at 0% (center of the chart) — optional if implementation is complex; the inline spinner next to the toggle label is sufficient feedback by itself

**Tooltip when benchmark is active:**

The custom tooltip replaces the existing dollar-mode tooltip format. Both values appear for every hovered date:

```
┌─────────────────────────────────┐
│ Mar 9, 2026                     │
│ ────────────────────────────    │
│ ● Portfolio        +12.3%       │
│ - - S&P 500 (SPY)  +8.7%       │
│ ────────────────────────────    │
│ Your edge:         +3.6%        │
└─────────────────────────────────┘
```

Tooltip structure:
- Background: `TOOLTIP_STYLE.background` (`#1C2333`)
- Border: `1px solid #1E2D4A`
- Border-radius: 8px
- Padding: `10px 14px`
- Color: `#F0F6FF`
- Font: 13px

Date line: 13px / weight 500 / `#F0F6FF`
Divider: `border-top: 1px solid #1E2D4A`, margin 4px 0

Portfolio row:
- Color dot: 8×8px filled circle, `border-radius: 2px`, color = the active portfolio line color (`COLOR_ACCENT` for All Combined)
- Text: "Portfolio" — `#8BA8CC` — right-padded to align values
- Value: `fmtPct(portfolioReturn)` — color `COLOR_POSITIVE` if positive, `COLOR_NEGATIVE` if negative

S&P 500 row:
- Line indicator: `─ ─` dashed indicator in `COLOR_AMBER` (rendered as `"── ──"` text in amber, or a 20×2px SVG dash pattern)
- Text: "S&P 500 (SPY)" — `#8BA8CC`
- Value: `fmtPct(benchmarkReturn)` — always `#F0F6FF` (no positive/negative coloring for the benchmark — neutral)

Second divider

"Your edge" row (only when both values are available):
- Text: "Your edge:" — `#8BA8CC`
- Value: delta = portfolioReturn − benchmarkReturn; color `COLOR_POSITIVE` if ≥ 0, `COLOR_NEGATIVE` if < 0; prefix "+" if positive
- Font: 13px / weight 500

**States summary:**

| State | Chart behavior |
|---|---|
| Benchmark off | Dollar mode, all Phase 3 behavior unchanged |
| Benchmark on, data loading | % mode, portfolio series only, spinner on toggle |
| Benchmark on, data available | % mode, two lines, dual tooltip |
| Benchmark on, data unavailable | % mode, portfolio only, inline "Benchmark data unavailable" message |
| Benchmark on, insufficient history | Toggle disabled before activation — this state is prevented, not shown mid-chart |

---

### 4. BenchmarkDeltaCard (4th stats card)

**File:** Inline within `InvestmentsPage.jsx` stats card section, styled via `InvestmentsPage.module.css`. Follows the exact same card structure as the three Phase 3 summary cards.

**Visibility:** Rendered only when `showBenchmark === true`. When benchmark is toggled off, this card is removed from the DOM (not just hidden) so the 3-card grid resumes its Phase 3 layout.

**Grid behavior when 4th card appears:**

The stats card grid in `InvestmentsPage.module.css` uses `repeat(3, 1fr)` at 480px+. When the 4th card is present, the grid expands:

- Mobile (< 480px): All 4 cards stack in a single column
- 480px–767px: `repeat(2, 1fr)` — the 4th card wraps to a second row pairing with the 3rd card. This is better than cramming 4 into one row at this width.
- 768px+: `repeat(4, 1fr)` — all four cards in one row

Implementation: the stats card container applies a CSS class that varies with card count. The page component adds a modifier class (`.hasBenchmarkCard`) when benchmark is active. The CSS module targets `.hasBenchmarkCard .row` to override the grid.

**Card layout:**

- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px 20px` mobile / `20px 24px` at 768px+
- Hover border: `var(--accent-border-hover)` — transition `var(--ease-smooth)`

**Card content:**

```
VS S&P 500                          ← label
+3.6%                               ← delta value, large
1Y                                  ← range label, sub-text
```

- Label: "VS S&P 500" — 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted` / `margin-bottom: 8px`
- Delta value: `fmtPct(portfolioReturn - benchmarkReturn)` — 24px mobile / 28px at 768px+ / weight 400
  - Color: `var(--color-positive)` if delta ≥ 0, `var(--color-negative)` if delta < 0
  - Prefix: "+" for positive, "−" for negative (already handled by `fmtPct`)
  - Arrow: `▲` prepended in positive color if positive; `▼` in negative color if negative — same `Arrow` component pattern as `StatsCards.jsx`
- Range sublabel: current range label (e.g., "1Y") — 12px / `--text-muted` / `margin-top: 4px`

**Loading state (while benchmark data is fetching):**

- Same shimmer treatment as Phase 3 skeleton cards: height 100px, `linear-gradient` shimmer, `animation: shimmer 1.5s infinite`
- Rendered only when `showBenchmark === true` and `benchmarkLoading === true`

**Unavailable state (benchmark data fetch failed):**

- Card label: "VS S&P 500"
- Delta value: "—" in `--text-muted`
- Range sublabel: hidden

**States summary:**

| State | Display |
|---|---|
| Benchmark off | Card not rendered |
| Benchmark on, loading | Shimmer card in 4th position |
| Benchmark on, data available | Delta value with arrow and color |
| Benchmark on, data unavailable | Card with "—" value |

---

### 5. AllocationTargetsModal

**File:** `frontend/src/components/AllocationTargetsModal.jsx` + `AllocationTargetsModal.module.css`

**Purpose:** Centered modal dialog for entering integer percentage targets per asset class. This is the first centered modal in the codebase (as opposed to `GroupAssignmentSheet`, which is a mobile bottom sheet). Both use the native `<dialog>` element per the established codebase pattern.

**Trigger:** The "Set Target" button in the allocation section of the holdings drill-down. See placement in AllocationSection below.

**Modal structure:**

```
┌────────────────────────────────────────────────────────────┐  backdrop
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Set Allocation Targets                          [×]  │  ← header
│  ├──────────────────────────────────────────────────────┤  │
│  │  Enter target percentages for each asset class.      │  ← intro line
│  │                                                      │  │
│  │  Stock           [ 60  ]%                            │  ← input rows
│  │  ETF             [  0  ]%                            │
│  │  Mutual Fund     [  0  ]%                            │
│  │  Bond            [ 30  ]%                            │
│  │  Cash            [ 10  ]%                            │
│  │  Other           [  0  ]%                            │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  ← sum row
│  │  │  Total: 100%      ✓                          │   │
│  │  └──────────────────────────────────────────────┘   │  │
│  │  [Targets must sum to 100% (currently 90%)]          │  ← error (shown when sum ≠ 100)
│  │                                                      │  │
│  │  [Cancel]                          [Save Targets]    │  ← action buttons
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Backdrop:**

The native `<dialog>` element's `::backdrop` pseudo-element:
- `background: rgba(0, 0, 0, 0.6)`
- `backdrop-filter: blur(2px)` — subtle frosted effect, consistent with the `--bg-frosted` token's intent
- Click on backdrop calls `onClose()`

**Dialog element:**

- Background: `--bg-card` (`#1C2333`)
- Border: `1px solid var(--border)`
- Border radius: `--radius-xl` (16px) — one step larger than the card `--radius-lg` to visually distinguish the modal surface
- Box shadow: `--shadow-lg`
- Width: `min(480px, calc(100vw - 32px))` — never wider than viewport minus 16px on each side
- Max-height: `calc(100vh - 64px)` — scroll if content overflows on very small screens
- Overflow-y: `auto` (for overflow case)
- Positioned: centered using browser's native `<dialog>` centering (no custom positioning)
- Padding: `24px` desktop / `20px` mobile

**Header row:**

- Flex row, `align-items: center`, `justify-content: space-between`
- `margin-bottom: var(--sp-4)` (16px)
- `border-bottom: 1px solid var(--border-sub)`
- `padding-bottom: var(--sp-4)` (16px)

- Title: "Set Allocation Targets" — 16px / weight 500 / `--text-primary`
- Close button [×]:
  - `background: transparent`
  - `border: none`
  - `color: var(--text-muted)`
  - Font: 18px
  - `width: 32px; height: 32px`
  - `border-radius: var(--radius-md)`
  - Hover: `background: var(--bg-hover)`, `color: var(--text-primary)` — transition `var(--ease-quick)`
  - Focus: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
  - `aria-label="Close dialog"`

**Intro line:**

- Text: "Enter a target percentage for each asset class. Targets must sum to 100%."
- Font: 13px / weight 400 / `--text-secondary`
- `margin-bottom: var(--sp-5)` (20px)

**Input rows:**

Six rows — one per canonical asset class: Stock, ETF, Mutual Fund, Bond, Cash, Other.

Row layout: flex row, `align-items: center`, `justify-content: space-between`, `margin-bottom: var(--sp-3)` (12px)

- Label: asset class name — 14px / weight 400 / `--text-primary` — left-aligned, min-width 110px
- Input group: `<input type="number">` + "%" suffix — right-aligned

**Number input:**

- `type="number"` — not text (allows browser step controls and numeric keyboard on mobile)
- `min="0" max="100" step="1"`
- Width: 72px
- `text-align: right`
- Background: `--bg-inset`
- Border: `1px solid var(--border)`
- Border radius: `--radius-md` (8px)
- Padding: `6px 8px`
- Font: 14px / weight 400 / `--text-primary`
- Focus: `border-color: var(--border-focus)`, `box-shadow: 0 0 0 1px var(--accent)`, `outline: none`
- `-moz-appearance: textfield` to remove Firefox spin arrows (optional cosmetic)
- `inputmode="numeric"` for mobile keyboards

"%" suffix:
- `margin-left: var(--sp-2)` (8px)
- Font: 14px / weight 400 / `--text-secondary`

**Inline color indicators per asset class:**

A small color dot (8×8px, `border-radius: 2px`) appears between the label and the input, matching the slice colors from the Phase 3 `AllocationChart` donut palette:

| Asset class | Dot color hex | Source |
|---|---|---|
| Stock | `#4D9FFF` | `COLOR_ACCENT` |
| ETF | `#2ECC8A` | `COLOR_POSITIVE` |
| Mutual Fund | `#9B7FE8` | `COLOR_MUTUAL_FUND` |
| Bond | `#F5A623` | `COLOR_AMBER` |
| Cash | `#5EDDA8` | `COLOR_CASH` |
| Other | `#4A6080` | `AXIS_TICK.fill` |

These dots visually connect the form entries to the donut chart the user sees behind the modal — a subtle orientation cue.

**Sum indicator row:**

Positioned between the last input row and the error message. Always visible.

- Background: `--bg-inset`
- Border: `1px solid var(--border-sub)`
- Border radius: `--radius-md` (8px)
- Padding: `8px 12px`
- Font: 13px / weight 500
- Flex row, `justify-content: space-between`, `align-items: center`

Left: "Total:" label — `--text-secondary`
Right: `{sum}%` value — color and icon change by state:

| Sum state | Color | Icon |
|---|---|---|
| Exactly 100 | `var(--color-positive)` | ✓ |
| < 100 | `var(--color-warning)` | none |
| > 100 | `var(--color-negative)` | none |

**Validation error message:**

Shown immediately below the sum row when sum ≠ 100. Hidden when sum = 100.

- Text: "Targets must sum to 100% (currently {sum}%)."
- Font: 12px / weight 400 / `var(--color-negative)`
- `margin-top: var(--sp-2)` (8px)
- No icon — color is sufficient combined with the sum row indicator
- `role="alert"` on the error `<p>` so screen readers announce it when it appears

**Action buttons row:**

- Flex row, `justify-content: flex-end`, gap `--sp-3` (12px)
- `margin-top: var(--sp-6)` (24px)
- `border-top: 1px solid var(--border-sub)`
- `padding-top: var(--sp-5)` (20px)

**Cancel button:**

- Background: `transparent`
- Border: `1px solid var(--border)`
- Border radius: `--radius-md` (8px)
- Padding: `8px 20px`
- Font: 14px / weight 400 / `--text-secondary`
- Hover: `background: var(--bg-hover)`, `color: var(--text-primary)`, `border-color: var(--border)` — transition `var(--ease-quick)`
- Focus: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
- Min-height: 38px

**Save Targets button:**

- Background: `var(--accent)` when enabled; `var(--bg-raised)` when disabled
- Color: `var(--bg-deep)` when enabled (`#0E1423` — dark text on cobalt); `var(--text-muted)` when disabled
- Border: `none` when enabled; `1px solid var(--border)` when disabled
- Border radius: `--radius-md` (8px)
- Padding: `8px 20px`
- Font: 14px / weight 500
- Hover (enabled): `background: var(--accent-hover)` — transition `var(--ease-quick)`
- Disabled: `opacity: 1` (do not use opacity — use explicit disabled color tokens instead); `cursor: not-allowed`; `pointer-events: none` on the parent to prevent native tooltip on disabled button
- Focus (enabled): `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
- Disabled condition: `sum !== 100`
- Min-height: 38px

**Saving state (POST in-flight):**

The Save button shows a small spinner (12px) to its left while the API request is pending:
- Button text changes to "Saving…"
- Button is disabled during save
- Background stays `var(--accent)` (not disabled color — it's an in-progress state, not a blocked state)
- Spinner: `border: 2px solid rgba(255,255,255,0.3); border-top-color: white; width: 12px; height: 12px; border-radius: 50%; animation: spin 0.6s linear infinite` — same pattern as the range selector loading spinner in Phase 3

**Save error state:**

If the POST fails:
- A red error banner appears between the sum row and the action buttons
- Background: `--bg-error-subtle`
- Border: `1px solid var(--border-error)`
- Border radius: `--radius-md`
- Padding: `8px 12px`
- Text: "Failed to save targets. Please try again." — 12px / `--color-negative`
- The dialog stays open (user can retry)
- `role="alert"` on the error element

**Open/close behavior:**

- Uses native `<dialog>` element with `showModal()` per the `GroupAssignmentSheet` pattern
- Escape key closes the dialog (native `cancel` event intercepted, calls `onClose`)
- Backdrop click closes (detected by checking `e.target === dialogRef.current`)
- `document.body.style.overflow = 'hidden'` while open
- Focus is moved to the dialog heading on open
- Focus returns to the "Set Target" button trigger on close
- `aria-labelledby` pointing to the "Set Allocation Targets" heading `id`

**Responsive:**

- Desktop (600px+): Modal at full `min(480px, calc(100vw - 32px))` width, centered
- Mobile (< 600px): Modal fills `calc(100vw - 32px)` — effectively full-width with 16px margins
- No horizontal scrolling inside the modal at any viewport width
- The six input rows shrink gracefully: label truncates with ellipsis if needed (overflow-hidden)

**States summary:**

| State | Behavior |
|---|---|
| Closed | `<dialog>` not open — no backdrop, no content visible |
| Open, all zeros | Sum row shows "0%", all inputs empty/0, Save disabled |
| Open, partial entry | Sum row shows running total in amber/red, Save disabled |
| Open, sum = 100 | Sum row shows "100% ✓" in green, Save button enabled |
| Saving | Save shows spinner + "Saving…", disabled |
| Save error | Error banner below sum row, dialog stays open |
| Save success | Dialog closes, parent re-fetches targets |

---

### 6. AllocationSection modifications (in holdings drill-down)

**File:** Inline section within `InvestmentsPage.jsx` (the allocation right-column). The `AllocationChart.jsx` component itself is not modified.

**"Set Target" button placement:**

The button appears below the existing `AllocationChart` donut and its legend, at the bottom of the right-column card. When no targets are set, the button is the only Phase 6 addition visible in this section.

- Text: "Set Target"
- Style: ghost/secondary button — matches the Cancel button spec above
  - Background: `transparent`
  - Border: `1px solid var(--border)`
  - Border radius: `--radius-md` (8px)
  - Padding: `6px 16px`
  - Font: 13px / weight 400 / `--text-secondary`
  - Hover: `background: var(--bg-hover)`, `color: var(--text-primary)` — transition `var(--ease-quick)`
  - Focus: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
  - Min-height: 36px
- Alignment: left-aligned within the card (not full-width — a full-width button here would look oversized relative to a ghost action)
- `margin-top: var(--sp-4)` (16px) above the button
- Hidden entirely when `holdings` array is empty (AC-3.7 / requirement: "If no holdings data, allocation target section hidden entirely")

**"Clear Targets" link:**

Shown only when targets exist. Placed inline to the right of the "Set Target" button on the same row:

- Text: "Clear Targets"
- Style: text link — no border, no background
  - Font: 13px / weight 400 / `var(--color-negative)` — red text signals a destructive action
  - Hover: `text-decoration: underline` — transition `var(--ease-quick)`
  - Focus: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
  - `cursor: pointer`
- Click behavior: shows a confirmation step before clearing. The confirmation is minimal — an inline text swap on the link itself, not a separate modal:
  1. First click: link text changes to "Confirm clear?" with two options appearing inline: "[Yes]  [No]" — tiny 12px links, no buttons
  2. "Yes": calls DELETE endpoint, clears targets, hides comparison view
  3. "No": reverts back to "Clear Targets" link text
  4. Auto-revert after 4 seconds with no interaction (set a timeout)

**Allocation legend table — with targets set:**

When `allocationTargets` is non-empty, the allocation legend (the `<ul>` list below the donut in Phase 3) is replaced with a proper `<table>` element for the three-column layout.

The donut chart itself is NOT modified — it continues to show actual allocation only.

The legend table appears below the donut at full card width:

**Table header row:**

| Column | Alignment | Width |
|---|---|---|
| Asset Class | Left | ~40% |
| Actual % | Right | ~20% |
| Target % | Right | ~20% |
| Delta | Right | ~20% |

Header cell styles:
- 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted`
- `border-bottom: 1px solid var(--border)`
- Padding: `6px 8px`

**Table body rows:**

One row per asset class that has either actual holdings OR a non-zero target. Asset classes with both 0% actual and 0% target are hidden (they would be noise).

Row styles:
- Padding: `8px 8px`
- Border bottom: `1px solid var(--border-sub)` (except last row)
- Hover: `background: var(--bg-hover)` — transition `var(--ease-quick)`
- No click action

**Asset Class cell:**

- Color dot: 8×8px, `border-radius: 2px`, using the slice color palette from Phase 3 (same colors as the donut)
- Text: asset class name — 13px / weight 400 / `--text-primary`
- Flex row, `align-items: center`, gap `--sp-2` (8px)

**Actual % cell:**

- `fmtPct(actual_pct)` without sign prefix (these are always 0–100%)
- Font: 13px / weight 400 / `--text-primary`

**Target % cell:**

- `fmtPct(target_pct)` — same format
- Font: 13px / weight 400 / `--text-secondary`

**Delta cell:**

- `delta = actual_pct - target_pct`
- Format: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`  (uses "pp" — percentage points, not %, to avoid confusion)
- Color by drift severity:
  - `|delta| <= 2`: `var(--color-positive)` — within band
  - `2 < |delta| <= 5`: `var(--color-warning)` — moderate drift
  - `|delta| > 5`: `var(--color-negative)` — significant drift
- Arrow: ▲ if positive, ▼ if negative, in the same color — `Arrow` component pattern
- When delta is exactly 0: shows "—" in `--text-muted` (not "+0.0pp")
- Font: 13px / weight 500 (slightly bolder — this is the actionable column)

**Drift legend footnote:**

Below the table, a single line explaining the color bands:

- Text: "Green ≤ 2pp from target  ·  Amber ≤ 5pp  ·  Red > 5pp"
- Font: 11px / weight 400 / `--text-muted`
- `margin-top: var(--sp-2)` (8px)

**Table accessibility:**

- `<table aria-label="Asset allocation actual vs target">`
- `<caption>` visually hidden: "Showing actual allocation compared to targets. Delta column shows drift from target."
- `scope="col"` on all `<th>` elements
- `scope="row"` on the asset class `<th>` in each body row

**States summary for allocation section:**

| State | Rendered content |
|---|---|
| No holdings | "Set Target" button hidden; allocation section hidden |
| Holdings, no targets | AllocationChart donut + original Phase 3 legend; "Set Target" button below |
| Holdings, targets set | AllocationChart donut + comparison table (Actual/Target/Delta); "Set Target" + "Clear Targets" below |
| Targets clearing (confirm step) | Same as "targets set" view + inline "Confirm clear?" interaction on the link |
| Targets loading (GET in-flight) | Allocation section shows skeleton; "Set Target" button shimmer |

---

## Design Token Usage

All decisions map to existing tokens. No new CSS custom properties are required in `index.css`.

### Full Token Map for Phase 6 Elements

| Token | Used In |
|---|---|
| `--bg-card` | Modal background, BenchmarkDeltaCard background |
| `--bg-inset` | Number inputs in modal, sum indicator row background |
| `--bg-hover` | Row hover in allocation table, button hover states |
| `--bg-raised` | Save button disabled state background |
| `--bg-error-subtle` | Save error banner background in modal |
| `--bg-deep` | Save button enabled text color (dark text on cobalt) |
| `--border` | Modal border, input borders, button borders, card borders |
| `--border-sub` | Allocation table row dividers, modal header/footer dividers, sum row border |
| `--border-focus` | Focus outline on all interactive elements |
| `--border-error` | Save error banner border in modal |
| `--text-primary` | Asset class names, input values, modal title |
| `--text-secondary` | Toggle label, intro text, target % column values, cancel button text |
| `--text-muted` | Column headers, freshness label (fresh state), delta legend footnote, card sublabel |
| `--accent` | Checkbox checked state fill, Save button background, focus indicators, "Your edge" coloring (deferred to existing positive/negative tokens) |
| `--accent-hover` | Save button hover background |
| `--accent-tint` | Checkbox custom box focus ring glow (optional) |
| `--accent-border-hover` | BenchmarkDeltaCard hover border |
| `--color-positive` / `--green` | Delta card positive value, within-band drift (≤ 2pp), sum = 100 indicator |
| `--color-negative` / `--red` | Delta card negative value, over-band drift (> 5pp), "Clear Targets" link, validation error |
| `--color-warning` / `--amber` | Stale freshness label color, moderate drift (2–5pp), sum under/over indicator |
| `--radius-sm` | Checkbox custom box |
| `--radius-md` | Number inputs, sum row, buttons, close button, error banner |
| `--radius-xl` | Modal dialog border-radius |
| `--radius-pill` | (Not used in Phase 6 — no new pill-shaped elements) |
| `--shadow-lg` | Modal dialog drop shadow |
| `--shadow-md` | Informational tooltip on disabled toggle |
| `--ease-quick` | Row hover, button hover, close button hover, toggle label hover |
| `--ease-smooth` | BenchmarkDeltaCard border hover |
| `--sp-2` | Color dot gaps, error margin, drift legend margin |
| `--sp-3` | Input row gap, cancel+save gap, "Set Target" button margin variants |
| `--sp-4` | Modal header/footer padding, allocation button top margin |
| `--sp-5` | Modal action row top margin, AllocationChart bottom spacing |
| `--sp-6` | Modal action buttons margin-top |

### Chart Constants (hardcoded hex — SVG/Recharts attributes)

No new constants need to be added to `chartUtils.jsx`. Phase 6 uses:

| Constant | Value | Phase 6 usage |
|---|---|---|
| `COLOR_AMBER` | `#F5A623` | Benchmark line stroke |
| `COLOR_POSITIVE` | `#2ECC8A` | Positive delta in card and tooltip |
| `COLOR_NEGATIVE` | `#FF5A7A` | Negative delta in card and tooltip |
| `COLOR_ACCENT` | `#4D9FFF` | Portfolio line (existing — unchanged) |
| `TOOLTIP_STYLE` | see chartUtils.jsx | Benchmark tooltip wrapper |
| `AXIS_TICK` | `{ fill: '#4A6080', fontSize: 11 }` | % return Y-axis ticks |
| `GRID_STROKE` | `#1E2D4A` | Grid lines (unchanged) |

Color dot references for the allocation modal and table use the same hex values as Phase 3's `AllocationChart` slice palette (defined inline in `AllocationChart.jsx` and `AllocationTargetsModal.jsx` — not from `chartUtils.jsx`, which is the established pattern for colors with fewer than 3 consumers).

---

## States — Complete Reference

### InvestmentPerformanceChart: Benchmark Toggle States

| Toggle state | Data state | Chart renders |
|---|---|---|
| Off | Any | Phase 3 behavior unchanged |
| Off → On (click) | Data not yet fetched | Spinner on toggle label; fetch begins |
| On | Fetching | Portfolio in % mode; benchmark line missing; spinner on toggle |
| On | Data available, fresh | Portfolio + benchmark lines in % mode; full dual tooltip |
| On | Data available, stale | Same as above; freshness label turns amber |
| On | Data unavailable (API fail) | Portfolio in % mode only; inline "Benchmark data unavailable" below chart |
| On | Account < 1 month history | Toggle disabled (prevented before activation) |

### AllocationTargetsModal: Form States

| State | Sum indicator | Save button | Error message |
|---|---|---|---|
| Just opened (all 0s or pre-populated from saved) | Shows current sum | Enabled only if sum = 100 | Hidden |
| Typing — sum < 100 | Amber: "87%" | Disabled | Hidden |
| Typing — sum > 100 | Red: "115%" | Disabled | Hidden |
| Typing — sum = 100 | Green: "100% ✓" | Enabled | Hidden |
| Saving (POST in-flight) | Unchanged | Disabled, "Saving…" + spinner | Hidden |
| Save failed | Unchanged | Re-enabled, "Save Targets" | Error banner visible |
| Save success | — | — | Modal closes |

### Allocation Section: Target Comparison States

| State | What renders |
|---|---|
| No holdings data | Entire allocation section hidden; "Set Target" hidden |
| Holdings, no targets | Phase 3 AllocationChart + Phase 3 legend only; "Set Target" button |
| Holdings, targets exist | Phase 3 AllocationChart (unchanged) + comparison table; "Set Target" + "Clear Targets" |
| Clear confirmation pending | Same as above + inline "Confirm clear? [Yes] [No]" |
| Clearing (DELETE in-flight) | Allocation section shimmer |
| Cleared | Returns to "no targets" state |

---

## Responsive Behavior

### Mobile (< 480px)

- Stats cards: single column. When 4th benchmark card is present, it stacks below the other three.
- BenchmarkFreshnessLabel: hidden (too much vertical space in the chart header).
- Chart header: toggle on its own line below range selector.
- AllocationTargetsModal: fills `calc(100vw - 32px)`. All six input rows visible without scrolling.
- Allocation table (when targets set): all four columns visible. Column widths compressed — "Asset Class" is shortest it can be without truncating common names (e.g., "Mutual Fund"). If extremely narrow, "Asset Class" header truncates with ellipsis. The table does NOT horizontal-scroll (only 4 columns with short numeric values).

### Tablet (480px–767px)

- Stats cards: `repeat(2, 1fr)` when 4 cards present — delta card wraps to second row.
- BenchmarkFreshnessLabel: visible.
- Chart header: toggle in-row with range selector (enough space at 480px+).
- Modal: same as desktop but may be full viewport-width minus margins.

### Desktop (768px+)

- Stats cards: `repeat(4, 1fr)` when benchmark active; `repeat(3, 1fr)` otherwise.
- BenchmarkFreshnessLabel: visible, inline below toggle.
- Chart header: toggle at far right of flex row.
- Allocation drill-down: `3fr 2fr` grid (Phase 3 — unchanged). Comparison table in right column.

### Breakpoint-Specific Rules Summary

| Feature | < 480px | 480–767px | 768px+ |
|---|---|---|---|
| Stats card grid with 4 cards | 1-col | 2-col | 4-col |
| BenchmarkFreshnessLabel | Hidden | Visible | Visible |
| Chart header layout | Stacked | Row (flex) | Row (flex) |
| Modal width | `calc(100vw - 32px)` | `min(480px, calc(100vw - 32px))` | `480px` |
| Allocation comparison table | All 4 cols (tight) | All 4 cols | All 4 cols |

---

## Accessibility

### Benchmark Toggle

- `<input type="checkbox">` is the semantic element — screen readers announce "Compare to S&P 500, checkbox, unchecked/checked"
- `aria-disabled="true"` on the `<input>` when disabled; the parent `<label>` gets `aria-describedby` pointing to the tooltip's `id` so the reason is read
- The informational tooltip for the disabled state must have `role="tooltip"` and `id` referenced by the trigger's `aria-describedby`
- The BenchmarkFreshnessLabel: `aria-live="polite"` on the container so screen readers announce staleness changes when data refreshes

### BenchmarkDeltaCard

- Arrow icon (▲/▼) is `aria-hidden="true"` — the value text (`+3.6%` or `-2.1%`) is the readable content
- Card as a whole: no `role` needed (it is not interactive)
- Color is never the sole indicator — the `+`/`-` prefix carries the same information

### AllocationTargetsModal

- `<dialog aria-labelledby="modal-title-id">` — `GroupAssignmentSheet` pattern
- `<h2 id="modal-title-id" tabIndex={-1}>Set Allocation Targets</h2>` — receives focus on open for screen reader announcement
- Each number input: `<label for="input-stock">Stock</label><input id="input-stock" ...>` — explicit `for`/`id` pairing (not wrapping label, since the color dot sits between label text and input)
- `aria-describedby` on each input pointing to a shared helper text element: "Enter a whole number from 0 to 100"
- Sum indicator: `aria-live="polite"` so screen readers announce the running total as the user types
- Validation error: `role="alert"` so it is announced immediately when it appears
- Save error banner: `role="alert"` — same pattern
- Focus trap: native `<dialog>` modal handles this. Tab cycles within the dialog.
- Escape key: intercepted via `cancel` event, calls `onClose()`, returns focus to trigger button

### Allocation Comparison Table

- `<table aria-label="Asset allocation actual vs target">`
- `<caption>` with `.sr-only` class: "Delta column shows drift from target allocation in percentage points."
- `<th scope="col">` for all headers
- `<th scope="row">` for the asset class name cell in each body row
- Delta column: the `▲`/`▼` arrow is `aria-hidden="true"`; the text value ("+3.6pp") carries full meaning
- Color is supplemented by sign and arrow — never the sole indicator of drift direction

### Focus States

All Phase 6 interactive elements follow the existing conventions:

- Form inputs: `border-color: var(--border-focus)`, `box-shadow: 0 0 0 1px var(--accent)`, `outline: none`
- Buttons: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`
- Checkbox (custom): the visually hidden native `<input>` retains default focus — the custom box shows `box-shadow: 0 0 0 2px var(--accent)` when `:focus-visible` is on the input (achieved via `input:focus-visible + .customCheckbox` selector in CSS module)
- Modal close button: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`

### Color Contrast

Phase 6 introduces no new color combinations beyond what Phase 3 established. The amber benchmark line (`#F5A623`) on the dark chart background (`#1C2333`) is used for non-text SVG — contrast requirements for non-text graphics are 3:1. The amber/dark combination exceeds this. The dashed line style provides a redundant visual differentiator beyond color alone.

---

## Interaction Patterns

### Benchmark Toggle Flow

1. User checks "Compare to S&P 500" checkbox.
2. Immediate visual feedback: checkbox fills cobalt, spinner appears next to label.
3. `fetchBenchmarkPrices(start, end)` called with the current range's date bounds.
4. Chart header subtitle "% return from period start" fades in (`opacity 0 → 1`, `var(--ease-smooth)`).
5. Y-axis transitions: tick labels change from dollar format to percent format. Contribution bars fade out.
6. When benchmark data arrives: amber dashed line draws in from left to right using Recharts' built-in animation (`isAnimationActive={true}`, default 400ms ease). Spinner disappears.
7. The "vs S&P 500" delta card fades in to the right of the stats row (CSS `opacity 0 → 1` + `transform: translateY(4px) → translateY(0)` — matching the Phase 3 card entrance pattern if one exists, or a simple fade if not).

When the toggle is unchecked:
1. Benchmark line fades out (Recharts animation or opacity transition).
2. Delta card fades out.
3. Chart returns to dollar mode — contribution bars reappear if they were on before.
4. Chart subtitle hides.
5. Y-axis formatter reverts.

### Range Change When Benchmark is Active

1. User clicks a range button.
2. New performance data is fetched (Phase 3 behavior — chart fades to 0.4 opacity, spinner appears).
3. Simultaneously, new benchmark data is fetched for the new date range.
4. Both series update when both fetches complete. No partial update — wait for both before re-rendering.
5. Delta card value updates to reflect new range.

### Allocation Target Form — Keyboard Flow

Tab order within the modal:
1. Modal heading (receives focus on open — `tabIndex={-1}`, not in tab sequence)
2. Stock input
3. ETF input
4. Mutual Fund input
5. Bond input
6. Cash input
7. Other input
8. Cancel button
9. Save Targets button
10. Close [×] button

Enter key in any input: moves focus to the next input (Tab key equivalent). In the last input (Other), Enter submits the form if sum = 100, otherwise moves focus to the Cancel button.

### Clear Targets Confirmation

The confirmation is a lightweight inline pattern — no modal-on-modal. It replaces the button text in-place:

1. User clicks "Clear Targets".
2. Link text changes instantly to "Confirm clear?" and two inline options appear: "[Yes]  [No]" (13px links in `--color-negative` and `--text-muted` respectively).
3. A 4-second timeout auto-reverts to the original "Clear Targets" text if no action.
4. "Yes": fires DELETE; during deletion the entire allocation section shows a shimmer skeleton.
5. "No": immediately reverts.

The `[Yes]` and `[No]` elements are `<button type="button">` elements styled as text (no border, no background) — not anchor tags — so they are natively focusable and keyboard-activatable.

---

## New Files

| File | Purpose |
|---|---|
| `frontend/src/components/AllocationTargetsModal.jsx` | Modal form component |
| `frontend/src/components/AllocationTargetsModal.module.css` | Modal styles |

## Modified Files

| File | Changes |
|---|---|
| `frontend/src/pages/InvestmentsPage.jsx` | Benchmark state, benchmark fetch, delta card, "Set Target" button, modal open/close, allocation table columns, "Clear Targets" flow |
| `frontend/src/pages/InvestmentsPage.module.css` | 4-card grid modifier `.hasBenchmarkCard`, allocation table styles, "Set Target" / "Clear Targets" button row |
| `frontend/src/components/InvestmentPerformanceChart.jsx` | Benchmark toggle checkbox, freshness label, benchmark `<Line>`, % normalization, dual tooltip, Y-axis mode override, contribution bar hiding |
| `frontend/src/components/InvestmentPerformanceChart.module.css` | Toggle checkbox styles, freshness label styles, disabled toggle styles, chart subtitle |
