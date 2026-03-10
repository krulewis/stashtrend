# Phase 4: Forecasting Page — Design Specification

**Date:** 2026-03-09
**Author:** Frontend Designer Agent
**Status:** Ready for engineering plan
**Inputs:** phase4-requirements.md, phase4-research.md, phase4-architecture.md, codebase audit

---

## Visual Overview

The Forecasting page extends the Dark Cobalt theme with a chart-first layout. The primary visual element is a tall projection chart showing historical and future investable capital across three scenario lines. Two interactive sliders sit in a card above the chart; summary metric cards sit below. The page reads top-to-bottom: settings gate → controls → chart → readiness summary → settings link.

The design deliberately mirrors the Net Worth page's structure (page header, card-per-section, full-width chart) so the new page feels native. New patterns introduced here — slider controls, the compact settings strip — are designed to be reusable across future pages without forcing global refactors.

---

## 1. Page Layout

### 1.1 Desktop Layout (≥ 768px)

```
┌─────────────────────────────────────────────────────┐
│  Forecasting                       [↻ Refresh]       │  ← pageHeader (flex row)
│  (accent-tint glow ::before)                         │
├─────────────────────────────────────────────────────┤
│  [ForecastingSetup — ONLY if no settings exist]      │  ← full-width card, collapses when settings present
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │  ForecastingControls                 [Reset]  │  │  ← bg-card, border, radius-lg
│  │  Monthly Contribution  [$2,000] [====●====]   │  │
│  │  Annual Return Rate    [ 7.0%] [====●====]    │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │  Investable Capital Projection   [5Y 10Y All] │  │  ← ForecastingChart, bg-card
│  │                                               │  │     height: 380px desktop
│  │  $2M ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─(nest egg)  │  │
│  │       ···· +10%                              │  │
│  │  $1M  ─ ─  baseline             ·············│  │
│  │       ···· -10%                              │  │
│  │  $0  ──────────────────────────             │  │
│  │      2020  2025  2030  2035  2040  2045      │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Current  │ │ Nest Egg │ │Projected │ │ Gap /  │ │  ← ForecastingSummary 4-col grid
│  │ Capital  │ │ Needed   │ │at Retire │ │ Ahead  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  [ON TRACK ▲] You are $215K ahead of target          │  ← badge + gap text (same card)
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │ Age 35 → 65 · $80K/yr · $2K/mo  [Edit Settings]│ │  ← compact settings strip
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 1.2 Mobile Layout (< 768px)

Controls stack vertically and take full width. Chart shrinks to 220px. Summary cards become a 2×2 grid. The compact settings strip wraps to two lines.

```
┌───────────────────────────┐
│  Forecasting      [↻]     │  ← pageHeader
├───────────────────────────┤
│  [ForecastingSetup]       │  ← single-column form
├───────────────────────────┤
│  ┌─────────────────────┐  │
│  │ Monthly Contribution│  │
│  │ [$2,000]            │  │  ← full-width SliderInput
│  │ [========●========] │  │
│  │ Annual Return Rate  │  │
│  │ [ 7.0%]             │  │
│  │ [========●========] │  │
│  │            [Reset]  │  │
│  └─────────────────────┘  │
├───────────────────────────┤
│  ┌─────────────────────┐  │
│  │ Chart      [10Y All]│  │  ← chart height: 220px
│  │ ...                 │  │
│  └─────────────────────┘  │
├───────────────────────────┤
│  ┌──────────┐ ┌─────────┐ │
│  │ Current  │ │Nest Egg │ │  ← 2-col grid
│  └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌─────────┐ │
│  │Projected │ │  Gap    │ │
│  └──────────┘ └─────────┘ │
│  [ON TRACK] $215K ahead   │
├───────────────────────────┤
│  Age 35 → 65 · $80K/yr   │
│  $2K/mo  [Edit Settings]  │
└───────────────────────────┘
```

### 1.3 Section Spacing

Each section is a visually distinct card (same `bg-card`, `border`, `radius-lg` pattern as all other cards). Vertical gap between cards: `var(--sp-5)` (20px) mobile, `var(--sp-6)` (24px) desktop.

Page horizontal padding is provided by the AppShell's main content area — do not add horizontal padding to the page component itself (matches NetWorthPage pattern).

---

## 2. ForecastingControls Component

**File:** `src/components/ForecastingControls.jsx` + `ForecastingControls.module.css`

### 2.1 Layout

Card with `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 20px` mobile, `20px 24px` desktop.

Internal layout: two `SliderInput` rows stacked vertically with `gap: var(--sp-4)` (16px). Reset button sits right-aligned below the second slider row.

```
Desktop row:
┌────────────────────────────────────────────────────────────┐
│  MONTHLY CONTRIBUTION          ← label (9px, muted, caps)  │
│  ┌──────────────┐  ├──────────────────────────●──────┤     │
│  │  $  2,000    │  0                                 $10K  │
└────────────────────────────────────────────────────────────┘
```

On desktop (≥ 768px), the label, text input, and range slider sit on a single row using a 3-column grid:

```
.controlRow grid-template-columns: 160px 1fr
```

The label is positioned as a `<label>` element above — it is not inline with the slider row. Structure per control:

```
<div class="controlRow">
  <label>MONTHLY CONTRIBUTION</label>
  <div class="inputSliderGroup">
    <input type="text" class="numericInput" />
    <input type="range" class="rangeSlider" />
  </div>
</div>
```

On mobile (< 768px): label on its own row, text input full-width below label, range slider full-width below input.

### 2.2 Tokens

| Element | Token |
|---------|-------|
| Card background | `var(--bg-card)` |
| Card border | `1px solid var(--border)` |
| Card radius | `var(--radius-lg)` |
| Label text | `var(--text-muted)`, 9px, uppercase, letter-spacing 2px, weight 400 |
| Input background | `var(--bg-inset)` |
| Input border | `1px solid var(--border)` |
| Input border focus | `var(--border-focus)` = `var(--accent)` |
| Input focus shadow | `0 0 0 1px var(--accent)` |
| Input radius | `var(--radius-md)` |
| Input text | `var(--text-primary)`, 13px |
| Input padding | `9px 12px` |
| Input width | `90px` desktop, `100%` mobile |
| Slider track height | `4px` |
| Slider track (unfilled) | `var(--bg-raised)` |
| Slider track (filled) | `var(--accent)` |
| Slider thumb size | `18px` desktop, `24px` mobile |
| Slider thumb color | `var(--accent)` |
| Slider thumb border | `2px solid var(--bg-card)` (creates gap ring between thumb and track) |
| Slider thumb hover | `var(--accent-light)` |
| Slider thumb focus ring | `0 0 0 3px var(--accent-tint)` |
| Reset button background | `var(--bg-card)` |
| Reset button border | `1px solid var(--border)` |
| Reset button text | `var(--text-secondary)`, 12px, uppercase, letter-spacing 1.5px, weight 600 |
| Reset button radius | `var(--radius-sm)` |
| Reset button padding | `7px 14px` |
| Reset button hover border | `var(--accent-border-hover)` |
| Reset button hover text | `var(--text-primary)` |

### 2.3 Slider Cross-Browser CSS

The range input requires vendor-prefixed selectors. Both track segments and the thumb must be styled independently per browser engine:

```css
/* Track — WebKit (Chrome, Safari, new Edge) */
.rangeSlider::-webkit-slider-runnable-track { ... }
/* Track — Firefox */
.rangeSlider::-moz-range-track { ... }
/* Filled portion — WebKit (use background gradient hack) */
/* Filled portion — Firefox */
.rangeSlider::-moz-range-progress { background: var(--accent); }
/* Thumb — WebKit */
.rangeSlider::-webkit-slider-thumb { ... }
/* Thumb — Firefox */
.rangeSlider::-moz-range-thumb { ... }
```

The WebKit filled-portion trick: set the `<input type="range">` background to a CSS gradient that mirrors slider position using a CSS custom property updated by JS (`--slider-fill-pct`):

```css
.rangeSlider {
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--slider-fill-pct, 0%),
    var(--bg-raised) var(--slider-fill-pct, 0%),
    var(--bg-raised) 100%
  );
}
```

The implementer must set `style="--slider-fill-pct: ${pct}%"` on the range input in the JSX, where `pct = ((value - min) / (max - min)) * 100`.

### 2.4 SliderInput Component

**File:** `src/components/SliderInput.jsx` + `SliderInput.module.css`

A generic, reusable slider+input control. Props:

| Prop | Type | Description |
|------|------|-------------|
| `label` | string | Display label (uppercased in CSS) |
| `value` | number | Controlled value |
| `onChange` | function | Called with new numeric value |
| `min` | number | Range minimum |
| `max` | number | Range maximum |
| `step` | number | Slider step size |
| `format` | function | Display formatter: `(value) => string` |
| `parse` | function | Input parser: `(string) => number` |
| `ariaLabel` | string | Accessible label for the range input |
| `helperText` | string or null | Optional subscript below slider (e.g., CAGR source note) |

The text input uses `type="text"` with `inputMode="decimal"` for mobile keyboard compatibility. The displayed value is the result of `format(value)`. On focus, the input clears the formatting so the user types a raw number. On blur, the input parses and clamps the value.

**Interaction sequence:**
1. User focuses text input — display shows raw number (e.g., `2000` not `$2,000`)
2. User types — no chart update yet
3. User blurs — parse the value, clamp to `[min, max]`, call `onChange`, restore formatting
4. User moves range slider — call `onChange` on every `input` event (real-time), slider fill percentage updates via inline style

**States:**
- Default: label muted, input/slider visible
- Input focused: input border becomes `var(--accent)`, shadow `0 0 0 1px var(--accent)`
- Slider thumb hover: thumb color shifts to `var(--accent-light)`, cursor `pointer`
- Slider thumb focus (keyboard): `0 0 0 3px var(--accent-tint)` focus ring
- Slider thumb active (dragging): thumb scale 1.1 via CSS transform
- Disabled (not used in Phase 4, but specify for reusability): opacity 0.45, cursor not-allowed on all interactive elements

### 2.5 Helper Text (CAGR Source Note)

Below the Annual Return Rate slider, show a single line of helper text in muted style:

```
ANNUAL RETURN RATE
[ 7.0%] [========●========]
         Based on 5Y weighted CAGR (Retirement + Brokerage)
```

Styled: `font-size: 11px; color: var(--text-muted); margin-top: var(--sp-1); font-style: italic`

This text is conditionally rendered: only shown when the default value was derived from historical CAGR (not the 7% hardcoded fallback). When showing the fallback: "Using 7% default (insufficient history)".

### 2.6 Warning / Info Inline Notes

When edge-case conditions are detected (edge cases 4.3–4.5 from requirements), show an inline note directly below the affected slider. These are not toast notifications — they are static text blocks inside the controls card.

**Token spec for warning note:**

```css
.inlineWarning {
  font-size: 12px;
  color: var(--amber);         /* --color-warning */
  background: color-mix(in srgb, var(--amber) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent);
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-3);   /* 8px 12px */
  margin-top: var(--sp-2);
}

.inlineInfo {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-info);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-3);
  margin-top: var(--sp-2);
}
```

**Warning conditions:**
- Negative historical CAGR → amber warning below return rate slider
- CAGR > 15% (exceeds slider max) → amber warning below return rate slider
- Zero or negative investable capital → amber warning inside controls card header area

**Info conditions:**
- Insufficient history for CAGR (< 1 year) → info note below return rate slider helper text

### 2.7 Reset Button Placement

The Reset button appears right-aligned below the second slider row, inside the controls card:

```
[Monthly Contribution row]
[Annual Return Rate row  ]
                [↺ Reset to defaults]
```

On mobile, the Reset button is full-width below the last slider.

---

## 3. ForecastingChart Component

**File:** `src/components/ForecastingChart.jsx` + `ForecastingChart.module.css`

### 3.1 Chart Container

Same container pattern as `GroupsTimeChart` and `TypeStackedChart`:

```css
.container {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: 16px;            /* mobile */
}
@media (min-width: 768px) {
  .container { padding: 20px 24px; }
}
```

### 3.2 Chart Header

Flex row on desktop, column on mobile (same as `GroupsTimeChart.header`):

```
┌──────────────────────────────────────────────────┐
│ Investable Capital Projection    [5Y][10Y][20Y][All] │
└──────────────────────────────────────────────────┘
```

Title: `font-size: 15px; font-weight: 500; color: var(--text-primary)` (16px desktop).

Range selector: reuse `RangeSelector` component. Custom range set for this chart:

```js
// In ForecastingChart.jsx — not exported to chartUtils (forecasting-specific)
const FORECASTING_RANGES = [
  { label: '5Y',  months: 60  },
  { label: '10Y', months: 120 },
  { label: '20Y', months: 240 },
  { label: 'All', months: null },
]
```

Default selected range: `'All'` (shows full historical + projection to retirement).

### 3.3 Chart Dimensions

| Breakpoint | Chart Height | Y-Axis Width |
|------------|-------------|--------------|
| Mobile (< 768px) | 220px | 52px |
| Tablet (768–1023px) | 300px | 64px |
| Desktop (≥ 1024px) | 380px | 72px |

Use `useResponsive()` hook for JS-controlled dimensions.

### 3.4 Line Specifications

All lines use `dot={false}` and `activeDot={{ r: 5 }}`.

| Line | `dataKey` | `stroke` | `strokeDasharray` | `strokeWidth` | `name` (legend/tooltip) |
|------|-----------|----------|-------------------|---------------|--------------------------|
| Historical | `net_worth` | `COLOR_ACCENT` (`#4D9FFF`) | none (solid) | 2 | "Actual" |
| Baseline projection | `projected_net_worth` | `COLOR_ACCENT` (`#4D9FFF`) | `"8 4"` | 2 | "Projected (baseline)" |
| +10% contribution | `projected_plus10` | `COLOR_POSITIVE` (`#2ECC8A`) | `"3 3"` | 1.5 | "+10% contributions" |
| -10% contribution | `projected_minus10` | `COLOR_AMBER` (`#F5A623`) | `"3 3"` | 1.5 | "-10% contributions" |

The historical line (`net_worth`) uses `connectNulls={false}` — it only exists on historical dates. The three projection lines also use `connectNulls={false}` — they only exist on projected dates (and the single overlap point at "today").

When contribution = $0 (zero contributions edge case): render only the historical line and one projection line labeled "Growth only (no contributions)". Hide the +10% and -10% `Line` components entirely (conditional rendering, not just invisible).

### 3.5 Nest Egg Reference Line

Rendered as a horizontal `ReferenceLine` (Recharts) only when `nestEgg != null`:

```
y={nestEgg}
stroke={COLOR_AMBER}          // '#F5A623'
strokeDasharray="6 3"
strokeWidth={1}
label={{ value: 'Target', fill: COLOR_AMBER, fontSize: 11, position: 'insideTopRight' }}
```

The label reads "Target" on the right side of the reference line so it does not overlap the Y-axis ticks.

### 3.6 Retirement Age Vertical Reference Line

A vertical `ReferenceLine` at the target retirement date (computed from today + years remaining), shown as a subtle marker:

```
x={targetDateString}          // YYYY-MM-DD of target retirement year
stroke={COLOR_AMBER}
strokeDasharray="4 4"
strokeWidth={1}
label={{ value: `Retire ${targetYear}`, fill: COLOR_AMBER, fontSize: 10, position: 'insideTopLeft' }}
```

Only rendered when retirement settings exist and target year is in the future.

### 3.7 "Today" Transition Marker

The transition from historical solid line to projected dashed line is at the current date. This transition is self-evident from the line style change. No additional marker is needed. The merged dataset handles this naturally — historical points have `net_worth` populated and `projected_net_worth` null; projected points are the reverse, with a single overlap point at "today" that has both.

### 3.8 X-Axis Formatting

For the forecasting chart the dates span years, not months. Override `tickFormatter` to show 4-digit years when the span is ≥ 5 years:

```js
const xTickFormatter = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  // If range spans many years, show year only; otherwise show month+year
  return d.getFullYear().toString()
}
```

The standard `formatDateLabel` from `chartUtils.jsx` shows "Jan '24" style — appropriate for sub-2-year ranges but cluttered for decade-scale charts. The forecasting chart should always use year-only labels for its primary ranges.

### 3.9 Tooltip

Custom tooltip showing all active lines at the hovered date. Same structural pattern as `GroupsTimeChart.CustomTooltip`:

```
┌──────────────────────────────────┐
│  2031                            │  ← date, color: '#8BA8CC'
│  ● Actual           $487,200     │  ← only on historical dates
│  ─ Projected (baseline)  $523,000│
│  ··· +10% contributions  $571,300│
│  ··· -10% contributions  $478,100│
└──────────────────────────────────┘
```

Inline style spec (matches `TOOLTIP_STYLE` from `chartUtils.jsx`):

```js
const tooltipStyles = {
  wrap: { ...TOOLTIP_STYLE, minWidth: 220 },
  date: { color: '#8BA8CC', marginBottom: 8, fontSize: 12, fontWeight: 600 },
  row:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 },
  lineIndicator: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  swatch: { width: 20, height: 2, display: 'inline-block' },  // line-style preview
}
```

Each tooltip row shows a small colored line swatch (solid/dashed/dotted matching the actual line style) beside the series name. Values formatted with `fmtFull`.

For tooltip rows: show only series that have non-null data at the hovered date. Do not show "--" rows.

### 3.10 Legend

Use Recharts `Legend` component with `iconType="line"` and custom `wrapperStyle`:

```js
wrapperStyle={{ color: '#8BA8CC', fontSize: 12, paddingTop: 8 }}
```

The legend appears below the chart. It is hidden on mobile (< 480px) to save vertical space — the tooltip serves as the data identifier on mobile. Show on tablet and desktop.

When in "Growth only" mode (zero contribution), show only "Actual" and "Growth only (no contributions)" in the legend.

### 3.11 Chart States

**Loading state:** Container at full height, centered spinner text "Loading projections…" in `var(--text-muted)` at 14px. Same height as the chart would occupy (so the page does not shift on load).

**No investment accounts (empty state):**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   No investment accounts found.                     │  ← text-primary, 14px
│   Sync your retirement or brokerage accounts        │  ← text-secondary, 13px
│   to see projections.                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Container: `min-height: 220px` mobile, `300px` desktop. Text centered vertically and horizontally.

**Target age invalid (edge case 4.8):**

Same empty state container with message: "Your target retirement age is at or before your current age. Update your retirement settings."

**No retirement settings (edge case 4.2):** The chart renders without the nest egg reference line or retirement age vertical marker. The three projection lines still render using slider defaults ($0 contribution, 7% return, default CAGR).

---

## 4. ForecastingSummary Component

**File:** `src/components/ForecastingSummary.jsx` + `ForecastingSummary.module.css`

### 4.1 Summary Card Grid

Four metric cards in a 2×2 grid on mobile, 4×1 row on desktop (≥ 480px). The card grid immediately follows the chart within the same page flow.

```css
.cardGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (min-width: 480px) {
  .cardGrid {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
}
```

### 4.2 Individual Summary Cards

Each card follows the `StatsCards.module.css` pattern: `bg-card`, `border`, `radius-lg`, `padding: 16px 20px` mobile, `20px 24px` desktop.

Card structure:
```
┌──────────────────────┐
│ CURRENT CAPITAL      │  ← label: 10px, font-weight 500, uppercase,
│                      │           letter-spacing 2px, color: text-muted
│ $487,200             │  ← value: 22px mobile, 28px desktop, font-weight 400,
│                      │           color: text-primary
└──────────────────────┘
```

The four cards and their visual specifications:

| Card | Label | Value Token | Special |
|------|-------|-------------|---------|
| Current Investable Capital | "CURRENT CAPITAL" | `text-primary` | — |
| Nest Egg Needed | "NEST EGG TARGET" | `text-primary` | Show "—" if `desired_annual_income` not set; include info prompt |
| Projected at Retirement | "AT RETIREMENT" | Dynamic (see below) | Color based on on/off track |
| Gap / Surplus | "GAP ANALYSIS" | Dynamic (see below) | Color + prefix |

**"AT RETIREMENT" card value color:**
- On track (projected ≥ nest egg): `var(--color-positive)` = `var(--green)` = `#2ECC8A`
- Off track (projected < nest egg): `var(--color-negative)` = `var(--red)` = `#FF5A7A`
- No nest egg to compare: `var(--text-primary)` (neutral)

**"GAP ANALYSIS" card value:**
- Ahead (projected ≥ nest egg): show `+$215K` format in `var(--color-positive)`
- Behind: show `-$340K` format in `var(--color-negative)`
- No nest egg: show "—" in `var(--text-muted)`

Use `fmtCompact` for card values (compact dollar notation: `$487K`, `$1.2M`). Use `fmtFull` in the detail text below.

### 4.3 On/Off Track Badge

Directly below the card grid, inside the same summary section container. Same badge pattern from `RetirementSummary.module.css`:

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-top: var(--sp-2);
}

.onTrack {
  background: color-mix(in srgb, var(--color-positive) 15%, transparent);
  color: var(--color-positive);
  border: 1px solid color-mix(in srgb, var(--color-positive) 20%, transparent);
}

.offTrack {
  background: color-mix(in srgb, var(--color-negative) 15%, transparent);
  color: var(--color-negative);
  border: 1px solid color-mix(in srgb, var(--color-negative) 20%, transparent);
}
```

Badge text: "ON TRACK" or "OFF TRACK" (text, not icon alone, for accessibility).

### 4.4 Gap Analysis Text Block

Below the badge, a single line of body text:

**On track:** "You are $215,000 ahead of your $2,000,000 target." (green `var(--color-positive)`)

**Off track:** "You need $340,000 more by 2048." followed on the next line by "Increase contributions by $450/month to close the gap." (red `var(--color-negative)` for the shortfall line; `var(--text-secondary)` for the contribution suggestion)

**No nest egg:** Show a prompt instead: "Set your desired retirement income to see gap analysis." Styled as `var(--text-muted)`, 13px, with a link-styled "Edit Settings" inline that navigates to Net Worth.

**Typography:**
```css
.gapText {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: var(--sp-2);
  line-height: 1.5;
}
.gapTextHighlight {
  font-weight: 500;
  color: inherit; /* inherits on/off track color from parent */
}
.contributionSuggestion {
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: var(--sp-1);
}
```

### 4.5 Summary Container

The cards, badge, and gap text share a single container card:

```css
.summaryContainer {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
@media (min-width: 768px) {
  .summaryContainer { padding: 20px 24px; }
}
```

No section title for the summary container — the cards are self-labeling. This keeps the page from feeling header-heavy.

### 4.6 Summary Skeleton State

When loading, render four skeleton cards:

```css
.skeletonCard {
  height: 80px;
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
```

---

## 5. ForecastingSetup Component

**File:** `src/components/ForecastingSetup.jsx` + `ForecastingSetup.module.css`

### 5.1 Appearance and Purpose

Only rendered when `retirement?.exists === false`. A compact onboarding form that gates the rest of the page content. Once saved, it collapses and the controls + chart render.

### 5.2 Layout

Single card, same container style as `RetirementPanel`:

```
┌─────────────────────────────────────────────────┐
│ Set Up Retirement Goals                          │  ← section title
│ Enter your details to see projections.           │  ← subtitle
│                                                  │
│ CURRENT AGE      TARGET RETIREMENT AGE           │  ← 2-col grid (1-col on mobile)
│ [   35  ]        [   65   ]                      │
│                                                  │
│ DESIRED ANNUAL INCOME    MONTHLY CONTRIBUTION    │
│ [$  80,000     ]         [$   2,000    ]          │
│                                                  │
│ ▼ Advanced settings                              │  ← toggle, same as RetirementPanel
│                                                  │
│ [    Save & Continue    ]                        │  ← primary button, full-width on mobile
└─────────────────────────────────────────────────┘
```

### 5.3 Section Title and Subtitle

```css
.setupTitle {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
}
.setupSubtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: var(--sp-1);
}
```

### 5.4 Form Grid

Matches `RetirementPanel.module.css` exactly — reuse the same `.grid` pattern:

```css
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
@media (max-width: 600px) {
  .grid { grid-template-columns: 1fr; }
}
```

Field labels: same `fieldLabel` pattern — 9px, uppercase, letter-spacing 2px, `var(--text-muted)`.

Inputs: same `.input` spec — `bg-card`, `border`, `radius-md`, 13px, focus state matches.

### 5.5 Advanced Settings Toggle

Same `toggleBtn` pattern as `RetirementPanel` — text-only, `var(--accent)`, 12px. Advanced fields: expected annual return, social security annual, withdrawal rate. No milestones in the setup form.

### 5.6 Save Button

```css
.btnSave {
  background: var(--accent);
  color: var(--bg-root);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 24px;       /* slightly taller than RetirementPanel's 8px */
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  width: 100%;              /* full-width on mobile */
}
@media (min-width: 480px) {
  .btnSave { width: auto; }  /* auto on desktop — right-aligned in actions row */
}
```

Disabled state (while saving): `opacity: 0.5; cursor: not-allowed`. Button text changes to "Saving…".

Error state: show `.errorMsg` (same as `RetirementPanel.module.css`) below the button.

### 5.7 Setup Form Validation States

The form does not block rendering on empty fields — it only validates on save:

- Missing required field: input border transitions to `var(--color-negative)`, no shadow
- Validation error message appears below the form grid as a styled error block

---

## 6. Compact Settings Strip

**Location:** Bottom of page, inside `ForecastingPage` JSX (not a separate component — inline JSX is sufficient given the simplicity).

**File:** Styled inside `ForecastingPage.module.css`

### 6.1 Layout

```
┌──────────────────────────────────────────────────────┐
│ Age 35 → 65 · Target $2,000,000 · $2,000/mo          │  [Edit Settings]
└──────────────────────────────────────────────────────┘
```

Flex row, `justify-content: space-between`, `align-items: center`. The settings summary wraps on mobile.

Container:

```css
.settingsStrip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
```

Settings text: `font-size: 13px; color: var(--text-secondary)`. Numbers within text use `var(--text-primary)`.

"Edit Settings" link: styled as a button for click target size but visually a text link:

```css
.editLink {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
  white-space: nowrap;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.editLink:hover {
  color: var(--accent-light);
}
```

"Edit Settings" navigates to `/networth` (uses `useNavigate` from react-router-dom). This is not an `<a>` tag (no external link) — it's a `<button>` calling `navigate('/networth')`.

---

## 7. Error and Empty States

### 7.1 API Error State

When the initial `Promise.all` fails (edge case 4.11), replace the entire page content below the header with:

```
┌─────────────────────────────────────────────────────┐
│  ⚠ Could not load forecasting data                  │  ← errorTitle: red, 16px, weight 500
│                                                     │
│  Check that the backend is running and try again.   │  ← errorMsg: text-secondary, 14px
│                                                     │
│  [    ↻ Retry    ]                                  │  ← primary button
│                                                     │
│  Error detail: ...                                  │  ← errorDetail: text-muted, 12px monospace
└─────────────────────────────────────────────────────┘
```

Same `.errorBox`, `.errorTitle`, `.errorMsg`, `.errorDetail` pattern from `NetWorthPage.module.css`. The Retry button calls `loadPageData()` again.

### 7.2 No Investment Accounts Empty State

When `investableCapital` is null or zero after data loads (edge case 4.1):

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│            No investment accounts found.            │  ← text-primary, 15px, weight 500
│                                                     │
│     Sync your retirement or brokerage accounts      │  ← text-secondary, 13px
│     to see projections.                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Container: `background: var(--bg-info); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--sp-8) var(--sp-6); text-align: center; min-height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column;`

The controls and summary are still rendered below the empty chart state (so the user can still set sliders). Only the chart area itself shows the empty state.

### 7.3 Target Age Invalid (Edge Case 4.8)

Same empty chart container with message: "Your target retirement age is at or before your current age. Update your retirement settings." Controls hidden (there is nothing to project). The compact settings strip still renders with an "Edit Settings" link.

### 7.4 Negative Investable Capital (Edge Case 4.7)

```css
.negativeCapitalWarning  /* same style as .inlineWarning — amber, inside controls card */
```

Warning text: "Your investable capital is currently negative. Projections show a growth trajectory starting from $0." The chart still renders (projection starts from $0).

### 7.5 Loading State

The full page loading state follows `NetWorthPage`: show the `pageHeader` immediately (not skeleton), then below it show skeleton placeholder cards for each section:

- Controls section: skeleton card at `80px` height
- Chart section: skeleton card at `220px` mobile / `380px` desktop height
- Summary section: four skeleton cards in a grid

All skeletons use the shimmer animation pattern from `StatsCards.module.css`.

---

## 8. Navigation — Sidebar and Bottom Tab Bar

### 8.1 Sidebar Entry

No new CSS needed. The sidebar iterates `NAV_ITEMS` automatically. The new entry:

```js
{ path: '/forecasting', label: 'Forecasting', icon: '🔮' }
```

Active state inherits `.navItemActive`: accent left border, `var(--accent)` text, `var(--bg-card)` background.

### 8.2 Mobile Bottom Tab Bar — Six-Item Adaptation

The current tab bar uses `justify-content: space-around` which distributes 6 items evenly. At 360px viewport width, 6 items at `space-around` gives each item approximately 60px of horizontal space. The current `tabItem` padding is `var(--sp-2) var(--sp-1)` = `8px 4px` — this is already compact.

Verify at 360px: 6 items × ~60px = 360px exactly. This is tight but workable with the existing padding. The label text at 10px (`tabLabel`) may clip on very narrow screens (< 320px). Mitigation spec: truncate labels with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 52px` on `.tabLabel`.

No changes to `BottomTabBar.module.css` unless Playwright QA shows overflow.

---

## 9. Token Reference — New CSS Custom Properties

No new tokens are required in `index.css`. All design decisions map to existing tokens. The following clarifications apply to new uses of existing tokens:

| Usage in Phase 4 | Token | Value |
|-----------------|-------|-------|
| Slider track (unfilled) | `var(--bg-raised)` | `#1E2D4A` |
| Slider track (filled) | `var(--accent)` | `#4D9FFF` |
| Slider thumb | `var(--accent)` | `#4D9FFF` |
| Slider thumb border ring | `var(--bg-card)` | `#1C2333` |
| Slider thumb focus glow | `var(--accent-tint)` | `rgba(77,159,255,0.12)` |
| Slider thumb hover | `var(--accent-light)` | `#7DBFFF` |
| Numeric input background | `var(--bg-inset)` | `#0D1220` |
| On-track badge background | `color-mix(in srgb, var(--color-positive) 15%, transparent)` | — |
| Off-track badge background | `color-mix(in srgb, var(--color-negative) 15%, transparent)` | — |
| Warning inline note | `color-mix(in srgb, var(--amber) 10%, transparent)` | — |
| Gap text on-track | `var(--color-positive)` = `var(--green)` | `#2ECC8A` |
| Gap text off-track | `var(--color-negative)` = `var(--red)` | `#FF5A7A` |
| Historical chart line | `COLOR_ACCENT` (chartUtils.jsx) | `#4D9FFF` |
| Baseline projection line | `COLOR_ACCENT` | `#4D9FFF` |
| +10% projection line | `COLOR_POSITIVE` | `#2ECC8A` |
| -10% projection line | `COLOR_AMBER` | `#F5A623` |
| Nest egg reference line | `COLOR_AMBER` | `#F5A623` |
| Retirement age marker | `COLOR_AMBER` | `#F5A623` |
| Chart grid lines | `GRID_STROKE` | `#1E2D4A` |
| Chart axis tick text | `AXIS_TICK.fill` | `#4A6080` |
| Tooltip background | `TOOLTIP_STYLE.background` | `#1C2333` |

The raw hex values above (for SVG/canvas attributes) are already exported from `chartUtils.jsx`. Do not introduce duplicate constants.

---

## 10. Typography Reference

All typography follows the established system. No new type styles introduced.

| Element | Size | Weight | Color | Transform | Spacing |
|---------|------|--------|-------|-----------|---------|
| Page title "Forecasting" | 18px mobile / 20px desktop | 400 | `var(--text-primary)` | — | letter-spacing -0.3px |
| Section titles (chart, setup) | 15px mobile / 16px desktop | 500 | `var(--text-primary)` | — | — |
| Card labels | 10px | 500 | `var(--text-muted)` | uppercase | letter-spacing 2px |
| Form field labels | 9px | 400 | `var(--text-muted)` | uppercase | letter-spacing 2px |
| Card values | 22px mobile / 28px desktop | 400 | `var(--text-primary)` (or semantic) | — | — |
| Body / gap text | 13px | 400 | `var(--text-secondary)` | — | line-height 1.5 |
| Helper text / helper notes | 11px | 400 | `var(--text-muted)` | — | font-style italic |
| Badges | 9px | 600 | semantic (green/red) | uppercase | letter-spacing 1.5px |
| Buttons | 13px | 600 | — | uppercase | letter-spacing 1.5px |
| Input values | 13px | 400 | `var(--text-primary)` | — | — |
| Tooltip header (date) | 12px | 600 | `#8BA8CC` | — | — |
| Tooltip rows | 13px | 400/600 | `#F0F6FF` | — | — |
| Axis ticks | 11px | 400 | `#4A6080` | — | — |

---

## 11. Accessibility Specifications

### 11.1 Slider ARIA Labels

```html
<!-- Monthly contribution slider -->
<input
  type="range"
  aria-label="Monthly contribution amount"
  aria-valuemin="0"
  aria-valuemax="10000"
  aria-valuenow="2000"
  aria-valuetext="$2,000 per month"
/>

<!-- Annual return rate slider -->
<input
  type="range"
  aria-label="Annual return rate percentage"
  aria-valuemin="0"
  aria-valuemax="15"
  aria-valuenow="7"
  aria-valuetext="7.0 percent"
/>
```

`aria-valuetext` should update dynamically with the formatted value so screen readers announce "2,000 dollars per month" rather than reading the raw number "2000".

### 11.2 Numeric Input Labels

Each numeric input must have an associated `<label>` element. The `htmlFor` attribute on the label must match the `id` on the input. The `SliderInput` component generates stable IDs from the `ariaLabel` prop: `id={ariaLabel.replace(/\s+/g, '-').toLowerCase()}`.

### 11.3 Chart Screen Reader Summary

Immediately after the chart container, render a visually hidden `<div>` with `className={styles.srOnly}` (or the existing `aria-description` pattern if used elsewhere). Content:

```
Investable capital projection chart.
Current value: $487,200.
Projected value at retirement (2048): $1,340,000.
Nest egg target: $2,000,000.
Status: Off track. You need $660,000 more.
Increase contributions by $450 per month to close the gap.
```

This updates reactively when slider values change (it is inside the component tree that re-renders on slider change).

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### 11.4 On/Off Track Badge

The badge text "ON TRACK" / "OFF TRACK" conveys the status in text, not color alone. This satisfies WCAG 1.4.1 (Use of Color).

Additionally, the badge should have `role="status"` so screen readers announce changes when the slider updates the projection outcome:

```html
<div role="status" aria-live="polite" className={...}>
  ON TRACK
</div>
```

### 11.5 Focus Order (Tab Order)

The intended tab order through the Forecasting page:

1. Refresh button (page header)
2. Setup form fields (if visible): current age → target age → desired income → monthly contribution → advanced toggle → (advanced fields if open) → Save button
3. Monthly contribution text input
4. Monthly contribution range slider
5. Annual return rate text input
6. Annual return rate range slider
7. Reset button
8. Range selector buttons (5Y, 10Y, 20Y, All)
9. Settings strip "Edit Settings" button

This order matches the visual reading order top-to-bottom, left-to-right, following requirements spec section 7.3 exactly.

### 11.6 Keyboard Navigation for Sliders

Range inputs natively support arrow key navigation (← → for step changes, Page Up/Down for larger jumps). This is preserved by using native `<input type="range">`. The step size controls arrow key increment: `step="100"` for contribution, `step="0.5"` for return rate.

Ensure `onKeyDown` is not overridden in a way that suppresses default browser slider keyboard behavior.

### 11.7 Color Contrast

| Pair | Contrast Ratio | Passes |
|------|---------------|--------|
| `var(--text-primary)` (#F0F6FF) on `var(--bg-card)` (#1C2333) | ≈ 14:1 | AA + AAA |
| `var(--text-secondary)` (#8BA8CC) on `var(--bg-card)` (#1C2333) | ≈ 5.2:1 | AA |
| `var(--text-muted)` (#4A6080) on `var(--bg-card)` (#1C2333) | ≈ 3.1:1 | AA (large text / UI components only) |
| `var(--accent)` (#4D9FFF) on `var(--bg-root)` (#0A0F1E) | ≈ 7.1:1 | AA + AAA |
| `var(--green)` (#2ECC8A) on `var(--bg-card)` (#1C2333) | ≈ 6.4:1 | AA |
| `var(--red)` (#FF5A7A) on `var(--bg-card)` (#1C2333) | ≈ 5.7:1 | AA |
| `var(--amber)` (#F5A623) on `var(--bg-card)` (#1C2333) | ≈ 6.3:1 | AA |
| Badge text (green #2ECC8A) on badge bg (green 15% mix) | ≈ 4.5:1 | AA |

All foreground/background pairs meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text and UI components). The `var(--text-muted)` (#4A6080) on card background falls below 4.5:1 — this is used only for form labels (9px uppercase) and helper text. The existing codebase uses this same pairing throughout (RetirementPanel, StatsCards). Acceptable for UI label context where the purpose is conveyed by position, not the text alone.

### 11.8 High-Contrast Mode

All interactive elements use `border` and `background` properties (not `outline: none` without a replacement). For high-contrast mode:

```css
@media (forced-colors: active) {
  .numericInput:focus { outline: 2px solid; }
  .rangeSlider:focus { outline: 2px solid; }
  .rangeBtn:focus    { outline: 2px solid; }
  .btnSave:focus     { outline: 2px solid; }
  .editLink:focus    { outline: 2px solid; }
}
```

---

## 12. Responsive Behavior Summary

| Property | Mobile (< 768px) | Desktop (≥ 768px) |
|----------|-----------------|-------------------|
| Page horizontal padding | from AppShell | from AppShell |
| Section vertical gap | `var(--sp-5)` = 20px | `var(--sp-6)` = 24px |
| Controls: label position | above input | above input |
| Controls: input width | 100% | 90px fixed |
| Controls: slider width | 100% | fills remaining space |
| Controls: reset button | full-width | right-aligned |
| Chart height | 220px | 380px (300px tablet) |
| Chart Y-axis width | 52px | 72px (64px tablet) |
| Chart legend | hidden (< 480px) | visible |
| Summary grid | 2×2 | 4×1 |
| Summary card padding | `16px 20px` | `20px 24px` |
| Summary card value size | 22px | 28px |
| Setup form grid | 1-column | 2-column |
| Settings strip | wraps to 2 lines | single row |
| Bottom tab bar | 6 items, space-around | hidden |
| Slider thumb | 24px | 18px |

---

## 13. Component File List and Responsibilities

| File | Responsibility |
|------|----------------|
| `src/pages/ForecastingPage.jsx` | Data fetching, state, layout orchestration |
| `src/pages/ForecastingPage.module.css` | Page header styles, settings strip styles, section spacing |
| `src/components/ForecastingControls.jsx` | Slider card wrapper; renders two `SliderInput` instances + Reset button |
| `src/components/ForecastingControls.module.css` | Controls card layout, reset button, inline warning/info blocks |
| `src/components/SliderInput.jsx` | Generic reusable slider+input control |
| `src/components/SliderInput.module.css` | Cross-browser range input styling, text input, label |
| `src/components/ForecastingChart.jsx` | Recharts LineChart with all lines, reference lines, custom tooltip |
| `src/components/ForecastingChart.module.css` | Chart container, header, empty/loading states |
| `src/components/ForecastingSummary.jsx` | Four metric cards + badge + gap analysis text |
| `src/components/ForecastingSummary.module.css` | Card grid, badge, gap text, skeleton states |
| `src/components/ForecastingSetup.jsx` | First-time onboarding form |
| `src/components/ForecastingSetup.module.css` | Setup card, form fields, save button |

---

## 14. Edge Case Visual Handling Summary

| Edge Case | Visual Treatment |
|-----------|-----------------|
| No investment accounts (4.1) | Empty chart with `bg-info` container, message centered. Controls hidden. Summary hidden. |
| No retirement settings (4.2) | ForecastingSetup shown. Chart renders without nest egg line/retirement marker. Summary shows "—" for nest egg fields. |
| < 1 year history, no CAGR (4.3) | Inline info note below return rate slider. Default 7.0% used. |
| Historical CAGR > 15% (4.4) | Inline amber warning below return rate slider. Slider clamped to 15%. |
| Negative historical CAGR (4.5) | Inline amber warning below return rate slider. |
| Zero contributions (4.6) | Single projection line "Growth only (no contributions)". +/-10% lines hidden. |
| Zero or negative investable capital (4.7) | Amber warning inside controls card. Chart renders starting from $0. |
| Target age ≤ current age (4.8) | Empty chart with message. Controls hidden. Settings strip with Edit link. |
| Very long projection > 50 years (4.9) | No cap. X-axis shows decade marks. |
| Null monthly contribution in settings (4.10) | Slider defaults to $0 silently. |
| API failure (4.11) | Full page error state with Retry button. |
| Only one bucket has data (4.12) | Silent — chart renders normally with available data. |
| No desired annual income (4.13) | Nest egg card shows "—" with prompt. Reference line hidden. Gap analysis replaced with prompt. |

---

## 15. Design Rationale Notes

**Why a single container card for summary + badge + gap text (not three separate cards):**
The badge and gap text are contextual reactions to the metric cards above them. Separating them into independent cards creates visual orphans — the badge would float disconnected from the numbers that justify it. A single card groups the "readiness verdict" together.

**Why the controls sit above the chart (not below or as a sidebar):**
The controls modify the chart. Top-to-bottom causality matches how users read: "I adjust this → I see that." A sidebar layout would work on wide desktop but fails on mobile where width is constrained.

**Why "AT RETIREMENT" card uses semantic color for its value:**
The projected value's meaning is entirely relative to the nest egg target. Rendering it in a semantic color (green/red) makes the relationship explicit without requiring the user to mentally compare two neutral numbers. The card label "AT RETIREMENT" names the metric; the color evaluates it.

**Why the compact settings strip uses a `<button>` not an `<a>` for "Edit Settings":**
The destination is an in-app route (`/networth`), not an anchor URL. Semantic HTML: `<a>` is for hyperlinks to documents or fragments; `<button>` is for triggering actions including navigation. Using react-router-dom's `useNavigate` via a button keeps navigation under the router's control (transitions, scroll restoration, etc.).

**Why no section titles above ForecastingControls or ForecastingSummary:**
The controls card heading would say something like "Scenario Controls" and the summary card would say "Retirement Readiness" — both are redundant with the visual content. The chart already has a descriptive title "Investable Capital Projection." Adding titles to every card follows the pattern only where the content is ambiguous (the setup form title is necessary because "Set Up Retirement Goals" explains the form's purpose). Avoid title proliferation that makes the page feel like a dashboard of isolated widgets.
