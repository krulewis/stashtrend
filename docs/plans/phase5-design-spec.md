# Phase 5 Design Specification — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Agent:** Frontend Designer
**Inputs:** phase5-requirements.md, phase5-research.md, phase5-architecture.md, existing design system
**Status:** Ready for engineer plan

---

## Visual Overview

Phase 5 adds two analytical layers to the existing Forecasting page (Phase 4). The design intent is **progressive disclosure**: the default Simple view stays clean and uncluttered, while Advanced mode reveals probabilistic depth for users who want it. Both views share the same AI narrative panel below the chart.

The overall visual language is consistent with the Dark Cobalt theme. The probability bands use the existing `--accent` cobalt at graduated opacities — creating a halo of uncertainty around the median that is immediately legible. The probability badge is a prominent, color-coded signal at the top of the Monte Carlo section. The AI panel follows the established collapsible card pattern from `AIAnalysisPanel.jsx` without visual deviation.

**New components:**
- `ViewToggle` — segmented control to switch Simple / Advanced
- `MonteCarloChart` — probability band visualization using ComposedChart
- `ProbabilityBadge` — color-coded "X% chance of target" display
- `SimulationControls` — "Run Simulation" button row with loading state and metadata (inline in ForecastingPage, not a separate component)
- `ForecastAIPanel` — AI narrative panel, visually identical to `AIAnalysisPanel`

**Modified component:**
- `ForecastingPage` (Phase 4) — receives the toggle, mounts new components, wires state

---

## Component Designs

---

### 1. ViewToggle

**File:** `frontend/src/components/ViewToggle.jsx` + `ViewToggle.module.css`

#### Layout

A segmented control (pill-shaped button group) with two options: "Simple" and "Advanced". Sits in the header row of the Forecasting page's chart section, right-aligned next to the chart title — mirroring the `RangeSelector` pattern used in `NetWorthChart` and `TypeStackedChart`.

```
[  Simple  |  Advanced  ]
```

Desktop: inline with the chart card header, right-aligned.
Mobile: full-width below the chart title, stacked beneath the title text (column layout).

#### Structure

```
<div role="group" aria-label="Projection view">
  <button role="radio" aria-checked={active === 'simple'}>Simple</button>
  <button role="radio" aria-checked={active === 'advanced'}>Advanced</button>
</div>
```

The outer `div` uses `role="group"` with `aria-label`. Each button uses `role="radio"` and `aria-checked` to form a radio group accessible to screen readers without requiring actual `<input type="radio">` elements.

#### Tokens

| Property | Token | Value |
|----------|-------|-------|
| Container background | `--bg-card` | `#1C2333` |
| Container border | `--border` | `#1E2D4A` |
| Container border-radius | `--radius-pill` | `9999px` |
| Active segment background | `--accent-tint` | `rgba(77,159,255,0.12)` |
| Active segment text | `--accent` | `#4D9FFF` |
| Active segment border | `--accent-border-hover` | `rgba(77,159,255,0.25)` |
| Inactive text | `--text-secondary` | `#8BA8CC` |
| Padding per button | `--sp-2` `--sp-4` | `8px 16px` |
| Font size | — | `13px` |
| Font weight active | — | `500` |
| Transition | `--ease-default` | `200ms ease` |

#### States

| State | Visual |
|-------|--------|
| Default (inactive segment) | `--text-secondary` text, transparent background, transparent border |
| Active segment | `--accent-tint` fill, `--accent` text, `--accent-border-hover` border |
| Hover (inactive) | `--text-primary` text, `--bg-hover` fill (`#243044`) |
| Hover (active) | No change — already selected |
| Focus-visible | 2px `--border-focus` (`#4D9FFF`) outline, offset 2px, on focused button |
| Disabled | Not applicable — both options always available |

#### Interactions

- Click switches the active view immediately with no loading triggered
- Switching to Advanced with cached simulation data renders the chart instantly
- Switching to Advanced without cached data shows the empty SimulationControls empty state
- Switching back to Simple hides the Monte Carlo chart but does NOT discard cached results
- Transition: active indicator changes via `background-color` and `color` at `--ease-default`

#### CSS Spec

```css
.group {
  display: inline-flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 3px;
  gap: 2px;
}

.btn {
  padding: var(--sp-2) var(--sp-4);        /* 8px 16px */
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: background var(--ease-default), color var(--ease-default), border-color var(--ease-default);
  white-space: nowrap;
}

.btn:hover:not(.active) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.active {
  background: var(--accent-tint);
  color: var(--accent);
  border-color: var(--accent-border-hover);
  font-weight: 500;
}

.btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .group {
    width: 100%;
  }
  .btn {
    flex: 1;
    text-align: center;
  }
}
```

#### Responsive

- Desktop (>= 768px): inline-flex, natural width, right-aligned in chart header row
- Mobile (< 768px): full-width, both buttons expand equally via `flex: 1`

---

### 2. SimulationControls

**Placement:** Inline in `ForecastingPage.jsx`, not a separate component (too simple to warrant one). Only visible when `view === 'advanced'`.

#### Layout

A row below the `ViewToggle`/chart-header and above the `MonteCarloChart`. Contains:
- Left: status text or volatility metadata
- Right: "Run Simulation" button

```
[ Volatility: 15.2% · Historical        |  Run Simulation  ]
```

When running:
```
[  ⟳  Simulating 5,000 scenarios...     |  [disabled · spinner]  ]
```

The row does NOT have its own card background — it is padded content within the containing chart card at `0 0 var(--sp-4)` (no top padding, bottom padding before the chart).

#### Tokens

| Element | Token |
|---------|-------|
| Status text | `--text-secondary` |
| Volatility pill background | `--bg-info` (`#1E2D4A`) |
| Volatility pill text | `--accent-wash` (`#99CCFF`) |
| Volatility pill border-radius | `--radius-pill` |
| Run button | `.btnPrimary` from `AIAnalysisPanel.module.css` pattern |
| Disabled button opacity | `0.5` |
| Spinner | Same `.spinner` keyframe as `AIAnalysisPanel.module.css` |

#### States

| State | Display |
|-------|---------|
| No simulation run | Status: "No simulation run yet" · Button: "Run Simulation" (enabled) |
| Running | Status: spinner + "Simulating 5,000 scenarios..." · Button: disabled with inline spinner, label "Running..." |
| Done (fresh result) | Volatility pill + source badge · Button: "Re-run Simulation" |
| Done (from cache) | Volatility pill + "Cached" indicator in `--text-muted` · Button: "Re-run Simulation" |
| Insufficient data | Warning banner (see below), button disabled |

#### Insufficient Data Warning

When the frontend detects insufficient history (backend returns 422 or `volatility_unavailable`):

```
[!] Need at least 90 days of portfolio history to run Monte Carlo simulation.
```

- Color: `--amber` (`#F5A623`)
- Background: `color-mix(in srgb, var(--amber) 12%, transparent)`
- Border: `1px solid color-mix(in srgb, var(--amber) 20%, transparent)`
- Border-radius: `--radius-md` (8px)
- Padding: `8px 12px`
- Font size: 13px
- `role="alert"` so screen readers announce it when it appears
- "Run Simulation" button: `disabled`, opacity 0.5, `cursor: not-allowed`
- Button `title` attribute: "Need at least 90 days of portfolio history for Monte Carlo simulation."

#### Low-Volatility Note (E-2)

When `volatility_used < 0.005`, display a secondary note below the volatility pill:

```
Very low volatility detected — simulation outcomes are tightly clustered.
```

Font size: 12px. Color: `--text-muted`. No icon needed — informational only.

#### Fallback Volatility Note

When `volatility_source === 'fallback'`, style the source badge in `--amber` instead of `--accent-wash` to signal approximate data:

```
[ Vol: 15.0%  |  Fallback ← amber ]
```

#### Run Button — Loading State

During simulation, the button:
1. `disabled` attribute applied
2. Opacity 0.75 (slightly more visible than standard disabled 0.5 — button is busy, not unavailable)
3. Inline spinner (16x16px, `.spinner` keyframe) to the left of label
4. Label changes from "Run Simulation" to "Running..."
5. `min-width` locked to avoid layout shift when label changes

```css
.btnRunSimulation {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 148px;  /* prevents width shift between states */
}
```

---

### 3. MonteCarloChart

**File:** `frontend/src/components/MonteCarloChart.jsx` + `MonteCarloChart.module.css`

#### Layout

A full-width card component. Card styling matches `NetWorthChart.module.css` exactly:
- `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: 12px`
- Padding: `16px` mobile, `20px 24px` desktop
- Margin-bottom: `20px` mobile, `24px` desktop

Internal structure:
1. Card header row (title + metadata)
2. Recharts `ComposedChart`
3. Legend row

#### Chart Dimensions

| Breakpoint | Chart height | Y-axis width |
|------------|-------------|--------------|
| Mobile (< 768px) | 260px | 52px |
| Desktop (>= 768px) | 380px | 72px |

Margin: `{ top: 10, right: 10, left: 10, bottom: 0 }` (matches existing charts).

#### Data Transformation

Raw API response is transformed into chart-ready data in the component:

```js
const chartData = bands.map(point => ({
  date: point.date,            // "YYYY-MM-DD" — used by XAxis
  base:        point.p10,      // invisible anchor at p10 level
  band_10_25:  point.p25 - point.p10,
  band_25_50:  point.p50 - point.p25,
  band_50_75:  point.p75 - point.p50,
  band_75_90:  point.p90 - point.p75,
  // Absolute values retained for tooltip access via payload[0].payload
  p10: point.p10,
  p25: point.p25,
  p50: point.p50,
  p75: point.p75,
  p90: point.p90,
}))
```

#### Probability Band Visualization

**Recharts structure** (render order matters — bottom to top within `stackId="mc"`):

```jsx
<ComposedChart data={chartData}>
  {/* Invisible base: anchors stack at the p10 level */}
  <Area stackId="mc" dataKey="base"
        fill="transparent" stroke="none" dot={false} isAnimationActive={false} />

  {/* Outer band: p10 to p25 — lightest */}
  <Area stackId="mc" dataKey="band_10_25"
        fill={BAND_OUTER_FILL} stroke="none" dot={false} isAnimationActive={false} />

  {/* Inner band: p25 to p50 — medium */}
  <Area stackId="mc" dataKey="band_25_50"
        fill={BAND_INNER_FILL} stroke="none" dot={false} isAnimationActive={false} />

  {/* Inner band: p50 to p75 — medium (symmetric with band_25_50) */}
  <Area stackId="mc" dataKey="band_50_75"
        fill={BAND_INNER_FILL} stroke="none" dot={false} isAnimationActive={false} />

  {/* Outer band: p75 to p90 — lightest (symmetric with band_10_25) */}
  <Area stackId="mc" dataKey="band_75_90"
        fill={BAND_OUTER_FILL} stroke="none" dot={false} isAnimationActive={false} />

  {/* Median line: solid cobalt, rendered on top of all bands */}
  <Line dataKey="p50" stroke={COLOR_ACCENT} strokeWidth={2}
        dot={false} isAnimationActive={false} />

  {/* Retirement target reference line — conditional */}
  {nestEgg && (
    <ReferenceLine y={nestEgg} stroke={COLOR_AMBER} strokeDasharray="6 4"
                   label={{ value: 'Target', fill: COLOR_AMBER, fontSize: 11 }} />
  )}

  {sharedChartElements({ yAxisWidth, tooltip: <MonteCarloTooltip /> })}
</ComposedChart>
```

`isAnimationActive={false}` on all Area and Line components — chart animation on hundreds of data points is slow and adds no value for a static projection. This matches the pattern used in production charts for large datasets.

#### Color Constants

Defined as module-level constants in `MonteCarloChart.jsx` (raw RGBA required — CSS vars do not work in Recharts SVG fill attributes):

```js
// Import from chartUtils.jsx
import { COLOR_ACCENT, TOOLTIP_STYLE, sharedChartElements, formatDateLabel, fmtCompact, GRID_STROKE, AXIS_TICK } from './chartUtils.jsx'

// Local constants
const BAND_OUTER_FILL = 'rgba(77, 159, 255, 0.09)'   // p10-p25, p75-p90
const BAND_INNER_FILL = 'rgba(77, 159, 255, 0.20)'   // p25-p50, p50-p75
const COLOR_AMBER     = '#F5A623'                     // target reference line
```

No stroke on `<Area>` components — strokes between adjacent bands create distracting seam lines. Only the `<Line>` for p50 has a stroke.

#### Custom Tooltip

The default Recharts tooltip shows delta series names (`band_25_50: $147,300`) which are meaningless. A custom tooltip maps back to absolute percentile values using `payload[0].payload`.

**Tooltip visual:**

```
┌─────────────────────────────┐
│  Jan '35        (date)      │
│  90th:  $2,140,000          │
│  75th:  $1,820,000          │
│  Median: $1,520,000  (bold) │
│  25th:  $1,240,000          │
│  10th:    $890,000          │
└─────────────────────────────┘
```

- Wrapper: `TOOLTIP_STYLE` from `chartUtils.jsx`
- Date row: `--text-secondary`, 12px, `marginBottom: 8`
- Each value row: label in `--text-secondary`, value in `--text-primary`, `fontWeight: 400`
- Median row: value in `--text-primary`, `fontWeight: 600` (visually distinguished)
- Row layout: `display: flex`, `justifyContent: space-between`, `gap: 16`
- Order: 90th (top) to 10th (bottom) — descending order matches visual chart top-to-bottom

Tooltip renders from the raw percentile fields on `payload[0].payload`, NOT from the delta `payload` array. Implementation:

```js
const MonteCarloTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload   // access absolute values
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#8BA8CC', marginBottom: 8, fontSize: 12 }}>{label}</div>
      {[
        ['90th', d.p90],
        ['75th', d.p75],
        ['Median', d.p50],
        ['25th', d.p25],
        ['10th', d.p10],
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16,
                                  fontWeight: label === 'Median' ? 600 : 400, marginBottom: 2 }}>
          <span style={{ color: '#8BA8CC' }}>{label}:</span>
          <span style={{ color: '#F0F6FF' }}>{fmtFull(value)}</span>
        </div>
      ))}
    </div>
  )
}
```

#### Legend

A custom legend row below the chart (NOT Recharts `<Legend>` — its series names are the delta keys). Implemented as a `div` inside `MonteCarloChart.module.css`.

**Desktop legend (5 items, all visible):**

```
━━  Median    ▓  25th–75th    ░  10th–90th    - - -  Target
```

**Mobile legend (3 items, simplified):**

```
━━  Median    ▓  25th–75th    ░  10th–90th
```

The retirement target entry is omitted from the mobile legend to save space — the dashed reference line on the chart is self-labeling.

Legend item structure:
- Swatch shape: `16px × 4px` rectangle, `border-radius: 2px`
- Outer band swatch: `BAND_OUTER_FILL` background
- Inner band swatch: `BAND_INNER_FILL` background
- Median swatch: `20px × 2px` rectangle, `COLOR_ACCENT` background
- Target swatch: `16px × 2px` rectangle, dashed border in `COLOR_AMBER`
- Label: 12px, `--text-secondary`
- Item gap: `16px` desktop, `10px` mobile
- Container: `display: flex`, `flex-wrap: wrap`, `align-items: center`
- Top margin: `--sp-3` (12px) from chart bottom

```css
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border-sub);
}

@media (max-width: 767px) {
  .legend {
    gap: 10px;
  }
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.swatchLine {
  width: 20px;
  height: 2px;
  background: var(--swatch-color);
  border-radius: 1px;
}

.swatchBand {
  width: 16px;
  height: 10px;
  border-radius: 2px;
  background: var(--swatch-color);
}
```

#### Loading / Skeleton State

When `simulationLoading === true`, replace the chart `<ResponsiveContainer>` with a skeleton:

```css
.skeleton {
  height: 260px;   /* mobile */
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    var(--bg-card) 25%,
    var(--bg-hover) 50%,
    var(--bg-card) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.5s infinite;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 768px) {
  .skeleton { height: 380px; }
}
```

Text inside skeleton: "Simulating 5,000 scenarios..." — positioned via flexbox center, color `--text-muted`, font-size 14px. The text is NOT animated (stays legible against the shimmer).

#### Empty State

When `view === 'advanced'` and `simulationData === null` and `simulationLoading === false`:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│       Run a simulation to see probability bands.    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Height matches skeleton height (260px / 380px)
- Text: `--text-muted`, 14px, centered
- Container: `background: var(--bg-card)`, `border: 1px dashed var(--border-sub)`, `border-radius: var(--radius-md)`

#### Simulation Error State

When `simulationError` is set:

```
[!] Simulation failed: Could not compute portfolio volatility.  [Retry]
```

- Inline below the SimulationControls row, above the empty state
- Color: `--red`
- Background: `var(--bg-error-subtle)` (`#FF5A7A22`)
- Border: `1px solid var(--border-error)` (`#FF5A7A44`)
- Border-radius: `--radius-md`
- Padding: `8px 12px`
- "Retry" is a ghost button inline with the text

#### Chart Fade-In

When simulation data arrives and the chart replaces the skeleton, apply a fade-in:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.chartContainer {
  animation: fadeIn var(--ease-default) forwards;
}
```

Prevents the chart from popping in abruptly.

#### ARIA for Chart

```jsx
<div
  role="img"
  aria-label={`Monte Carlo simulation chart. ${yearsToRetirement}-year projection. Median outcome: ${fmtFull(p50Final)}. Range from 10th to 90th percentile: ${fmtFull(p10Final)} to ${fmtFull(p90Final)}.`}
>
  <ResponsiveContainer>
    <ComposedChart aria-hidden="true">
      ...
    </ComposedChart>
  </ResponsiveContainer>
</div>
```

The wrapper div is the accessible element; the SVG content is `aria-hidden`. The `aria-label` is computed from `simulationData.bands.at(-1)` final values.

#### Responsive

| Breakpoint | Chart height | Y-axis width | Legend |
|------------|-------------|--------------|--------|
| Mobile (< 768px) | 260px | 52px | 3 items |
| Desktop (>= 768px) | 380px | 72px | 4–5 items |

---

### 4. ProbabilityBadge

**File:** `frontend/src/components/ProbabilityBadge.jsx` (styles via `MonteCarloChart.module.css` or inline)

#### Layout

A full-width banner card positioned directly above `MonteCarloChart`, below `SimulationControls`. Only rendered when `probability !== null`.

```
┌────────────────────────────────────────────────────────────────┐
│  73.2%   chance of reaching your $2,000,000 retirement target  │
└────────────────────────────────────────────────────────────────┘
```

Desktop: flexbox row, `align-items: center`, `gap: var(--sp-3)`.
Mobile (< 480px): column layout, number centered above label text.

#### Color Thresholds

| Probability | Border/text color | Background |
|-------------|-------------------|------------|
| >= 70% | `--green` (`#2ECC8A`) | `color-mix(in srgb, var(--green) 12%, transparent)` |
| 40–69% | `--amber` (`#F5A623`) | `color-mix(in srgb, var(--amber) 12%, transparent)` |
| < 40% | `--red` (`#FF5A7A`) | `color-mix(in srgb, var(--red) 12%, transparent)` |

Border: `1px solid color-mix(in srgb, <threshold-color> 20%, transparent)` — matches `RetirementSummary.module.css` badge pattern exactly.
Border-radius: `--radius-md` (8px).
Padding: `12px 20px` desktop, `10px 16px` mobile.

#### Typography

- Probability number: `font-size: 28px`, `font-weight: 500`, color is the threshold color (`--green`, `--amber`, or `--red`)
- Label text: `font-size: 14px`, `color: var(--text-secondary)`
- Mobile: number `font-size: 22px`

#### Structure

```jsx
<div
  className={styles.probabilityBanner}
  role="status"
  aria-live="polite"
  aria-label={`${probability.toFixed(1)}% probability of reaching retirement target of ${fmtFull(nestEgg)}`}
  data-testid="probability-badge"
>
  <span className={styles.probabilityNumber}
        style={{ color: thresholdColor }}>
    {probability.toFixed(1)}%
  </span>
  <span className={styles.probabilityLabel}>
    chance of reaching your {fmtFull(nestEgg)} retirement target
  </span>
</div>
```

`thresholdColor` is derived from the probability value:
```js
const thresholdColor = probability >= 70
  ? 'var(--green)'
  : probability >= 40
  ? 'var(--amber)'
  : 'var(--red)'
```

#### States

| State | Behavior |
|-------|----------|
| `probability === null` | Component returns `null` (hidden entirely — not just invisible) |
| `nestEgg === null` | Component returns `null` (no target configured means no probability display) |
| Green (>= 70%) | Green tint background, green number |
| Amber (40–69%) | Amber tint background, amber number |
| Red (< 40%) | Red tint background, red number |

`role="status"` + `aria-live="polite"` ensures screen readers announce the probability value when simulation data changes, without interrupting current reading.

#### Responsive

- Desktop: `flex-direction: row`, number and label side by side
- Mobile (< 480px): `flex-direction: column`, number centered, label centered below, `text-align: center`

---

### 5. ForecastAIPanel

**File:** `frontend/src/components/ForecastAIPanel.jsx`

**CSS:** Imports `./AIAnalysisPanel.module.css` directly — **no new CSS file created**. All visual styles are shared. This enforces visual consistency without code duplication in CSS.

#### Layout

Structurally identical to `AIAnalysisPanel.jsx`. A collapsible card:
- Collapsed: just the header button (approximately 48px tall)
- Expanded: header + body section with content per state

Positioned below the Monte Carlo section (or below the Simple chart) and above the existing `RetirementPanel` / `ForecastingControls`. Full-width within the page content column.

#### State Machine

Five combined states:

| `config` | `status` | Displayed content |
|----------|----------|-------------------|
| `null` | `idle` | `<div className={styles.loadingMsg}>Loading…</div>` |
| `{ configured: false }` | `idle` | Config form (provider, API key, model, base URL) |
| `{ configured: true }` | `idle` | Provider/model badges + "Run Analysis" button |
| any | `running` | Spinner row: "Analyzing your forecast data…" |
| any | `done` | Analysis text + "Re-run" + "Reconfigure" action row |

Error state: `error` string displayed inline in `.errorMsg` div within whichever state is active. Does not change `status`.

#### Text Differences from AIAnalysisPanel

| Element | AIAnalysisPanel | ForecastAIPanel |
|---------|----------------|-----------------|
| Header title | "✦ Analyze with AI" | "✦ Analyze with AI" (same) |
| Running text | "Analyzing your budget data…" | "Analyzing your forecast data…" |
| POST body | Empty `{}` | Projection + Monte Carlo data object |

The header title is intentionally identical — the glyph and phrasing is a recognized UI pattern in this app and users see both panels on different pages.

#### Analysis Text Rendering

Output renders in `.analysisText` (shared class):

```css
/* From AIAnalysisPanel.module.css — referenced, not duplicated */
.analysisText {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-subtle);        /* #8BA8CC */
  background: var(--bg-surface);    /* #111827 */
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
}
```

Plain text — no markdown rendering. `white-space: pre-wrap` preserves paragraph breaks.

#### Truncation Warning

When `response.truncated === true`, display an amber warning above `.analysisText`:

```
[!] Analysis was truncated — some content may be missing.
```

Styles:
```css
.truncationWarning {
  font-size: 12px;
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  margin-bottom: 0;   /* gap between .body children handles spacing */
}
```

This needs to be added to `AIAnalysisPanel.module.css` (it is a new class, not duplicated logic). Since both panels import the same CSS file, it is available to both without any additional work.

#### POST Body Assembly

The component assembles the request body from props at the time `runAnalysis()` is called:

```js
async function runAnalysis() {
  setStatus('running')
  setAnalysis('')
  setError('')
  try {
    const body = {
      portfolio_value:      portfolioValue,
      monthly_contribution: monthlyContribution,
      annual_return_pct:    annualReturnPct,
      years_to_retirement:  yearsToRetirement,
      nest_egg_target:      nestEgg ?? null,
      cagr_1y:              cagr1y ?? null,
      on_track:             onTrack ?? null,
      monte_carlo: simulationData
        ? {
            p10_final:              simulationData.bands.at(-1).p10,
            p25_final:              simulationData.bands.at(-1).p25,
            p50_final:              simulationData.bands.at(-1).p50,
            p75_final:              simulationData.bands.at(-1).p75,
            p90_final:              simulationData.bands.at(-1).p90,
            probability_of_target:  simulationData.probability_of_target,
            volatility_used:        simulationData.volatility_used,
          }
        : null,
    }
    const data = await runForecastAiAnalysis(body)
    setAnalysis(data.analysis ?? '')
    setTruncated(data.truncated ?? false)
    setStatus('done')
  } catch (err) {
    setError(err.message)
    setStatus('idle')
  }
}
```

#### Prop Interface

```js
ForecastAIPanel.propTypes = {
  portfolioValue:       PropTypes.number,
  monthlyContribution:  PropTypes.number,
  annualReturnPct:      PropTypes.number,
  yearsToRetirement:    PropTypes.number,
  nestEgg:              PropTypes.number,     // null if target not configured
  cagr1y:               PropTypes.number,
  onTrack:              PropTypes.bool,
  simulationData:       PropTypes.shape({     // null if simulation not run
    bands:                   PropTypes.array.isRequired,
    probability_of_target:   PropTypes.number,
    volatility_used:         PropTypes.number,
  }),
}
```

#### Re-run Behavior

"Re-run" clears `analysis`, `error`, and `truncated` state, sets `status = 'running'`, re-sends the POST body. Since body is assembled from props at call time, a re-run after a new simulation automatically includes updated Monte Carlo data.

#### Collapsed Default

Starts `expanded = false`. The header button is always rendered (approximately 48px). The collapsed state is compact enough not to dominate the page on first load.

---

### 6. ForecastingPage — Phase 5 Integration

**File:** `frontend/src/pages/ForecastingPage.jsx` (Phase 4 component, modified)

#### Full Page Layout

```
ForecastingPage
├── [Page header: "Forecasting" + sync date]
│
├── [Chart card]
│   ├── Chart header row:
│   │   ├── Title: "Projection"   (left)
│   │   └── ViewToggle            (right)  ← NEW
│   │
│   ├── Simple view (view === 'simple'):
│   │   └── ForecastingChart          (Phase 4)
│   │
│   └── Advanced view (view === 'advanced'):
│       ├── SimulationControls row    ← NEW (inline)
│       ├── ProbabilityBadge          ← NEW (conditional on simulation data)
│       ├── MonteCarloChart           ← NEW
│       └── (InsufficientDataWarning) ← NEW (conditional)
│
├── ForecastingSummary        (Phase 4, both views)
├── ForecastingControls       (Phase 4, both views)
├── ForecastAIPanel           ← NEW (both views)
└── RetirementPanel           (Phase 4)
```

The `ForecastingChart` (Simple) and `MonteCarloChart` (Advanced) are mutually exclusive. `ForecastingSummary`, `ForecastingControls`, and `ForecastAIPanel` appear regardless of active view.

#### New State Variables

```js
// Phase 5 additions
const [view, setView]                       = useState('simple')
const [simulationData, setSimulationData]   = useState(null)
const [simulationLoading, setSimulationLoading] = useState(false)
const [simulationError, setSimulationError] = useState('')
```

Session-only persistence: on page reload, everything resets to Simple view with no simulation data. This is correct behavior per US-3, AC 3d.

#### ViewToggle Placement

The toggle lives inside the chart card's header row. The chart card is the primary content card containing both `ForecastingChart` (Phase 4) and `MonteCarloChart` (Phase 5). The header row uses the same flex pattern as `NetWorthChart.module.css`:

```
.header {
  display: flex;
  flex-direction: column;       /* mobile: stack title above toggle */
  gap: 12px;
  margin-bottom: 16px;
}

@media (min-width: 768px) {
  .header {
    flex-direction: row;        /* desktop: title left, toggle right */
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
}
```

---

## Token Updates

No new CSS custom properties are required. Phase 5 uses exclusively the existing token set from `index.css`.

**New CSS classes** (additions to existing files):

1. `AIAnalysisPanel.module.css` — add `.truncationWarning` class (amber warning for truncated AI response):

```css
.truncationWarning {
  font-size: 12px;
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
}
```

**Reference colors (raw RGBA for Recharts SVG fills):**

```js
// MonteCarloChart.jsx constants — documented for implementer
const BAND_OUTER_FILL = 'rgba(77, 159, 255, 0.09)'  // p10-p25, p75-p90
const BAND_INNER_FILL = 'rgba(77, 159, 255, 0.20)'  // p25-p50, p50-p75
// COLOR_ACCENT = '#4D9FFF'    — from chartUtils.jsx (median line)
// COLOR_AMBER  = '#F5A623'    — target reference line (local constant)
```

These are NOT CSS variables — Recharts renders SVG `fill` attributes which cannot resolve CSS custom properties. The hex values are sourced from the existing tokens (`--accent` = `#4D9FFF`, `--amber` = `#F5A623`).

---

## Loading States

### Monte Carlo Simulation Loading

Trigger: user clicks "Run Simulation".

1. `simulationLoading = true`
2. `simulationError = ''`
3. SimulationControls: button disabled, spinner + "Running...", status area shows "Simulating 5,000 scenarios..."
4. `MonteCarloChart`: chart area replaced by skeleton (shimmer animation)
5. Response arrives → `simulationLoading = false`, `simulationData = response`
6. Chart renders with `fadeIn` animation (`opacity: 0 → 1`, `200ms ease`)

Error path: `simulationError` set to error message string, displayed in red inline below SimulationControls. Empty state persists (or previous chart if re-run failed).

### AI Analysis Loading

Follows `AIAnalysisPanel` pattern exactly:
- `status = 'running'`
- Panel body shows `.runningRow`: `.spinner` + "Analyzing your forecast data..."
- Analysis text, action buttons, and error message are all hidden during running state
- Completely decoupled from chart and simulation state — one can be loading while the other is done

---

## Responsive Behavior

### Mobile (< 768px)

| Component | Mobile adaptation |
|-----------|-------------------|
| ViewToggle | Full-width, `flex: 1` on each button |
| SimulationControls | Status and button stack vertically; button is full-width |
| ProbabilityBadge | Column layout, number centered, smaller font (22px → 22px), `text-align: center` |
| MonteCarloChart | Chart height 260px, Y-axis 52px, simplified 3-item legend |
| ForecastAIPanel | Full-width (identical to AIAnalysisPanel existing behavior) |

### Tablet (768px–1023px) and Desktop (>= 1024px)

No significant differences between tablet and desktop for Phase 5 components. Both use the "desktop" specification. The containing page column width governs layout.

---

## Accessibility

### ViewToggle

- `role="group"` on container, `aria-label="Projection view"`
- Each button: `role="radio"`, `aria-checked={isActive}`
- Keyboard: Tab to focus group, Arrow Left/Right between options, Enter/Space to activate
- Focus ring: `2px solid var(--border-focus)` (`#4D9FFF`), `outline-offset: 2px`
- Both active (`--accent` on `--accent-tint`) and inactive (`--text-secondary` on `--bg-card`) text meet AA contrast ratios (4.6:1 and 4.8:1 respectively)

### MonteCarloChart

- Wrapper `div`: `role="img"`, `aria-label` with computed summary of median and p10/p90 final values
- `ComposedChart`: `aria-hidden="true"` — SVG nodes are not meaningfully navigable
- `aria-label` updates reactively when `simulationData` changes (React re-render)
- Loading skeleton: `aria-busy="true"` on the wrapper while loading; `aria-label` updates to "Loading simulation results"

### ProbabilityBadge

- `role="status"` + `aria-live="polite"` — announces updated probability when simulation completes without interrupting reading
- `aria-label` contains full text: `"{probability}% probability of reaching retirement target of {amount}"`
- Color coding is NOT the sole signal — percentage number and full text are always present

### SimulationControls

- "Run Simulation" button: standard `<button>`, `disabled` attribute when not runnable
- Disabled state: `title` attribute with explanation for why it is disabled
- While running: `aria-busy="true"` on button, spinner has `aria-hidden="true"`, label text changes
- Insufficient data warning: `role="alert"` for immediate screen reader announcement

### ForecastAIPanel

- Header button: `aria-expanded={expanded}` (identical to `AIAnalysisPanel`)
- Config form: all inputs have paired `<label>` elements and `aria-label` attributes
- Error message: `role="alert"` for immediate announcement
- Analysis result container: `role="region"` with `aria-label="AI forecast analysis"` when `status === 'done'`
- Truncation warning: rendered in document flow before the analysis text, announced as part of region content

### Color Contrast

| Element | Foreground | Background | Ratio | Result |
|---------|-----------|------------|-------|--------|
| Primary text | `--text-primary` #F0F6FF | `--bg-card` #1C2333 | 10.2:1 | AAA |
| Secondary text | `--text-secondary` #8BA8CC | `--bg-card` #1C2333 | 4.8:1 | AA |
| Accent text (toggle active) | `--accent` #4D9FFF | `--accent-tint` ~#0D1828 | 4.6:1 | AA |
| Accent wash | `--accent-wash` #99CCFF | `--bg-card` #1C2333 | 7.1:1 | AAA |
| Green probability | `--green` #2ECC8A | green 12% tint ~#0E2018 | 4.5:1 | AA |
| Amber probability | `--amber` #F5A623 | amber 12% tint ~#231705 | 5.2:1 | AA |
| Red probability | `--red` #FF5A7A | red 12% tint ~#200A10 | 4.8:1 | AA |

Note: `--text-muted` (#4A6080) on `--bg-card` (#1C2333) yields ~2.2:1 — below AA. This is consistent with existing usage across the app for decorative-only labels (axis ticks, legend labels, card sublabels) where text is supplementary, not essential. No changes required.

---

## Visual References

### Monte Carlo Band Visual Intent

The graduated opacity bands form a "confidence cone" that widens over time:

```
Value
  ▲
  │                              ░░░░░░░░░░░  p90 ceiling
  │                         ░░░░░▓▓▓▓▓▓▓▓▓░░░
  │                   ░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░
  │              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  p50 median
  │                   ░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░
  │                         ░░░░░▓▓▓▓▓▓▓▓▓░░░
  │                              ░░░░░░░░░░░  p10 floor
  └──────────────────────────────────────────────── Time (years)
  Now                                          Retirement
```

Inner bands (darker cobalt, opacity 0.20) represent the central 50th-to-75th and 25th-to-50th ranges — where most outcomes cluster. Outer bands (lighter cobalt, opacity 0.09) represent the tail scenarios. The solid median line is the single most important line on the chart.

The bands visually widen over time because GBM uncertainty compounds — this is a natural property of the simulation and communicates the inherent message: "the further out, the wider the range of outcomes."

### ProbabilityBadge Visual States

```
Green (>= 70%):
┌──────────────────────────────────────────────────────────────────┐
│  73.2%    chance of reaching your $2,000,000 retirement target   │
│  (green)                                          (--text-secondary) │
│                      green-tint background                        │
└──────────────────────────────────────────────────────────────────┘

Amber (40–69%):
┌──────────────────────────────────────────────────────────────────┐
│  54.8%    chance of reaching your $2,000,000 retirement target   │
│  (amber)                                          (--text-secondary) │
│                      amber-tint background                        │
└──────────────────────────────────────────────────────────────────┘

Red (< 40%):
┌──────────────────────────────────────────────────────────────────┐
│  28.1%    chance of reaching your $2,000,000 retirement target   │
│  (red)                                            (--text-secondary) │
│                       red-tint background                         │
└──────────────────────────────────────────────────────────────────┘
```

### ForecastingPage — Advanced View Full Layout

```
┌───────────────────────────────────────────────────────────────┐
│ Forecasting                         (page title)              │
├───────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Projection           [ Simple  |  Advanced (active) ]     │ │  ← chart card header
│ │                                                           │ │
│ │ Vol: 15.2% · Historical        [ Re-run Simulation ]      │ │  ← SimulationControls
│ │                                                           │ │
│ │ ┌───────────────────────────────────────────────────────┐ │ │
│ │ │  73.2%  chance of reaching your $2,000,000 target     │ │ │  ← ProbabilityBadge (green)
│ │ └───────────────────────────────────────────────────────┘ │ │
│ │                                                           │ │
│ │  ┌─────────────────────────────────────────────────────┐  │ │
│ │  │  380px Monte Carlo band chart                       │  │ │
│ │  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                 │  │ │
│ │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                  │  │ │
│ │  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (median)        │  │ │
│ │  │  - - - - - - - - - - - - - - - - - (target)        │  │ │
│ │  └─────────────────────────────────────────────────────┘  │ │
│ │                                                           │ │
│ │  ━━ Median   ▓ 25th–75th   ░ 10th–90th   - - Target     │ │  ← legend
│ └───────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│  [ForecastingSummary — Phase 4 gap cards]                     │
├───────────────────────────────────────────────────────────────┤
│  [ForecastingControls — Phase 4 sliders]                      │
├───────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ✦ Analyze with AI                                     ▼   │ │  ← ForecastAIPanel (collapsed)
│ └───────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│  [RetirementPanel — Phase 4 settings]                         │
└───────────────────────────────────────────────────────────────┘
```

---

## Component File Summary

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/ViewToggle.jsx` | Segmented Simple/Advanced control | New |
| `frontend/src/components/ViewToggle.module.css` | ViewToggle styles | New |
| `frontend/src/components/MonteCarloChart.jsx` | Probability band chart | New |
| `frontend/src/components/MonteCarloChart.module.css` | Chart container, skeleton, legend, tooltip, fade-in | New |
| `frontend/src/components/ProbabilityBadge.jsx` | Color-coded probability display | New |
| `frontend/src/components/ForecastAIPanel.jsx` | AI narrative panel (imports `AIAnalysisPanel.module.css`) | New |
| `frontend/src/components/AIAnalysisPanel.module.css` | Add `.truncationWarning` class | Modified |
| `frontend/src/pages/ForecastingPage.jsx` | Add toggle state, SimulationControls, wire new components | Modified |
| `frontend/src/api.js` | Add `runMonteCarlo(body)` and `runForecastAiAnalysis(body)` | Modified |

---

## Open Design Questions for Implementer

These require a judgment call during implementation and do not need a follow-up design review:

1. **ViewToggle placement within the Phase 4 chart card:** If the Phase 4 `ForecastingChart` is a self-contained card with its own header, the toggle should sit inside that card's header row. If the chart is rendered directly in `ForecastingPage` without a card wrapper, a new card wrapper should be added to host both the toggle and the conditional chart content. Either is consistent with this spec.

2. **ForecastingSummary in Advanced view:** The Phase 4 `ForecastingSummary` shows gap analysis derived from the deterministic projection — not from the probabilistic median. This spec leaves it visible in both views as a reference point. If the Phase 4 implementation team finds this creates confusion (two different "projected value" numbers), they may choose to hide it in Advanced view. No design review needed — it is a minor UX judgment call.

3. **X-axis tick density for long horizons:** For a 30-year horizon with monthly data points (360 data points), `interval="preserveStartEnd"` produces only start/end labels. For user legibility, the implementer should additionally pass `tickCount={7}` or similar to produce approximately one label per 5 years. Adjust based on actual rendering.

4. **`ProbabilityBadge` styles colocation:** Styles for `ProbabilityBadge` may live inside `MonteCarloChart.module.css` (since the badge is tightly coupled to the Monte Carlo section) or in a separate file. Either is acceptable — colocation inside `MonteCarloChart.module.css` reduces file count.
