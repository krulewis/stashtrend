# Phase 4: Forecasting Page — Implementation Plan

**Date:** 2026-03-09
**Author:** Engineer Agent
**Status:** Ready for implementation
**Size:** L
**Inputs:** phase4-requirements.md, phase4-research.md, phase4-architecture.md, phase4-design-spec.md, codebase inspection

---

## Overview

Phase 4 adds a `/forecasting` route to Stashtrend that projects investable capital (Retirement + Brokerage balances) forward to the user's target retirement age. All math is frontend-only using existing `retirementMath.js` utilities plus three new pure functions. No backend changes are needed.

The implementation touches 4 existing files and creates 12 new files (6 JSX components + 6 co-located CSS modules). The work decomposes into three parallel tracks:

- **Track A (Math utilities):** New pure functions in `retirementMath.js` + refactor `RetirementPanel.jsx`
- **Track B (New components):** `ForecastingChart`, `ForecastingControls` (with `SliderInput`), `ForecastingSummary`, `ForecastingSetup` — all purely presentational, can be built in parallel once math signatures are known
- **Track C (Page + routing):** `ForecastingPage.jsx`, `nav.js`, `App.jsx` — wires everything together, depends on Track A and B

Test writing (Track D) can begin in parallel with Track A once the utility function signatures are confirmed from this plan, since signatures are fully specified below.

---

## Changes

### Track A — Math Utilities (must complete before Track C)

---

```
File: /home/user/stashtrend/frontend/src/utils/retirementMath.js
Lines: append after line 84 (end of file)
Parallelism: independent
Description: Add three new exported pure functions. No changes to existing functions.
Details:
  - Add `getInvestableCapital(typeData)`:
      - Signature: `(typeData) => number | null`
      - If `!typeData?.series?.length` return null
      - `const latest = typeData.series[typeData.series.length - 1]`
      - Return `(latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)`
      - JSDoc comment: "Extracts investable capital (Retirement + Brokerage) from the
        latest point in typeData.series. Returns null if series is empty or missing."
  - Add `computeBlendedCAGR(typeData)`:
      - Signature: `(typeData) => number`
      - Get latest balances: `const latest = typeData?.series?.[typeData.series.length - 1] ?? {}`
      - `const retBal = latest?.Retirement ?? 0`
      - `const brokBal = latest?.Brokerage ?? 0`
      - Helper (inline): pick best CAGR for a bucket — try `cagr[bucket]['5y']`, then `'3y'`, then `'1y'`, then null
      - `const retCAGR = pickBest(typeData?.cagr?.Retirement)`
      - `const brokCAGR = pickBest(typeData?.cagr?.Brokerage)`
      - If both null: return 7.0
      - If retCAGR null: return brokCAGR
      - If brokCAGR null: return retCAGR
      - Total balance > 0: return `(retBal * retCAGR + brokBal * brokCAGR) / (retBal + brokBal)`
      - Total balance === 0 (edge case): return `(retCAGR + brokCAGR) / 2`
      - JSDoc comment with algorithm description and fallback cascade
  - Add `calculateContributionToTarget({ currentNetWorth, currentContribution, annualReturnPct, years, targetAmount })`:
      - Signature returns `number | null`
      - If `years <= 0` or `targetAmount == null`: return null
      - `const r = annualReturnPct / 100 / 12` (monthly rate)
      - `const n = years * 12`
      - If `r === 0`:
          - Pure contribution path: `neededMonthly = (targetAmount - currentNetWorth) / n`
          - If `neededMonthly <= currentContribution` return currentContribution
          - Return `Math.ceil(neededMonthly / 100) * 100`
      - `const fvLump = currentNetWorth * Math.pow(1 + r, n)`
      - `const shortfall = targetAmount - fvLump`
      - If `shortfall <= 0`: return currentContribution (already on track from growth alone)
      - `const neededContrib = shortfall * r / (Math.pow(1 + r, n) - 1)`
      - Return `Math.ceil(neededContrib / 100) * 100`
      - JSDoc comment explaining closed-form FV annuity formula and rounding rationale
  - Note: the inline `pickBest` helper in `computeBlendedCAGR` is a const defined inside
    the function body (not exported) — `(cagrObj) => cagrObj?.['5y'] ?? cagrObj?.['3y'] ?? cagrObj?.['1y'] ?? null`
```

```
File: /home/user/stashtrend/frontend/src/components/RetirementPanel.jsx
Lines: 44-48 (inline IIFE for investableCapital)
Parallelism: depends-on: retirementMath.js (getInvestableCapital must be added first)
Description: Replace inline investable capital IIFE with call to shared utility. Pure refactor — no behavioral change.
Details:
  - Add `getInvestableCapital` to the existing import from `'../utils/retirementMath.js'` (line 6)
    Before: `import { computeNestEgg, generateProjectionSeries } from '../utils/retirementMath.js'`
    After:  `import { computeNestEgg, generateProjectionSeries, getInvestableCapital } from '../utils/retirementMath.js'`
  - Replace lines 42-48 (the IIFE):
    Before:
      ```js
      const investableCapital = (() => {
        if (!typeData?.series?.length) return null
        const latest = typeData.series[typeData.series.length - 1]
        return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
      })()
      ```
    After:
      ```js
      const investableCapital = getInvestableCapital(typeData)
      ```
  - No other changes. All existing tests for RetirementPanel must pass without modification.
```

---

### Track B — New Component Files (independent of each other, can be built in parallel)

---

```
File: /home/user/stashtrend/frontend/src/components/SliderInput.jsx
Lines: new file
Parallelism: independent
Description: Generic reusable labeled slider + text input component with bidirectional sync. Used by ForecastingControls for both the contribution and return rate sliders.
Details:
  - Props (with PropTypes):
      - `label: string` — display label text
      - `value: number` — controlled current value
      - `onChange: func` — callback receives new numeric value
      - `min: number`
      - `max: number`
      - `step: number`
      - `format: func` — formats value for text display, e.g. `v => '$' + v.toLocaleString()`
      - `ariaLabel: string` — accessibility label for the range input
  - Local state: `inputText` (string) — the raw text shown in the text input while editing
  - On mount / when `value` prop changes: sync `inputText` to `format(value)`
    Use `useEffect([value])` — but only when the input is not focused (track focus with `isFocused` ref)
  - Text input (`<input type="text" inputMode="decimal">`):
      - `value={inputText}` controlled
      - `onChange`: update `inputText` only (do not call parent `onChange` yet)
      - `onFocus`: set `isFocused` ref to true; select all text for easy replacement
      - `onBlur`: parse `inputText` (strip non-numeric chars except `.`), clamp to [min, max],
        round to nearest `step`, call parent `onChange(clamped)`, set `isFocused` to false
      - `onKeyDown`: on Enter key, trigger blur behavior (same as onBlur)
  - Range input (`<input type="range">`):
      - `value={value}` controlled (uses parent value, not inputText)
      - `min`, `max`, `step` passed through
      - `onChange`: call parent `onChange(Number(e.target.value))` immediately
      - `aria-label={ariaLabel}`
  - Layout: label row on top, then a flex row with text input (left, fixed width ~90px) and range
    slider (right, flex-grow 1)
  - Import styles from `'./SliderInput.module.css'`
  - Export default `SliderInput`
  - Import `useEffect, useRef, useState` from react
  - Import `PropTypes` from 'prop-types'
```

```
File: /home/user/stashtrend/frontend/src/components/SliderInput.module.css
Lines: new file
Parallelism: independent
Description: Dark-theme slider and input styles. First use of range input in codebase — requires vendor prefixes.
Details:
  - `.wrapper`: `display: flex; flex-direction: column; gap: var(--sp-2);`
  - `.label`: `font-size: 9px; font-weight: 400; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px;`
  - `.controlRow`: `display: flex; align-items: center; gap: var(--sp-3);`
  - `.textInput`:
      - `background: var(--bg-inset); border: 1px solid var(--border); border-radius: var(--radius-md);`
      - `color: var(--text-primary); font-size: 13px; padding: 8px 10px;`
      - `width: 90px; box-sizing: border-box; text-align: right;`
      - Focus state: `border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none;`
      - `@media (forced-colors: active) { .textInput:focus { outline: 2px solid; } }`
  - `.slider`:
      - `flex: 1; cursor: pointer; accent-color: var(--accent);`
      - `appearance: none; -webkit-appearance: none; height: 4px;`
      - Track: `::-webkit-slider-runnable-track { background: var(--bg-raised); height: 4px; border-radius: 2px; }`
      - Track Firefox: `::-moz-range-track { background: var(--bg-raised); height: 4px; border-radius: 2px; }`
      - Thumb webkit: `::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; margin-top: -7px; }`
      - Thumb moz: `::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: none; }`
      - Mobile thumb size: `@media (max-width: 767px) { ::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -10px; } ::-moz-range-thumb { width: 24px; height: 24px; } }`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingControls.jsx
Lines: new file
Parallelism: independent (depends-on: SliderInput.jsx for import, but can be written concurrently)
Description: Card containing the two sliders (contribution, return rate) and a Reset button.
Details:
  - Props (with PropTypes):
      - `contribution: number` — current contribution slider value
      - `returnRate: number` — current return rate slider value
      - `onContributionChange: func` — callback with new contribution value
      - `onReturnRateChange: func` — callback with new return rate value
      - `onReset: func` — callback when Reset button clicked
      - `contributionMax: number` — computed max for contribution slider
      - `defaultsNote: string | null` — optional helper text (e.g. CAGR basis note), shown below return rate slider
      - `cagrWarning: string | null` — optional warning text for negative/clamped CAGR
  - Renders:
      - Container `div` with `className={styles.container}` (card styling)
      - `<SliderInput>` for monthly contribution:
          - `label="Monthly Contribution"`
          - `value={contribution}`
          - `onChange={onContributionChange}`
          - `min={0}`, `max={contributionMax}`, `step={100}`
          - `format={v => '$' + Math.round(v).toLocaleString()}`
          - `ariaLabel="Monthly contribution amount"`
      - `<SliderInput>` for annual return rate:
          - `label="Annual Return Rate"`
          - `value={returnRate}`
          - `onChange={onReturnRateChange}`
          - `min={0}`, `max={15}`, `step={0.5}`
          - `format={v => v.toFixed(1) + '%'}`
          - `ariaLabel="Annual return rate percentage"`
      - If `defaultsNote`: `<p className={styles.defaultsNote}>{defaultsNote}</p>` below return rate slider
      - If `cagrWarning`: `<p className={styles.cagrWarning}>{cagrWarning}</p>` below return rate slider (uses `--red` or `--amber` color)
      - Reset button: `<button className={styles.resetBtn} onClick={onReset}>Reset</button>`
        (secondary style: border, no fill)
  - Import `SliderInput` from `'./SliderInput.jsx'`
  - Import styles from `'./ForecastingControls.module.css'`
  - Import `PropTypes` from 'prop-types'
  - Export default `ForecastingControls`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingControls.module.css
Lines: new file
Parallelism: independent
Description: Styles for the controls card.
Details:
  - `.container`: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; display: flex; flex-direction: column; gap: var(--sp-4);`
  - `.header`: `display: flex; justify-content: space-between; align-items: center;`
  - `.title`: `font-size: 14px; font-weight: 500; color: var(--text-primary); margin: 0;`
  - `.resetBtn`: `background: transparent; border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius-md); padding: 6px 14px; font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer;`
  - `.resetBtn:hover`: `border-color: var(--accent); color: var(--accent);`
  - `.defaultsNote`: `font-size: 11px; color: var(--text-muted); margin: 0;`
  - `.cagrWarning`: `font-size: 11px; color: var(--amber); margin: 0;` (use `--color-warning`)
  - Desktop layout: on `@media (min-width: 768px)`, sliders side-by-side in a 2-col grid
    `.slidersGrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); }`
    Mobile: single column (flex-direction: column default)
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingChart.jsx
Lines: new file
Parallelism: independent
Description: Recharts LineChart showing historical investable capital (solid) and 1–3 projection lines (dashed/dotted), plus a nest egg ReferenceLine. Follows GroupsTimeChart pattern exactly.
Details:
  - Props (with PropTypes):
      - `chartData: array` — merged dataset from mergeHistoryWithProjection, each point has
        keys: `date`, `net_worth` (optional), `projected_net_worth` (optional),
        `projected_plus10` (optional), `projected_minus10` (optional)
      - `nestEgg: number | null` — Y-value for nest egg reference line; null = omit line
      - `showVariants: bool` — if false (contribution=0), only show historical + baseline lines
      - `retirementYear: number | null` — year of retirement for vertical reference line label
  - Local state: `range` (string, default 'All')
  - Custom ranges constant (not COMMON_RANGES — forecasting-specific):
      ```js
      const FORECASTING_RANGES = [
        { label: '5Y',  months: 60  },
        { label: '10Y', months: 120 },
        { label: '20Y', months: 240 },
        { label: 'All', months: null },
      ]
      ```
    Note: `filterByRange` filters by date >= cutoff; for future dates this naturally includes
    all projected points. "All" passes everything through. Range selector labels are future-looking.
  - `useResponsive()` for `isMobile`, `isDesktop`
  - `chartHeight`: `isMobile ? 240 : isDesktop ? 420 : 320`
  - `yAxisWidth`: `isMobile ? 56 : 72`
  - `useMemo` for filtered + downsampled data (same pattern as GroupsTimeChart):
      ```js
      const activeRange = FORECASTING_RANGES.find(r => r.label === range) ?? FORECASTING_RANGES[FORECASTING_RANGES.length - 1]
      const filtered = useMemo(() => filterByRange(chartData ?? [], activeRange.months), [chartData, activeRange])
      const data = useMemo(() => downsample(filtered), [filtered])
      ```
  - Custom tooltip (`ForecastingTooltip` const defined at module level before component):
      - Shows date, "Historical" value (net_worth), "Baseline" value (projected_net_worth),
        "+10% Contribution" (projected_plus10), "-10% Contribution" (projected_minus10)
      - Only shows rows where payload value is not null/undefined
      - Uses `fmtFull` for values, `TOOLTIP_STYLE` for container
      - Color swatches: historical=`COLOR_ACCENT`, baseline=`COLOR_ACCENT`, plus10=`COLOR_POSITIVE`, minus10=`COLOR_AMBER`
      - Styles defined as module-level `const tooltipStyles = { wrap: {...TOOLTIP_STYLE, minWidth: 200}, ... }`
        (same pattern as GroupsTimeChart)
  - Chart JSX structure:
      ```jsx
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Investable Capital Projection</h2>
          <RangeSelector ranges={FORECASTING_RANGES} activeRange={range} onSelect={setRange} />
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
            {sharedChartElements({ yAxisWidth, tooltip: <ForecastingTooltip /> })}
            {/* Historical line — solid */}
            <Line type="monotone" dataKey="net_worth" name="Historical"
              stroke={COLOR_ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4 }}
              connectNulls={false} />
            {/* Baseline projection — dashed, same color */}
            <Line type="monotone" dataKey="projected_net_worth" name="Baseline"
              stroke={COLOR_ACCENT} strokeWidth={2} strokeDasharray="8 4"
              dot={false} activeDot={{ r: 4 }} connectNulls={false} />
            {/* +10% variant — dotted green */}
            {showVariants && (
              <Line type="monotone" dataKey="projected_plus10" name="+10% Contribution"
                stroke={COLOR_POSITIVE} strokeWidth={1.5} strokeDasharray="4 4"
                dot={false} activeDot={{ r: 4 }} connectNulls={false} />
            )}
            {/* -10% variant — dotted amber */}
            {showVariants && (
              <Line type="monotone" dataKey="projected_minus10" name="-10% Contribution"
                stroke={COLOR_AMBER} strokeWidth={1.5} strokeDasharray="4 4"
                dot={false} activeDot={{ r: 4 }} connectNulls={false} />
            )}
            {/* Nest egg reference line — horizontal dashed */}
            {nestEgg != null && (
              <ReferenceLine y={nestEgg} stroke={COLOR_AMBER} strokeDasharray="6 3"
                label={{ value: `Target: ${fmtCompact(nestEgg)}`, fill: COLOR_AMBER, fontSize: 11, position: 'insideTopRight' }} />
            )}
          </LineChart>
        </ResponsiveContainer>
        {/* Screen reader summary */}
        <p className={styles.srOnly} aria-live="polite">
          {/* filled by prop or computed in parent — passed as `srSummary` prop */}
        </p>
      </div>
      ```
  - Add `srSummary: string` prop — rendered in `.srOnly` div for screen reader summary
  - Import from recharts: `LineChart, Line, ReferenceLine, ResponsiveContainer`
  - Import from chartUtils: `sharedChartElements, filterByRange, downsample, fmtCompact, fmtFull, COLOR_ACCENT, COLOR_POSITIVE, COLOR_AMBER, TOOLTIP_STYLE`
  - Import `RangeSelector` from `'./RangeSelector.jsx'`
  - Import `useResponsive` from `'../hooks/useResponsive.js'`
  - Import styles from `'./ForecastingChart.module.css'`
  - Import `PropTypes` from 'prop-types'
  - Export default `ForecastingChart`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingChart.module.css
Lines: new file
Parallelism: independent
Description: Chart container styles following GroupsTimeChart pattern.
Details:
  - `.container`: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px;`
  - `.header`: `display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); flex-wrap: wrap; gap: var(--sp-3);`
  - `.title`: `font-size: 14px; font-weight: 500; color: var(--text-primary); margin: 0;`
  - `.srOnly`: standard visually-hidden class:
      `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;`
  - `.emptyState`: `text-align: center; color: var(--text-muted); font-size: 14px; padding: var(--sp-10) 0;`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSummary.jsx
Lines: new file
Parallelism: independent
Description: Retirement readiness summary cards (investable capital, nest egg, projected at retirement, gap) plus on/off track badge and contribution suggestion text.
Details:
  - Props (with PropTypes):
      - `investableCapital: number | null`
      - `nestEgg: number | null`
      - `projectedAtRetirement: number | null`
      - `targetYear: number | null`
      - `neededContribution: number | null` — total monthly contribution needed; null = on track
      - `currentContribution: number`
      - `onEditSettings: func` — handler for "Edit Settings" link
      - `hasSettings: bool` — if false, hide gap analysis section and show prompt
  - Derived in component:
      - `isOnTrack = projectedAtRetirement != null && nestEgg != null && projectedAtRetirement >= nestEgg`
      - `gapAmount = (nestEgg != null && projectedAtRetirement != null) ? Math.abs(nestEgg - projectedAtRetirement) : null`
      - `additionalNeeded = neededContribution != null ? neededContribution - currentContribution : null`
  - Renders 4 metric cards in a grid (2x2 desktop, 1-col mobile):
      1. "Investable Capital Today" — `fmtFull(investableCapital)` or "—"
      2. "Nest Egg Needed" — `fmtFull(nestEgg)` or "—" (if no settings: "Set income goal →")
      3. "Projected at Retirement" — `fmtFull(projectedAtRetirement)` or "—"
      4. "Target Year" — `targetYear` or "—"
  - On/off track badge (only shown when both nestEgg and projectedAtRetirement are non-null):
      - On track: green badge with checkmark "On Track"
      - Off track: red badge "Off Track"
      - Badge uses text + color (not color alone), consistent with accessibility requirement
  - Gap analysis (only when `gapAmount != null`):
      - On track: `<p className={styles.gapPositive}>You are {fmtFull(gapAmount)} ahead of your target.</p>`
      - Off track + `additionalNeeded != null`:
          `<p className={styles.gapNegative}>You need {fmtFull(gapAmount)} more. Increase contributions by {fmtFull(additionalNeeded)}/month to close the gap.</p>`
      - Off track, no contribution suggestion (zero return rate edge): show shortfall only
  - If `!hasSettings`:
      `<p className={styles.setupPrompt}>Set your desired retirement income in <button onClick={onEditSettings}>retirement settings</button> to see gap analysis.</p>`
  - Edit settings link at bottom: `<button className={styles.editLink} onClick={onEditSettings}>Edit Retirement Settings</button>`
    (minimal style — text link appearance)
  - Import styles from `'./ForecastingSummary.module.css'`
  - Import `fmtFull` from `'../components/chartUtils.jsx'` — note: this component lives in components/ so path is `'./chartUtils.jsx'`
  - Import `PropTypes` from 'prop-types'
  - Export default `ForecastingSummary`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSummary.module.css
Lines: new file
Parallelism: independent
Description: Summary card grid styles.
Details:
  - `.container`: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; display: flex; flex-direction: column; gap: var(--sp-4);`
  - `.title`: `font-size: 14px; font-weight: 500; color: var(--text-primary); margin: 0;`
  - `.cardsGrid`: `display: grid; grid-template-columns: 1fr 1fr; gap: 12px;`
    `@media (max-width: 600px) { grid-template-columns: 1fr; }`
  - `.card`: `background: var(--bg-inset); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;`
  - `.cardLabel`: `font-size: 9px; font-weight: 400; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px;`
  - `.cardValue`: `font-size: 20px; font-weight: 400; color: var(--text-primary);`
    `@media (min-width: 768px) { font-size: 24px; }`
  - `.badge`: `display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;`
  - `.badgeOnTrack`: `background: rgba(46,204,138,0.15); color: var(--green);`
  - `.badgeOffTrack`: `background: rgba(255,90,122,0.15); color: var(--red);`
  - `.gapPositive`: `font-size: 13px; color: var(--green); margin: 0;`
  - `.gapNegative`: `font-size: 13px; color: var(--red); margin: 0;`
  - `.setupPrompt`: `font-size: 13px; color: var(--text-muted); margin: 0;`
  - `.setupPrompt button`: `background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 13px; text-decoration: underline;`
  - `.editLink`: `background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; text-align: left; font-weight: 500;`
  - `.editLink:hover`: `color: var(--accent-light);`
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSetup.jsx
Lines: new file
Parallelism: independent
Description: Inline retirement settings setup form shown only when no settings exist. Minimal form (4 required fields + advanced toggle). Saves via saveRetirement(). Follows RetirementPanel form pattern for field layout and CSS class names, but has no MilestoneEditor.
Details:
  - Props (with PropTypes):
      - `onSave: func` — called after successful save with the saved settings data
      - `loading: bool`
      - `error: string | null`
  - Local state: `currentAge`, `targetAge`, `desiredIncome`, `monthlyContrib` (all string, empty default)
  - Local state: `returnPct`, `ssAnnual`, `withdrawalRate` (advanced fields, string defaults '' / '4.0')
  - Local state: `showAdvanced` (bool, default false)
  - `handleSave` async function:
      - Validates: currentAge and targetAge required, targetAge > currentAge (show inline error if not)
      - Calls `saveRetirement({...})` with same payload shape as RetirementPanel.handleSave
        (no milestones field needed — backend defaults it to [])
      - On success: calls `onSave(savedData)` — parent re-fetches
      - On error: sets local error state
  - Renders:
      - Container card with title "Set Up Retirement Projections"
      - Subtitle: "Enter your details to see your investable capital projection."
      - 2-col grid (same `.grid` pattern as RetirementPanel):
          - Current age input
          - Target retirement age input
          - Desired annual income input
          - Monthly contribution input
      - Advanced toggle button (same pattern as RetirementPanel)
      - If showAdvanced: 3-col grid with expected return, social security, withdrawal rate
      - If error: error message div
      - Save button (primary style, disabled when loading)
  - Import `saveRetirement` from `'../api.js'`
  - Import `fetchRetirement` from `'../api.js'`
  - Import styles from `'./ForecastingSetup.module.css'`
  - Import `PropTypes` from 'prop-types'
  - Export default `ForecastingSetup`
  - Note: does NOT import or reuse RetirementPanel. Uses same CSS class names for consistency.
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSetup.module.css
Lines: new file
Parallelism: independent
Description: Minimal setup form card styles — reuses same visual patterns as RetirementPanel.module.css.
Details:
  - `.container`: same as RetirementPanel — `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;`
  - `.title`: `font-size: 16px; font-weight: 500; color: var(--text-primary); margin: 0;`
  - `.subtitle`: `font-size: 13px; color: var(--text-secondary); margin: 0;`
  - `.grid`: identical to RetirementPanel.module.css `.grid`
  - `.fieldLabel`: identical to RetirementPanel.module.css `.fieldLabel`
  - `.input`: identical to RetirementPanel.module.css `.input` (including focus state)
  - `.toggleBtn`: identical to RetirementPanel.module.css `.toggleBtn`
  - `.actions`: identical to RetirementPanel.module.css `.actions`
  - `.btnPrimary`: identical to RetirementPanel.module.css `.btnPrimary`
  - `.errorMsg`: `color: var(--color-negative); font-size: 13px; padding: 8px 12px; border-radius: 6px;`
  - Note: do not import from RetirementPanel.module.css — CSS Modules do not allow cross-module class sharing. Copy the styles.
```

---

### Track C — Page and Routing (depends-on: Track A + Track B)

---

```
File: /home/user/stashtrend/frontend/src/nav.js
Lines: 9-15 (NAV_ITEMS array)
Parallelism: independent (no code dependencies — just a data change)
Description: Add /forecasting entry after /networth in NAV_ITEMS.
Details:
  - Current array has 5 entries. Insert new entry at index 1 (after '/networth'):
    `{ path: '/forecasting', label: 'Forecasting', icon: '🔮' }`
  - Result: Net Worth → Forecasting → Account Groups → Budgets → Budget Builder → Sync Data
  - No other changes to this file.
```

```
File: /home/user/stashtrend/frontend/src/App.jsx
Lines: 1-13 (imports) and 35-45 (Routes block)
Parallelism: depends-on: ForecastingPage.jsx (must exist before import is valid)
Description: Add import and Route for ForecastingPage.
Details:
  - Add import after line 11 (after SyncPage import):
    `import ForecastingPage from './pages/ForecastingPage.jsx'`
  - In the Routes block (currently lines 36-43), insert after the '/networth' Route:
    `<Route path="/forecasting" element={<ForecastingPage />} />`
  - Result Routes block:
    ```jsx
    <Route path="/"           element={<Navigate to="/networth" replace />} />
    <Route path="/networth"   element={<NetWorthPage />} />
    <Route path="/forecasting" element={<ForecastingPage />} />
    <Route path="/groups"     element={<GroupsPage />} />
    <Route path="/budgets"    element={<BudgetPage />} />
    <Route path="/builder"    element={<BudgetBuilderPage />} />
    <Route path="/sync"       element={<SyncPage />} />
    <Route path="*"           element={<Navigate to="/networth" replace />} />
    ```
  - No other changes to this file.
```

```
File: /home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx
Lines: new file
Parallelism: depends-on: retirementMath.js (new functions), ForecastingChart.jsx, ForecastingControls.jsx, ForecastingSummary.jsx, ForecastingSetup.jsx
Description: Top-level page component. Fetches data, manages slider state, computes all derived values via useMemo, passes props to presentational children. Follows NetWorthPage pattern exactly.
Details:
  - Imports:
      - `{ useEffect, useState, useCallback, useMemo }` from 'react'
      - `styles` from `'./ForecastingPage.module.css'`
      - `ForecastingChart` from `'../components/ForecastingChart.jsx'`
      - `ForecastingControls` from `'../components/ForecastingControls.jsx'`
      - `ForecastingSummary` from `'../components/ForecastingSummary.jsx'`
      - `ForecastingSetup` from `'../components/ForecastingSetup.jsx'`
      - `{ fetchNetworthByType, fetchRetirement, saveRetirement }` from `'../api.js'`
      - `{ getInvestableCapital, computeBlendedCAGR, computeNestEgg, generateProjectionSeries, mergeHistoryWithProjection, calculateContributionToTarget }` from `'../utils/retirementMath.js'`
      - `{ useNavigate }` from 'react-router-dom' (for "Edit Settings" navigation to /networth)

  - State:
      - `typeData` (null), `retirement` (null), `loading` (true), `error` (null), `lastUpdated` (null)
      - `contribution` (number) — slider value, initialized from retirement settings
      - `returnRate` (number) — slider value, initialized from retirement settings / blended CAGR
      - `defaultContribution` (number) — initial default for reset
      - `defaultReturnRate` (number) — initial default for reset
      - `setupLoading` (bool), `setupError` (string|null) — for ForecastingSetup save

  - `loadData()` function (not useCallback — called in useEffect and on refresh):
      ```js
      function loadData() {
        setError(null)
        setLoading(true)
        Promise.all([
          fetchNetworthByType(),
          fetchRetirement().catch(() => ({ exists: false })),
        ])
          .then(([td, ret]) => {
            setTypeData(td)
            setRetirement(ret)
            setLastUpdated(new Date().toLocaleTimeString())
            // Initialize slider defaults
            const blendedCAGR = computeBlendedCAGR(td)
            const savedReturn = ret?.exists ? (ret.expected_return_pct ?? null) : null
            const initReturn = savedReturn ?? blendedCAGR
            const clampedReturn = Math.min(15, Math.max(0, initReturn))
            const initContrib = ret?.exists ? (ret.monthly_contribution ?? 0) : 0
            setContribution(initContrib)
            setReturnRate(clampedReturn)
            setDefaultContribution(initContrib)
            setDefaultReturnRate(clampedReturn)
          })
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false))
      }
      ```

  - `useEffect(() => { loadData() }, [])` — mount only

  - `handleReset = useCallback(() => { setContribution(defaultContribution); setReturnRate(defaultReturnRate) }, [defaultContribution, defaultReturnRate])`

  - `handleSetupSave = useCallback(async (data) => { ... })`:
      - `setSetupLoading(true); setSetupError(null)`
      - try: `await saveRetirement(data); const updated = await fetchRetirement(); setRetirement(updated)`
        re-initialize slider defaults from `updated` (same logic as loadData)
      - catch: `setSetupError(err.message || 'Failed to save')`
      - finally: `setSetupLoading(false)`

  - `navigate = useNavigate()` — for "Edit Settings" link
  - `handleEditSettings = useCallback(() => navigate('/networth'), [navigate])`

  - Derived values via `useMemo`:

      ```js
      const investableCapital = useMemo(() => getInvestableCapital(typeData), [typeData])

      const blendedCAGR = useMemo(() => computeBlendedCAGR(typeData), [typeData])

      const historicalSeries = useMemo(() => {
        if (!typeData?.series?.length) return []
        return typeData.series.map(pt => ({
          date: pt.date,
          net_worth: (pt.Retirement ?? 0) + (pt.Brokerage ?? 0)
        }))
      }, [typeData])

      const years = useMemo(() => {
        if (!retirement?.exists) return null
        const y = (retirement.target_retirement_age ?? 0) - (retirement.current_age ?? 0)
        return y > 0 ? y : null
      }, [retirement])

      const targetYear = useMemo(() => {
        if (!years) return null
        return new Date().getFullYear() + years
      }, [years])

      const nestEgg = useMemo(() => {
        if (!retirement?.exists) return null
        return computeNestEgg(
          retirement.desired_annual_income ?? null,
          retirement.social_security_annual ?? 0,
          retirement.withdrawal_rate_pct ?? 4.0
        )
      }, [retirement])

      // Variant contributions — round to nearest $100 step
      const plus10Contrib = useMemo(() => Math.round(contribution * 1.1 / 100) * 100, [contribution])
      const minus10Contrib = useMemo(() => Math.round(contribution * 0.9 / 100) * 100, [contribution])
      // Suppress variants when $0 contribution or when rounded values equal baseline
      const showVariants = useMemo(() =>
        contribution > 0 && plus10Contrib !== contribution && minus10Contrib !== contribution,
        [contribution, plus10Contrib, minus10Contrib])

      const baselineProjection = useMemo(() => {
        if (investableCapital == null || !years) return []
        return generateProjectionSeries({
          currentNetWorth: investableCapital,
          monthlyContribution: contribution,
          annualReturnPct: returnRate,
          years,
        })
      }, [investableCapital, contribution, returnRate, years])

      const plus10Projection = useMemo(() => {
        if (!showVariants || investableCapital == null || !years) return []
        return generateProjectionSeries({
          currentNetWorth: investableCapital,
          monthlyContribution: plus10Contrib,
          annualReturnPct: returnRate,
          years,
        })
      }, [showVariants, investableCapital, plus10Contrib, returnRate, years])

      const minus10Projection = useMemo(() => {
        if (!showVariants || investableCapital == null || !years) return []
        return generateProjectionSeries({
          currentNetWorth: investableCapital,
          monthlyContribution: minus10Contrib,
          annualReturnPct: returnRate,
          years,
        })
      }, [showVariants, investableCapital, minus10Contrib, returnRate, years])

      // Merge all projection data into one dataset for the chart
      const mergedChartData = useMemo(() => {
        if (!baselineProjection.length && !historicalSeries.length) return []
        // Start from historical series, merge baseline projection
        let merged = mergeHistoryWithProjection(historicalSeries, baselineProjection)
        // Add plus10/minus10 keys by date lookup
        if (showVariants) {
          const plus10Map = new Map(plus10Projection.map(p => [p.date, p.projected_net_worth]))
          const minus10Map = new Map(minus10Projection.map(p => [p.date, p.projected_net_worth]))
          merged = merged.map(pt => ({
            ...pt,
            projected_plus10: plus10Map.get(pt.date) ?? null,
            projected_minus10: minus10Map.get(pt.date) ?? null,
          }))
        }
        return merged
      }, [historicalSeries, baselineProjection, plus10Projection, minus10Projection, showVariants])

      const projectedAtRetirement = useMemo(() =>
        baselineProjection.length ? baselineProjection[baselineProjection.length - 1].projected_net_worth : null,
        [baselineProjection])

      const neededContribution = useMemo(() => {
        if (!nestEgg || projectedAtRetirement == null || projectedAtRetirement >= nestEgg || !years) return null
        return calculateContributionToTarget({
          currentNetWorth: investableCapital ?? 0,
          currentContribution: contribution,
          annualReturnPct: returnRate,
          years,
          targetAmount: nestEgg,
        })
      }, [nestEgg, projectedAtRetirement, years, investableCapital, contribution, returnRate])
      ```

  - CAGR warning and notes (computed with useMemo or inline in JSX):
      - `cagrWarning`:
          - If blendedCAGR < 0: `"Your historical return rate is negative. Projections assume continued decline unless adjusted."`
          - If retirement?.exists && retirement.expected_return_pct != null && retirement.expected_return_pct > 15:
            `"Your historical CAGR of X% exceeds the slider range. Adjust manually if needed."`
          - Else null
      - `defaultsNote`: if blendedCAGR was used (no `expected_return_pct` in settings):
          short string like `"Default based on your historical return rate."`

  - Contribution slider max: `contributionMax = Math.max(10000, (defaultContribution ?? 0) * 2)`

  - Edge case checks (computed with useMemo):
      - `hasNoInvestmentAccounts`: `investableCapital === 0 || investableCapital == null`
        (show empty state instead of chart when AND typeData loaded successfully)
      - `isRetirementTargetInvalid`: `retirement?.exists && years != null && years <= 0`

  - Screen reader summary string:
      `srSummary = projectedAtRetirement != null ? \`Projected investable capital at retirement: ${fmtFull(projectedAtRetirement)}. ${isOnTrack ? 'On track' : 'Off track'}.\` : ''`
      where `isOnTrack = projectedAtRetirement != null && nestEgg != null && projectedAtRetirement >= nestEgg`

  - JSX structure (top to bottom):
      ```jsx
      <div>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Forecasting</h1>
          <div className={styles.pageActions}>
            {lastUpdated && <span className={styles.updatedAt}>Updated at {lastUpdated}</span>}
            <button className={styles.refreshBtn} onClick={loadData}>↻ Refresh</button>
          </div>
        </div>

        {/* Loading */}
        {loading && <div data-testid="forecasting-loading" className={styles.loading}>Loading…</div>}

        {/* Error */}
        {!loading && error && (
          <div className={styles.errorBox}>
            ... (same structure as NetWorthPage error box)
            <button className={styles.retryBtn} onClick={loadData}>Try Again</button>
          </div>
        )}

        {/* Main content — only when loaded and no error */}
        {!loading && !error && (
          <div className={styles.content}>
            {/* First-time setup gate */}
            {!retirement?.exists && (
              <ForecastingSetup
                onSave={handleSetupSave}
                loading={setupLoading}
                error={setupError}
              />
            )}

            {/* Invalid target age edge case */}
            {isRetirementTargetInvalid && (
              <div className={styles.infoBox} data-testid="invalid-age-warning">
                Your target retirement age is at or before your current age. Update your retirement settings.
              </div>
            )}

            {/* Empty state — no investment accounts */}
            {!isRetirementTargetInvalid && hasNoInvestmentAccounts && typeData != null && (
              <div className={styles.emptyState} data-testid="no-investment-accounts">
                No investment accounts found. Sync your retirement or brokerage accounts to see projections.
              </div>
            )}

            {/* Controls + Chart + Summary — only when we have investable capital and valid years */}
            {!isRetirementTargetInvalid && !hasNoInvestmentAccounts && (
              <>
                <ForecastingControls
                  contribution={contribution}
                  returnRate={returnRate}
                  onContributionChange={setContribution}
                  onReturnRateChange={setReturnRate}
                  onReset={handleReset}
                  contributionMax={contributionMax}
                  defaultsNote={defaultsNote}
                  cagrWarning={cagrWarning}
                />
                <ForecastingChart
                  chartData={mergedChartData}
                  nestEgg={nestEgg}
                  showVariants={showVariants}
                  retirementYear={targetYear}
                  srSummary={srSummary}
                />
                <ForecastingSummary
                  investableCapital={investableCapital}
                  nestEgg={nestEgg}
                  projectedAtRetirement={projectedAtRetirement}
                  targetYear={targetYear}
                  neededContribution={neededContribution}
                  currentContribution={contribution}
                  onEditSettings={handleEditSettings}
                  hasSettings={!!retirement?.exists}
                />
              </>
            )}
          </div>
        )}
      </div>
      ```
  - Export default `ForecastingPage`
```

```
File: /home/user/stashtrend/frontend/src/pages/ForecastingPage.module.css
Lines: new file
Parallelism: independent (can write CSS before page JSX is finalized)
Description: Page-level layout styles following NetWorthPage.module.css exactly.
Details:
  - `.pageHeader`, `.pageTitle`, `.pageActions`, `.updatedAt`, `.refreshBtn`, `.loading`:
    Copy exactly from NetWorthPage.module.css (lines 1-75). These are consistent page-level patterns.
  - `.errorBox`, `.errorTitle`, `.errorMsg`, `.errorCode`, `.errorDetail`:
    Copy from NetWorthPage.module.css (lines 77-126).
  - `.retryBtn`: `background: var(--accent); color: var(--bg-root); border: none; border-radius: var(--radius-md); padding: 8px 20px; font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 12px;`
  - `.content`: `display: flex; flex-direction: column; gap: var(--sp-5);`
    This wraps all content sections, providing consistent vertical spacing between cards.
  - `.infoBox`: `background: var(--bg-info); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 20px; color: var(--text-secondary); font-size: 14px;`
  - `.emptyState`: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--sp-10) var(--sp-6); text-align: center; color: var(--text-muted); font-size: 14px;`
```

---

### Track D — Tests (can begin in parallel with implementation once signatures are known)

```
File: /home/user/stashtrend/frontend/src/utils/retirementMath.test.js
Lines: append after line 145 (end of file)
Parallelism: independent (signatures fully defined in this plan)
Description: Add test suites for the three new utility functions. Follow existing describe/it/expect pattern in the file.
Details: (see Test Strategy section for full test list)
```

```
File: /home/user/stashtrend/frontend/src/components/SliderInput.test.jsx
Lines: new file
Parallelism: independent
Description: Unit tests for SliderInput component.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingControls.test.jsx
Lines: new file
Parallelism: independent
Description: Unit tests for ForecastingControls component.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingChart.test.jsx
Lines: new file
Parallelism: independent
Description: Unit tests for ForecastingChart component.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSummary.test.jsx
Lines: new file
Parallelism: independent
Description: Unit tests for ForecastingSummary component.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSetup.test.jsx
Lines: new file
Parallelism: independent
Description: Unit tests for ForecastingSetup component.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/pages/ForecastingPage.test.jsx
Lines: new file
Parallelism: depends-on: ForecastingPage.jsx (mocks its child components, tests page behavior)
Description: Page-level tests following NetWorthPage.test.jsx pattern exactly — mock all child components, test loading/error/data-loaded states, data fetching, slider initialization.
Details: (see Test Strategy section)
```

```
File: /home/user/stashtrend/frontend/src/test/fixtures.js
Lines: append after line 335 (end of file)
Parallelism: independent
Description: Add MOCK_RETIREMENT_FORECASTING fixture (retirement settings with all fields for forecasting tests).
Details:
  - Add constant `MOCK_RETIREMENT_FORECASTING` — same as MOCK_RETIREMENT but with clearer variable name indicating it's used for forecasting page tests. Can reuse MOCK_RETIREMENT; no new fixture strictly needed unless test data diverges.
  - Ensure MOCK_NETWORTH_BY_TYPE has enough series points (already has 3 — sufficient)
  - No changes to existing fixtures needed — they already cover the needed data shapes.
```

---

## Dependency Order

### Strict Execution Order

1. **Tier 1 (fully independent — run all in parallel):**
   - `retirementMath.js` (new functions)
   - `nav.js` (simple data change, no code deps)
   - `SliderInput.jsx` + `SliderInput.module.css`
   - `ForecastingChart.jsx` + `ForecastingChart.module.css`
   - `ForecastingSummary.jsx` + `ForecastingSummary.module.css`
   - `ForecastingSetup.jsx` + `ForecastingSetup.module.css`
   - `ForecastingPage.module.css`
   - All test files except `ForecastingPage.test.jsx`

2. **Tier 2 (depends on Tier 1):**
   - `RetirementPanel.jsx` (refactor) — depends on `retirementMath.js` new functions
   - `ForecastingControls.jsx` + `ForecastingControls.module.css` — depends on `SliderInput.jsx`
   - `ForecastingPage.jsx` — depends on all component files + `retirementMath.js`

3. **Tier 3 (depends on Tier 2):**
   - `App.jsx` — depends on `ForecastingPage.jsx` existing
   - `ForecastingPage.test.jsx` — depends on `ForecastingPage.jsx` existing

### Parallelism Summary for Implementer Agents

**Agent 1 (Math utilities):** `retirementMath.js` new functions → `RetirementPanel.jsx` refactor

**Agent 2 (Presentational components):** In parallel — `SliderInput`, `ForecastingControls`, `ForecastingChart`, `ForecastingSummary`, `ForecastingSetup` (all JSX + CSS modules)

**Agent 3 (Page + routing):** After Agents 1 and 2 complete — `ForecastingPage.jsx`, `App.jsx`, `nav.js`

**Agent 4 (Tests):** In parallel with Agents 1-3 — all test files except `ForecastingPage.test.jsx`; that test file waits for Agent 3

---

## Test Strategy

### Unit Tests: `retirementMath.test.js` (append to existing file)

**`getInvestableCapital` suite (6 tests):**
- Returns `null` when `typeData` is null
- Returns `null` when `typeData.series` is empty array
- Returns correct sum when both Retirement and Brokerage present
- Returns Retirement only (treating Brokerage as 0) when Brokerage key missing from latest point
- Returns Brokerage only (treating Retirement as 0) when Retirement key missing from latest point
- Uses only the LAST series point (not sum of all points)

**`computeBlendedCAGR` suite (8 tests):**
- Returns 7.0 when both CAGR null (no history)
- Returns Retirement CAGR when Brokerage CAGR null
- Returns Brokerage CAGR when Retirement CAGR null
- Uses balance-weighted average when both present: verify formula with known values
- Prefers 5Y > 3Y > 1Y per bucket independently (test: Retirement has 5Y, Brokerage only 1Y — each uses its longest)
- Edge case: both balances are 0, both CAGRs present — uses simple average
- Edge case: total balance 0 but only one CAGR — returns that one CAGR
- Handles null `typeData` gracefully (returns 7.0)

**`calculateContributionToTarget` suite (8 tests):**
- Returns `currentContribution` when `projectedAtRetirement >= targetAmount` (already on track)
- Returns null when `years <= 0`
- Returns null when `targetAmount` is null
- Correct closed-form result for known inputs (spot-check: $0 current, 7% return, 30 years, $1M target)
- `r === 0` path: pure contribution without growth math — returns correct ceil-to-$100 result
- Result is always a multiple of 100 (ceiling to nearest $100)
- Result >= currentContribution (never suggests reducing contributions)
- Edge case: shortfall is 0 (lump sum growth covers target) — returns currentContribution

### Unit Tests: `SliderInput.test.jsx` (new file)

**Pattern:** `render(<SliderInput ...>)`, then use `screen`, `fireEvent`. Mock `useEffect` is not needed — test behavior directly.

- Renders label text correctly
- Range input has correct min, max, step attributes
- Text input displays formatted value from `format` prop
- Changing range input calls `onChange` with numeric value
- Typing in text input and blurring calls `onChange` with parsed, clamped value
- Out-of-range text input value is clamped to min on blur
- Out-of-range text input value is clamped to max on blur
- Non-numeric text input: `onChange` called with clamped fallback (not NaN)
- Tab accessibility: both inputs are focusable

### Unit Tests: `ForecastingControls.test.jsx` (new file)

- Renders both slider labels ("Monthly Contribution", "Annual Return Rate")
- Renders Reset button
- Clicking Reset calls `onReset`
- `defaultsNote` prop renders helper text when provided
- `cagrWarning` prop renders warning text when provided
- `cagrWarning` does not render when null
- Contribution slider change calls `onContributionChange` with new value
- Return rate slider change calls `onReturnRateChange` with new value

### Unit Tests: `ForecastingChart.test.jsx` (new file)

**Pattern:** Mock Recharts entirely (vi.mock) to avoid SVG rendering issues in jsdom — same approach as other chart test files.

- Renders container when `chartData` is provided
- Does not render variant Lines when `showVariants=false`
- Does not render ReferenceLine when `nestEgg` is null
- Renders ReferenceLine when `nestEgg` is provided
- Renders RangeSelector with FORECASTING_RANGES options
- Renders `srSummary` text in the sr-only element

### Unit Tests: `ForecastingSummary.test.jsx` (new file)

- Renders all 4 metric cards (investable capital, nest egg, projected, target year)
- Shows "On Track" badge when projectedAtRetirement >= nestEgg
- Shows "Off Track" badge when projectedAtRetirement < nestEgg
- Shows positive gap message when on track
- Shows negative gap message + contribution suggestion when off track
- Does not show contribution suggestion when neededContribution is null
- Shows setup prompt when `hasSettings=false` and nestEgg is null
- "Edit Retirement Settings" button calls `onEditSettings`
- Shows "—" for null values (investableCapital null, nestEgg null, projectedAtRetirement null)

### Unit Tests: `ForecastingSetup.test.jsx` (new file)

- Renders 4 required input fields
- Does not show advanced fields by default
- Clicking "Advanced settings" toggle shows advanced fields
- Clicking toggle again hides advanced fields
- Clicking Save calls `saveRetirement` with correct payload shape
- Disables Save button when `loading=true`
- Shows error message when `error` prop is set
- Validation: does not call saveRetirement when currentAge is empty (shows error)
- Validation: does not call saveRetirement when targetAge <= currentAge

### Page Tests: `ForecastingPage.test.jsx` (new file)

**Pattern:** Mock all child components. Mock `fetchNetworthByType` and `fetchRetirement`. Follow NetWorthPage.test.jsx exactly.

```js
vi.mock('../components/ForecastingChart.jsx',    () => ({ default: () => <div data-testid="forecasting-chart" /> }))
vi.mock('../components/ForecastingControls.jsx', () => ({ default: () => <div data-testid="forecasting-controls" /> }))
vi.mock('../components/ForecastingSummary.jsx',  () => ({ default: () => <div data-testid="forecasting-summary" /> }))
vi.mock('../components/ForecastingSetup.jsx',    () => ({ default: () => <div data-testid="forecasting-setup" /> }))
```

Tests:
- Shows loading state before data arrives (`data-testid="forecasting-loading"`)
- Renders chart + controls + summary after data loads (settings exist)
- Shows ForecastingSetup when retirement `exists: false`
- Does NOT show chart/controls/summary when ForecastingSetup is shown (settings absent)
- Shows error state when API fetch fails
- Retry button in error state triggers re-fetch
- Renders Refresh button; clicking re-fetches data
- Shows "Updated at" timestamp after data loads
- Shows empty state when investableCapital is 0 (MOCK_NETWORTH_BY_TYPE with zero Retirement+Brokerage)
- Shows invalid-age warning when targetAge <= currentAge in settings
- Fetches exactly 2 endpoints on mount: `/api/networth/by-type` and `/api/retirement`
- Does not crash when retirement API rejects (graceful `.catch(() => ({ exists: false }))`)

### Existing Tests That Must Not Break

- `retirementMath.test.js` — all existing tests pass unchanged (new functions are additions, not modifications)
- `RetirementPanel.test.jsx` — all tests pass; the refactor replaces an inline IIFE with a function call that returns the same value
- `NetWorthPage.test.jsx` — no changes to NetWorthPage, all pass
- `App.test.jsx` — may need updating if it tests the exact number of routes or route paths; add a test case for `/forecasting` if routing tests exist
- `Sidebar.test.jsx` and `BottomTabBar.test.jsx` — these iterate NAV_ITEMS; adding a 6th item will change rendered output. Check these test files for snapshot tests or exact item counts; update expected counts/items accordingly.

---

## Rollback Notes

All changes are additive except two small modifications:
1. `retirementMath.js` — additions only. Rollback: delete the three new functions.
2. `RetirementPanel.jsx` — one-line refactor. Rollback: restore the 5-line IIFE at lines 42-48 and revert the import.
3. `nav.js` — one array entry. Rollback: remove the `/forecasting` entry.
4. `App.jsx` — one import + one Route. Rollback: remove both.

New files created (12 total): Delete all `Forecasting*.jsx`, `Forecasting*.module.css`, `SliderInput.jsx`, `SliderInput.module.css`, and their test counterparts.

No database migrations. No backend changes. No data loss risk.

If a partial rollback is needed (e.g., keep utility functions but remove the page): remove only `ForecastingPage.jsx`, the Route in `App.jsx`, and the NAV_ITEMS entry in `nav.js`. The utility functions and components remain dormant and do not affect other pages.
