# Phase 6 Design Spec — Benchmark Comparison UI

**Date:** 2026-03-09
**Agent:** Frontend Designer Agent
**Inputs:** phase6-requirements.md, phase6-research.md, phase6-architecture.md
**Status:** Complete

---

## Design System Tokens (existing)

All UI elements use the project's established dark theme:

| Token | Value | Usage |
|-------|-------|-------|
| `COLOR_ACCENT` | `#4D9FFF` | Primary accent, portfolio line |
| `COLOR_POSITIVE` | `#2ECC8A` | Positive returns |
| `COLOR_NEGATIVE` | `#FF5A7A` | Negative returns |
| `COLOR_AMBER` | `#F5A623` | Warnings, milestones — **reused for S&P 500 benchmark line** |
| `GRID_STROKE` | `#1E2D4A` | Chart grid lines |
| `AXIS_TICK` | `{fill: '#4A6080', fontSize: 11}` | Axis labels |
| `TOOLTIP_STYLE` | `{background: '#1C2333', border: '1px solid #1E2D4A', ...}` | Tooltip container |
| Card background | `#131B2E` | Stats cards, panels |
| Text primary | `#F0F6FF` | Headings, primary text |
| Text secondary | `#8BA8CC` | Labels, captions |

---

## Component 1: Benchmark Toggle on Performance Chart

### Location
Inside the Phase 3 performance chart header, next to the existing `RangeSelector`.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Account Performance                                     │
│  [Account Selector ▾]   ☑ Compare to S&P 500   [3M|6M|1Y|2Y|All] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ████████████████████████████▓▓▓▓▓▓                     │
│  █  Portfolio (blue area fill)  █  ╌╌╌╌╌╌╌╌╌╌╌╌╌      │
│  █                              █   S&P 500 (amber     │
│  █                              █   dashed line)        │
│  ████████████████████████████▓▓▓▓▓▓                     │
│                                                          │
│  ─── Portfolio    ╌╌╌ S&P 500                           │
└─────────────────────────────────────────────────────────┘
```

### Toggle Component
- **Type:** Checkbox with label
- **Label text:** "Compare to S&P 500"
- **Default state:** Unchecked (benchmark hidden)
- **Position:** Between account selector and range selector in the controls row
- **Styling:** Same as existing "Show assets / liabilities" toggle in `NetWorthChart.jsx`

```css
.benchmarkToggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8BA8CC;
  font-size: 13px;
  cursor: pointer;
}

.benchmarkToggle input[type="checkbox"] {
  accent-color: #F5A623;
}
```

### Chart Overlay
- **S&P 500 line:**
  - Recharts `<Line>` component (not Area — no fill)
  - `stroke: #F5A623` (COLOR_AMBER)
  - `strokeWidth: 1.5`
  - `strokeDasharray: "6 3"` (dashed — visually distinct from solid portfolio line)
  - `dot: false`
  - `dataKey: "benchmark_return_pct"`
- **Y-axis:** Shared Y-axis showing percentage returns (both series use same scale)
- **X-axis:** Shared date axis (backend aligns dates)

### States
| State | Behavior |
|-------|----------|
| Toggle off (default) | Portfolio chart only, no benchmark data fetched |
| Toggle on | Fetch `/api/benchmark/comparison`, render S&P 500 line overlay |
| Loading benchmark data | Show subtle loading indicator on toggle (spinner or pulse) |
| Benchmark data unavailable | Toggle is disabled with tooltip: "Benchmark data unavailable — sync to update" |
| No investment accounts | Toggle is hidden entirely |

---

## Component 2: Benchmark Summary Card

### Location
Below the performance chart, alongside existing stats cards (if Phase 3 has them) or as a standalone section.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Benchmark Comparison (1Y)                               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Your Return  │  │   S&P 500    │  │  vs Benchmark │  │
│  │   +12.5%     │  │   +10.2%     │  │    +2.3%     │  │
│  │   ▲ green    │  │   ▲ amber    │  │   ▲ green    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Card Design
- **Container:** Same card style as `StatsCards.jsx` — `background: #131B2E`, `border-radius: 12px`, `padding: 16px 20px`
- **Three sub-cards inline:**
  1. **Your Return** — portfolio return for the selected period, colored green/red based on sign
  2. **S&P 500** — benchmark return for same period, colored with `COLOR_AMBER`
  3. **vs Benchmark** — outperformance/underperformance delta, green if positive (beating market), red if negative
- **Period label:** Shows the active time range (e.g., "1Y") in the section header
- **Visibility:** Only shown when the benchmark toggle is on

### Responsive (Mobile)
- Cards stack vertically on mobile (single column)
- Font sizes reduce by ~15% on mobile per existing patterns
- Chart height: 220px on mobile (matches existing chart components)

---

## Component 3: Extended Tooltip

### Design
When benchmark overlay is active, the tooltip includes the S&P 500 data point:

```
┌─────────────────────┐
│  Mar '25             │  ← date in secondary color (#8BA8CC)
│  Portfolio:  +8.3%   │  ← blue (#4D9FFF)
│  S&P 500:   +6.1%   │  ← amber (#F5A623)
│  Delta:     +2.2%   │  ← green (#2ECC8A) or red (#FF5A7A)
└─────────────────────┘
```

### Styling
- Follows existing `TOOLTIP_STYLE` from `chartUtils.jsx`
- Delta row only shown when benchmark overlay is active
- Delta color: `COLOR_POSITIVE` if portfolio > benchmark, `COLOR_NEGATIVE` if portfolio < benchmark

---

## Component 4: Target Allocation Panel (Stretch Goal)

### Location
Below the benchmark summary card, in its own collapsible section.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Asset Allocation                              [Edit ✎] │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │   Target             │  │   Actual             │      │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │      │
│  │  │  80% Stocks   │  │  │  │  75% Stocks   │  │      │
│  │  │  15% Bonds    │  │  │  │  18% Bonds    │  │      │
│  │  │   5% Cash     │  │  │  │   7% Cash     │  │      │
│  │  └───────────────┘  │  │  └───────────────┘  │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                          │
│  ⚠ Stocks: 5% below target (rebalance recommended)      │
└─────────────────────────────────────────────────────────┘
```

### Visualization Options
**Recommended: Horizontal stacked bars (side-by-side)**
- Two horizontal bars: Target and Actual
- Color-coded segments per asset class
- Width proportional to percentage
- Simpler than donut charts, easier to read differences at a glance

**Alternative: Donut charts**
- Two side-by-side donut charts
- More visually appealing but harder to compare exact percentages

### Drift Warning
- When any asset class deviates from target by > 5% (configurable), show an amber warning
- Warning text: "{Asset Class}: {X}% {above/below} target"
- Uses `COLOR_AMBER` for the warning text

### Edit Mode
- Clicking "Edit" opens an inline form (not a modal)
- Text inputs for each asset class percentage
- Validation: must sum to 100%
- Save button calls `POST /api/allocation/target`
- Cancel button reverts to display mode

### States
| State | Behavior |
|-------|----------|
| No target set | Show prompt: "Set a target allocation to track your portfolio balance" with a "Set Target" button |
| Target set, within tolerance | Green indicators, "On target" message |
| Target set, drift detected | Amber warnings per drifted asset class |
| No holdings data | "Sync your accounts to see actual allocation" |

---

## Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| Desktop (>768px) | Chart 340px height; summary cards inline (3-column); allocation panel side-by-side |
| Mobile (<=768px) | Chart 220px height; summary cards stack vertically; allocation bars stack; toggle text may wrap to second line |

### Mobile-Specific
- Benchmark toggle: may abbreviate to "vs S&P" on very narrow screens
- Summary cards: full width, stacked
- Allocation panel: bars stacked vertically (Target above Actual)
- Touch targets: all interactive elements at least 44px tap target

---

## Interaction Flow

```
1. User navigates to Investments page (Phase 3)
2. Performance chart loads with portfolio data only
3. User checks "Compare to S&P 500" toggle
4. Frontend calls GET /api/benchmark/comparison?account_id=all&range=1Y
5. Chart adds dashed amber S&P 500 line overlay
6. Benchmark summary card appears below chart
7. User changes time range → both series update
8. User selects specific account → comparison recalculates for that account
9. User unchecks toggle → benchmark line and summary card hide
```

---

## Accessibility

- Toggle checkbox has proper `<label>` association
- Chart has `aria-label` describing the comparison
- Summary cards use semantic HTML (`<dl>` for term/definition pairs)
- Tooltip data is also accessible via the summary card (chart tooltips are not screen-reader friendly)
- Color is not the only differentiator: S&P 500 line is dashed (pattern difference), and labeled in legend
- Drift warnings use text, not just color
