# Implementation Plan — Phase 2.1: Dual-View Milestone Hero Card

**Date:** 2026-03-10
**Status:** Final — ready for implementation
**Inputs:** phase2.1-requirements-impl.md, phase2.1-research-impl.md, phase2.1-architecture.md, phase2.1-design-spec.md, codebase survey

---

## Overview

This plan adds a `MilestoneHeroCard` component between `TypeStackedChart` and `AccountsBreakdown` on the Net Worth page. The card has two views — Dashboard Cards (a grid of milestone progress cards) and Mountain Skyline (a Recharts area chart) — toggled by a two-button segmented control reusing the `RangeSelector` visual pattern.

All milestone derivation logic (investable capital, progress ratios, state classification, achievement date scan, projection dates) lives in a new `useMilestoneData` hook backed by pure utility functions in `milestoneUtils.js`. Both views receive fully computed data via props. The existing buggy `<ReferenceLine>` loop is removed from `TypeStackedChart`.

The architecture note from the architect about `mergeHistoryWithProjection` is important: that function uses a `net_worth` key on the history side. For the milestone chart we need a different key (`investableCapital`) on the history side, so the hook builds the merged series manually using the same Map-merge logic rather than calling `mergeHistoryWithProjection` directly.

`COLOR_AMBER` and `COLOR_ACCENT_LIGHT` already exist in `chartUtils.jsx` (`COLOR_AMBER = '#F5A623'` is present at line 119; `COLOR_ACCENT_LIGHT` does not exist and must be added). The recharts mock file needs a `Customized` export added for the today-dot overlay.

---

## Changes

### Group A — Foundation (independent, no dependencies)

These files can be created or modified in parallel by different implementer agents.

---

```
File: frontend/src/utils/milestoneUtils.js
Lines: new file
Parallelism: independent
Description: Pure functions for milestone data derivation. No React. Fully unit-testable in isolation.
Details:
  - Export sortMilestones(milestones): sorts [{label, amount}] ascending by amount using a new array (no mutation).
  - Export computeInvestableCapital(typeDataSeries): takes the full typeData.series array, returns (latest.Retirement ?? 0) + (latest.Brokerage ?? 0), or 0 if series is empty or falsy. Comment cross-referencing RetirementPanel.jsx line 44.
  - Export buildInvestableSeries(typeDataSeries): maps each series point to {date, value: (d.Retirement ?? 0) + (d.Brokerage ?? 0)}.
  - Export classifyMilestones(sortedMilestones, investableCapital, nestEgg): accepts sorted milestone array (plus optional nestEgg appended as {label: 'Nest Egg', amount: nestEgg, isNestEgg: true}). Returns enriched array with added fields: progress (capped 0–1), state ('achieved'|'in-progress'|'future'), isNestEgg. State rules: achieved = investableCapital >= amount; in-progress = first unachieved; future = all subsequent unachieved.
  - Export findAchievementDate(investableSeries, amount): scans [{date, value}] for the first point where value >= amount. Returns formatted string "Mon 'YY" (e.g. "Jan '24") or null. Uses formatDateShort() helper. Note: if all series points are below amount, returns null. If the first point already exceeds amount, returns the formatted first date (account data imported mid-history limitation — add a code comment).
  - Export findProjectedDate(projectionSeries, amount): scans [{date, projected_net_worth}] for first point where projected_net_worth >= amount. Returns "Mon 'YY" or null. Returns "50+ yrs" when the series is capped at 50 years and no crossing is found.
  - Export formatDateShort(isoDateStr): converts "2024-01-01" to "Jan '24". Uses new Date(isoDateStr + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', year: '2-digit'}). Returns result formatted as `${month} '${year}`.
  - Export buildMergedSeries(investableSeries, projectionSeries): Map-merge of investable series with projection series — same logic as mergeHistoryWithProjection in retirementMath.js but using key names {date, investableCapital, projectedCapital} instead of {date, net_worth, projected_net_worth}. Sorts by date. Historical points: {date, investableCapital: value}. Projection points: {date, projectedCapital}. Overlap: both keys present.

Key function signatures:
  export function sortMilestones(milestones: Array<{label: string, amount: number}>): Array<{label: string, amount: number}>
  export function computeInvestableCapital(series: Array): number
  export function buildInvestableSeries(series: Array): Array<{date: string, value: number}>
  export function classifyMilestones(sorted: Array, ic: number, nestEgg: number|null): Array<EnrichedMilestone>
  export function findAchievementDate(investableSeries: Array, amount: number): string|null
  export function findProjectedDate(projectionSeries: Array, amount: number): string|null
  export function formatDateShort(isoDateStr: string): string
  export function buildMergedSeries(investableSeries: Array, projectionSeries: Array|null): Array
```

---

```
File: frontend/src/components/chartUtils.jsx
Lines: 116–119 (existing constants block)
Parallelism: independent
Description: Add COLOR_ACCENT_LIGHT constant for the projection line stroke. COLOR_AMBER already exists at line 119.
Details:
  - After line 119 (COLOR_AMBER = '#F5A623'), add:
      export const COLOR_ACCENT_LIGHT = '#7DBFFF'
  - Do not modify any other export.
```

---

```
File: frontend/__mocks__/recharts.jsx
Lines: 27 (after ReferenceLine export, end of file)
Parallelism: independent
Description: Add Customized stub for the today-dot SVG overlay used in MilestoneSkylineView.
Details:
  - Add after the existing ReferenceLine export:
      export const Customized = ({ children, ...props }) => <div data-testid="recharts-customized" {...props}>{typeof children === 'function' ? null : children}</div>
  - Note: Recharts <Customized> passes viewBox, xAxisMap, yAxisMap as function args to a render-prop children. The stub does not need to simulate those — jsdom tests will not render the custom dot.
```

---

### Group B — Hook (depends on Group A: milestoneUtils.js)

```
File: frontend/src/hooks/useMilestoneData.js
Lines: new file
Parallelism: depends-on: frontend/src/utils/milestoneUtils.js
Description: Custom hook that computes all derived milestone data consumed by both views. Uses useMemo to memoize expensive computations (series scan, projection generation).
Details:
  - Imports: useMemo from 'react'; computeNestEgg, generateProjectionSeries from '../utils/retirementMath.js'; sortMilestones, computeInvestableCapital, buildInvestableSeries, classifyMilestones, findAchievementDate, findProjectedDate, buildMergedSeries from '../utils/milestoneUtils.js'.
  - Function signature: export function useMilestoneData(typeData, retirement)
  - shouldRender guard: returns early object {shouldRender: false, ...nullFields} when: (a) !typeData?.series?.length, (b) !retirement?.exists, (c) !retirement?.milestones?.length. This handles EC-1, EC-2, EC-12.
  - investableCapital: useMemo(() => computeInvestableCapital(typeData?.series ?? []), [typeData]). Apply Math.max(0, result) for EC-9 (negative IC treated as zero for progress calcs — but store the raw value separately for chart rendering). Actually: store rawIC = computeInvestableCapital, investableCapital = Math.max(0, rawIC).
  - investableSeries: useMemo(() => buildInvestableSeries(typeData.series), [typeData]).
  - sortedMilestones: useMemo(() => sortMilestones(retirement.milestones), [retirement]).
  - nestEgg: useMemo(() => computeNestEgg(Number(retirement.desired_annual_income) || null, Number(retirement.social_security_annual) || 0, Number(retirement.withdrawal_rate_pct) || 0), [retirement]).
  - projectionSeries: useMemo(() => { if (!retirement.expected_return_pct) return null; return generateProjectionSeries({currentNetWorth: investableCapital, monthlyContribution: Number(retirement.monthly_contribution) || 0, annualReturnPct: Number(retirement.expected_return_pct), years: 50}); }, [investableCapital, retirement]). Caps at 50 years per EC-14.
  - achievementDates: useMemo(() => { map over sortedMilestones: findAchievementDate(investableSeries, m.amount) for each }, [investableSeries, sortedMilestones]).
  - projectedDates: useMemo(() => { if (!projectionSeries) return map of nulls; map over sortedMilestones + nestEgg: findProjectedDate(projectionSeries, amount) }, [projectionSeries, sortedMilestones, nestEgg]).
  - enrichedMilestones: useMemo(() => { milestones = classifyMilestones(sortedMilestones, investableCapital, nestEgg); merge in achievementDates and projectedDates per index. Nest egg item gets isNestEgg: true, label from retirement or "Nest Egg", achievedDate from the nestEgg amount scan on investableSeries. }, [sortedMilestones, investableCapital, nestEgg, achievementDates, projectedDates]).
  - achievedCount: enrichedMilestones.filter(m => m.state === 'achieved').length.
  - totalCount: enrichedMilestones.length.
  - mergedSeries: useMemo(() => buildMergedSeries(investableSeries, projectionSeries), [investableSeries, projectionSeries]).
  - Return object:
      { shouldRender: true, investableCapital, investableSeries, milestones: enrichedMilestones, achievedCount, totalCount, projectionSeries, mergedSeries, nestEgg }

Hook return type (JSDoc):
  @returns {{
    shouldRender: boolean,
    investableCapital: number,
    investableSeries: Array<{date: string, value: number}>,
    milestones: Array<{label: string, amount: number, progress: number, state: string, achievedDate: string|null, projectedDate: string|null, isNestEgg: boolean}>,
    achievedCount: number,
    totalCount: number,
    projectionSeries: Array|null,
    mergedSeries: Array,
    nestEgg: number|null,
  }}
```

---

### Group C — Presentational Components (independent of each other, depends-on Group A CSS tokens knowledge only)

These three component files can be implemented in parallel. They receive all data via props and have no direct dependency on the hook or Group B.

---

```
File: frontend/src/components/MilestoneCardsView.jsx
Lines: new file
Parallelism: independent
Description: Grid of milestone cards. Receives processed milestone array as prop. Renders MilestoneCard for each. No internal state.
Details:
  - Props: milestones (array of enriched milestone objects from useMilestoneData).
  - Renders <div className={styles.grid}> containing one MilestoneCard per milestone. The MilestoneCard is defined as an unexported inner component in this same file (not a separate file, because it is only ever used here). The architecture doc specifies MilestoneCard as a nested component; co-locating it avoids an extra file for a component with no independent consumer.
  - MilestoneCard inner component receives: {label, amount, progress, state, achievedDate, projectedDate, isNestEgg}
  - MilestoneCard renders (top to bottom per design spec Section 3):
    1. Header row (flex, space-between): status pill on left, checkmark SVG or percentage text on right.
    2. Eyebrow label: "Nest Egg Target" if isNestEgg, else "Milestone". Font: 9px, uppercase, letter-spacing: 2px, color: var(--text-muted).
    3. Milestone label text: truncated with text-overflow ellipsis.
    4. Dollar amount: fmtFull(amount) from chartUtils.jsx. Color varies by state.
    5. Progress bar track (role="progressbar", aria-valuenow, aria-valuemin="0", aria-valuemax="100", aria-label="{label} — {pct}% complete"). Inner fill div: style={{ width: `max(4px, ${progress * 100}%)` }}. Min 4px enforces EC-8.
    6. Status line (11px, var(--text-muted)):
       - Achieved: "Achieved " + <strong style={{color: 'var(--color-positive)'}}>{achievedDate}</strong>
       - In-progress/future with projectedDate: "$X.XM of $X.XM · Proj. " + <strong style={{color: stateColor}}>{projectedDate}</strong>
       - No projectedDate (EC-6): <span style={{color: 'var(--text-faint)'}}>Set expected return for projections</span>
       - EC-5 special case for nest egg card when all achieved: "Ahead of target" in var(--color-positive).
  - Status pills:
    - Achieved: className={styles.pillGreen}, text "✓ Achieved"
    - In-progress: className={styles.pillCobalt}, text "◆ Next Goal"
    - Future: className={styles.pillAmber}, text "→ In Progress"
  - Checkmark SVG (achieved only, aria-hidden="true"): SVG circle + path per design spec Section 3. 18×18px.
  - Percentage text (non-achieved): "{Math.round(progress * 100)}%" colored by state.
  - Card wrapper className: compose styles.card + conditional state class (styles.achieved / styles.inProgress / styles.future) + conditional styles.nestEggGlow if isNestEgg.
  - fmtFull import from '../components/chartUtils.jsx' (same directory, relative path).
  - PropTypes: milestones PropTypes.arrayOf with full shape. MilestoneCard also gets PropTypes.
  - EC-3 (IC=0): progress=0, bar shows 4px min width. Status line shows N/A if no projectedDate.
  - EC-9 (negative IC): treated as 0 by the hook before this component sees it.
  - EC-10 (single milestone): one card renders naturally in the 1fr 1fr grid, occupying one cell. No special case needed.

Key imports:
  import styles from './MilestoneCardsView.module.css'
  import { fmtFull } from './chartUtils.jsx'
  import PropTypes from 'prop-types'
```

---

```
File: frontend/src/components/MilestoneCardsView.module.css
Lines: new file
Parallelism: independent
Description: CSS module for the card grid and individual card anatomy. Contains all state-variant classes.
Details:
  - .grid: display grid; grid-template-columns 1fr on mobile; gap var(--sp-3).
  - @media (min-width: 768px) .grid: grid-template-columns 1fr 1fr.
  - .card: background var(--bg-card); border 1px solid var(--border); border-radius var(--radius-lg); padding 16px 18px; overflow hidden; transition border-color var(--ease-smooth).
  - .achieved: border-color rgba(46,204,138,0.25); background linear-gradient(135deg, var(--bg-card) 0%, #192B1F 100%).
  - .inProgress: border-color var(--border) (default, no override needed — but explicit for clarity).
  - .future: border-color var(--border).
  - .nestEggGlow: border-color rgba(77,159,255,0.4); box-shadow 0 0 20px rgba(77,159,255,0.12), var(--shadow-md). NOTE: when .nestEggGlow is combined with .achieved, the border-color from .nestEggGlow (rgba(77,159,255,0.4)) should win — order classes in JSX as styles.card + state class + styles.nestEggGlow so nestEggGlow comes last in specificity.
  - .cardHeader: display flex; align-items center; justify-content space-between; margin-bottom 10px.
  - .eyebrow: font-size 9px; font-weight 400; letter-spacing 2px; text-transform uppercase; color var(--text-muted); margin-bottom 4px.
  - .milestoneLabel: font-size 15px; font-weight 500; color var(--text-primary); margin-bottom 2px; overflow hidden; white-space nowrap; text-overflow ellipsis.
  - .amount: font-size 20px; font-weight 400; margin-bottom 10px. (color set via inline style or child state classes)
  - .amountAchieved: color var(--color-positive).
  - .amountInProgress: color var(--accent).
  - .amountFuture: color var(--color-warning).
  - .progressTrack: height 6px; background var(--bg-raised); border-radius var(--radius-pill); overflow hidden; margin-bottom var(--sp-2); position relative.
  - .progressFill: height 100%; border-radius var(--radius-pill). (width via inline style — data-driven).
  - .fillAchieved: background var(--color-positive).
  - .fillInProgress: background var(--accent).
  - .fillFuture: background var(--color-warning).
  - .statusLine: font-size 11px; color var(--text-muted).
  - .pillBase: border-radius var(--radius-pill); font-size 11px; font-weight 600; padding 3px 10px.
  - .pillGreen: composes pillBase; background var(--green-tint); color var(--green).
  - .pillCobalt: composes pillBase (or explicit rules); background var(--accent-tint); color var(--accent-light).
  - .pillAmber: background var(--amber-tint); color var(--amber).
  - .percentage: font-size 13px; font-weight 500. (color set via inline style by state).
  - .checkmark: width 18px; height 18px.
  NOTE: var(--green), var(--green-tint), var(--amber), var(--amber-tint) must exist in index.css. If they do not, use the hex literals rgba(46,204,138,0.12) and #2ECC8A inline instead. Verify before using. The design spec references these tokens assuming they exist. Add a code comment if falling back to hex.
```

---

```
File: frontend/src/components/MilestoneSkylineView.jsx
Lines: new file
Parallelism: independent
Description: Mountain Skyline Recharts area chart. Receives mergedSeries, milestones, investableCapital, hasProjection. No internal state.
Details:
  - Props: mergedSeries (Array<{date, investableCapital?, projectedCapital?}>), milestones (enriched array), investableCapital (number), hasProjection (boolean).
  - useResponsive hook: const {isMobile} = useResponsive() for chartHeight (220 mobile / 300 desktop) and yAxisWidth (52 mobile / 72 desktop).
  - Y-axis domain: compute highestTarget = Math.max(...milestones.map(m => m.amount), 0) * 1.08 with 8% headroom. If highestTarget is 0, use 'auto'. Pass as domain={[0, highestTarget]} on YAxis.
  - Today divider: find the last point in mergedSeries that has a defined investableCapital value (i.e., is historical). That point's date is the todayDate value for the vertical ReferenceLine.
  - Chart structure (AreaChart, not ComposedChart, since we need two Areas with different dataKeys):
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={mergedSeries} margin={{top: 20, right: isMobile ? 12 : 24, left: 10, bottom: 0}}>
          <defs>
            <linearGradient id="milestoneHistGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLOR_ACCENT} stopOpacity={0.25} />
              <stop offset="95%" stopColor={COLOR_ACCENT} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="milestoneProjGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_ACCENT_LIGHT} stopOpacity={0.12} />
              <stop offset="100%" stopColor={COLOR_ACCENT_LIGHT} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatDateLabel} interval="preserveStartEnd" tickCount={isMobile ? 3 : 5} />
          <YAxis tickFormatter={fmtCompact} tick={AXIS_TICK} tickLine={false} axisLine={false} width={yAxisWidth} domain={[0, highestTarget || 'auto']} />
          <Tooltip content={<SkylineTooltip />} />
          {/* Historical area — only renders where investableCapital is defined */}
          <Area type="monotone" dataKey="investableCapital" stroke={COLOR_ACCENT} strokeWidth={2.5} fill="url(#milestoneHistGrad)" dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
          {/* Projection area — only renders where projectedCapital is defined; shown only when hasProjection */}
          {hasProjection && <Area type="monotone" dataKey="projectedCapital" stroke={COLOR_ACCENT_LIGHT} strokeWidth={2} strokeDasharray="6 4" fill="url(#milestoneProjGrad)" dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />}
          {/* Today vertical divider */}
          {todayDate && <ReferenceLine x={todayDate} stroke={COLOR_ACCENT} strokeWidth={1.5} strokeOpacity={0.4} label={<TodayLabel />} />}
          {/* Milestone horizontal reference lines */}
          {milestones.map((m, i) => (
            <ReferenceLine key={`ms-${i}`} y={m.amount} stroke={m.state === 'achieved' ? COLOR_POSITIVE : (m.isNestEgg ? COLOR_ACCENT : COLOR_AMBER)} strokeWidth={1.5} strokeOpacity={m.state === 'achieved' ? 0.5 : 0.6} strokeDasharray={m.state === 'achieved' ? undefined : '4 3'} label={<MilestoneLabel milestone={m} index={i} total={milestones.length} isMobile={isMobile} />} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
  - TodayLabel component (defined inline in this file): renders SVG text "TODAY" at position "insideTopRight" per the Recharts label position API. Style: 9px, font-weight 600, fill COLOR_ACCENT, letter-spacing 1px. Uses a <g> element with <rect> background (fill rgba(77,159,255,0.15), rx=3) and <text>.
  - MilestoneLabel component (defined inline): receives {viewBox, milestone, index, total, isMobile}. Renders a <g> element at viewBox.x, viewBox.y - 4. For collision avoidance: if (index % 2 === 1), offset y by +14px (below the line) to stagger alternating labels. Truncate label text: isMobile ? milestone.label.slice(0,7) : milestone.label.slice(0,10). Color: achieved = COLOR_POSITIVE, isNestEgg = COLOR_ACCENT, else COLOR_AMBER. Renders <rect> + <text> pill at left edge of chart (x = viewBox.x, y adjusted).
  - SkylineTooltip: custom tooltip component. Shows date, investableCapital as "$X.XM", and projectedCapital if present. Reuses TOOLTIP_STYLE from chartUtils.jsx.
  - No-projection notice (EC-6): when !hasProjection, render a <p className={styles.noProjectionNotice}> below the ResponsiveContainer. Text: "Set expected return in Retirement Settings to see projected trajectory".
  - EC-6 edge case: the chart still renders historical area without the projection Area component.
  - EC-14: projectionSeries is already capped at 50 years by useMilestoneData hook, so no additional cap needed here.

Key imports:
  import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
  import { useResponsive } from '../hooks/useResponsive.js'
  import { fmtCompact, formatDateLabel, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, COLOR_ACCENT, COLOR_ACCENT_LIGHT, COLOR_POSITIVE, COLOR_AMBER } from './chartUtils.jsx'
  import styles from './MilestoneSkylineView.module.css'
  import PropTypes from 'prop-types'

PropTypes:
  MilestoneSkylineView.propTypes = {
    mergedSeries: PropTypes.array.isRequired,
    milestones: PropTypes.array.isRequired,
    investableCapital: PropTypes.number.isRequired,
    hasProjection: PropTypes.bool.isRequired,
  }
```

---

```
File: frontend/src/components/MilestoneSkylineView.module.css
Lines: new file
Parallelism: independent
Description: Minimal chart wrapper styles. Most chart styling is via Recharts SVG props.
Details:
  - .container: width 100%. (No padding — the hero card shell provides padding).
  - .noProjectionNotice: font-size 12px; color var(--text-muted); text-align center; margin-top var(--sp-2).
```

---

### Group D — Container (depends-on Groups B and C)

```
File: frontend/src/components/MilestoneHeroCard.jsx
Lines: new file
Parallelism: depends-on: frontend/src/hooks/useMilestoneData.js, frontend/src/components/MilestoneCardsView.jsx, frontend/src/components/MilestoneSkylineView.jsx
Description: Container component. Owns view toggle state. Calls useMilestoneData. Guards rendering. Renders header + active view.
Details:
  - Props: typeData (shape: {series: Array}), retirement (object).
  - State: const [activeView, setActiveView] = useState(0)  // 0=cards, 1=chart
  - Calls useMilestoneData(typeData, retirement) at the top.
  - Guard: if (!milestoneData.shouldRender) return null. Handles EC-1, EC-2, EC-12.
  - Header section:
    - Eyebrow: <p className={styles.eyebrow}>Investable Capital</p>
    - Title: <h2 className={styles.title} id="milestone-hero-title">Milestones</h2>
    - Count badge: <span className={styles.countBadge}>{achievedCount} of {totalCount} achieved</span>
    - View toggle (two-button strip):
        <div role="tablist" aria-label="Milestone view" className={styles.viewToggle}>
          <button
            role="tab"
            id="tab-cards"
            aria-selected={activeView === 0}
            aria-controls="panel-cards"
            className={`${styles.viewBtn} ${activeView === 0 ? styles.viewBtnActive : ''}`}
            onClick={() => setActiveView(0)}
            onKeyDown={handleToggleKeyDown}
          >Cards</button>
          <button
            role="tab"
            id="tab-chart"
            aria-selected={activeView === 1}
            aria-controls="panel-chart"
            className={`${styles.viewBtn} ${activeView === 1 ? styles.viewBtnActive : ''}`}
            onClick={() => setActiveView(1)}
            onKeyDown={handleToggleKeyDown}
          >Chart</button>
        </div>
  - handleToggleKeyDown: keyboard handler for roving tabindex. The design spec (Section 2) calls for Left/Right arrow keys. Implementation: if key === 'ArrowRight' || key === 'ArrowLeft', setActiveView(v => v === 0 ? 1 : 0) and move focus to the other button via a ref. Use useRef for [btn0Ref, btn1Ref] and focus the appropriate ref on arrow key.
  - Content area: two panels, only the active one visible (conditional render — not display:none, to avoid Recharts chart mount on invisible panel):
      {activeView === 0 && (
        <div role="tabpanel" id="panel-cards" aria-labelledby="tab-cards" className={styles.viewPanel}>
          <MilestoneCardsView milestones={milestoneData.milestones} />
        </div>
      )}
      {activeView === 1 && (
        <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart" className={styles.viewPanel}>
          <div role="img" aria-label={`Investable capital history with ${milestoneData.milestones.length} milestone${milestoneData.milestones.length !== 1 ? 's' : ''} shown as reference lines.`}>
            <MilestoneSkylineView
              mergedSeries={milestoneData.mergedSeries}
              milestones={milestoneData.milestones}
              investableCapital={milestoneData.investableCapital}
              hasProjection={milestoneData.projectionSeries != null}
            />
          </div>
        </div>
      )}
  - Outer wrapper: <section aria-labelledby="milestone-hero-title" className={styles.container} data-testid="milestone-hero-card">

Key imports:
  import { useState, useRef } from 'react'
  import PropTypes from 'prop-types'
  import { useMilestoneData } from '../hooks/useMilestoneData.js'
  import MilestoneCardsView from './MilestoneCardsView.jsx'
  import MilestoneSkylineView from './MilestoneSkylineView.jsx'
  import styles from './MilestoneHeroCard.module.css'

PropTypes:
  MilestoneHeroCard.propTypes = {
    typeData: PropTypes.shape({ series: PropTypes.array }),
    retirement: PropTypes.object,
  }
```

---

```
File: frontend/src/components/MilestoneHeroCard.module.css
Lines: new file
Parallelism: depends-on: frontend/src/components/MilestoneHeroCard.jsx (created alongside)
Description: Hero card shell, header layout, toggle styles. Toggle classes mirror RangeSelector.module.css.
Details:
  - .container: background var(--bg-card); border-radius var(--radius-lg); padding var(--sp-4); border 1px solid var(--border); margin-bottom var(--sp-5).
  - @media (min-width: 768px) .container: padding var(--sp-5) var(--sp-6); margin-bottom var(--sp-6).
  - .header: display flex; flex-direction column; gap var(--sp-3); margin-bottom var(--sp-4).
  - @media (min-width: 768px) .header: flex-direction row; justify-content space-between; align-items center; margin-bottom var(--sp-5).
  - .titleGroup: display flex; flex-direction column; gap 4px.
  - .eyebrow: font-size 9px; font-weight 400; letter-spacing 2px; text-transform uppercase; color var(--text-muted); margin 0.
  - .title: font-size 15px; font-weight 500; color var(--text-primary); margin 0.
  - @media (min-width: 768px) .title: font-size 16px.
  - .headerRight: display flex; align-items center; gap var(--sp-3).
  - .countBadge: background var(--accent-tint); color var(--accent-light); border-radius var(--radius-pill); font-size 11px; font-weight 600; padding 3px 10px; white-space nowrap.
  - .viewToggle: display flex; gap 4px; background var(--bg-root); border-radius 8px; padding 4px; flex-shrink 0. (mirrors .rangeButtons from RangeSelector.module.css)
  - .viewBtn: background transparent; border none; color var(--text-muted); font-size 13px; font-weight 500; padding 6px 10px; border-radius 6px; cursor pointer; min-height 36px; white-space nowrap; transition all var(--ease-quick). (mirrors .rangeBtn)
  - @media (min-width: 768px) .viewBtn: padding 4px 10px; min-height unset.
  - .viewBtnActive: background var(--border); color var(--text-primary). (mirrors .rangeBtnActive)
  - .viewPanel: min-height 220px. (EC on toggle height jump — card never shrinks below 220px regardless of card content)
  - @media (min-width: 768px) .viewPanel: min-height 300px.
  NOTE on header layout on mobile: the design spec says count badge is below title on mobile, toggle is to the right of title. Implement header as: on mobile, a single-row flex with titleGroup (eyebrow + title) on left and viewToggle on right (header is flex-direction row on mobile too, just without the badge in the right group on mobile). The badge sits below the title in titleGroup on mobile. On desktop, badge moves to headerRight group. Implementation: use CSS to reorder or just accept the mobile layout where badge is below title inside titleGroup always, and the toggle is always in headerRight. This avoids dynamic className switching between mobile/desktop for the badge position.
```

---

### Group E — Wiring and Deletion (depends-on Group D)

```
File: frontend/src/pages/NetWorthPage.jsx
Lines: 1–112
Parallelism: depends-on: frontend/src/components/MilestoneHeroCard.jsx
Description: Import MilestoneHeroCard, insert it between TypeStackedChart and AccountsBreakdown, remove milestones prop from TypeStackedChart.
Details:
  - Line 7: Add import MilestoneHeroCard from '../components/MilestoneHeroCard.jsx' after RetirementPanel import.
  - Line 99: Change <TypeStackedChart data={typeData} milestones={retirement?.milestones} /> to <TypeStackedChart data={typeData} />.
  - Between line 99 (<TypeStackedChart />) and line 100 (<AccountsBreakdown />), insert:
      <MilestoneHeroCard typeData={typeData} retirement={retirement} />
  - No other changes. retirement and typeData are already in scope from existing state variables.
```

---

```
File: frontend/src/components/TypeStackedChart.jsx
Lines: 62, 157–166, 218–222
Parallelism: independent (can run in parallel with NetWorthPage.jsx edit — different files)
Description: Remove milestone ReferenceLine rendering loop, the milestones prop from the function signature, and its PropTypes entry.
Details:
  - Line 62: Change function signature from:
      export default function TypeStackedChart({ data, milestones }) {
    to:
      export default function TypeStackedChart({ data }) {
  - Lines 157–166: Delete the milestone ReferenceLine block entirely:
      {milestones && milestones.map((m, i) => (
        <ReferenceLine
          key={`milestone-${i}`}
          yAxisId="left"
          y={m.amount}
          stroke="#F5A623"
          strokeDasharray="4 3"
          label={{ value: m.label || '', fill: '#F5A623', fontSize: 11 }}
        />
      ))}
  - After deletion, verify that the closing </AreaChart> at what is currently line 167 is still properly closed by the surrounding JSX.
  - Lines 218–222: Remove the milestones PropTypes entry:
      milestones: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string,
        amount: PropTypes.number,
      })),
  - If ReferenceLine is now unused after this deletion: remove it from the import at line 10. Current import is: import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'. Remove ReferenceLine from the destructured list.
```

---

### Group F — Tests

Tests can be written in parallel with implementation because interfaces are fully specified above.

```
File: frontend/src/utils/milestoneUtils.test.js
Lines: new file
Parallelism: independent (pure function tests, no React)
Description: Unit tests for all exported functions from milestoneUtils.js.
Details:
  Test suites and cases:

  describe('sortMilestones'):
    - sorts ascending by amount
    - does not mutate the input array
    - handles empty array
    - handles single-item array

  describe('computeInvestableCapital'):
    - returns Retirement + Brokerage from last series entry
    - handles null Retirement (defaults to 0)
    - handles null Brokerage (defaults to 0)
    - returns 0 for empty series
    - returns 0 for null/undefined series

  describe('buildInvestableSeries'):
    - maps all points to {date, value}
    - value = Retirement + Brokerage
    - handles missing fields with ?? 0
    - returns empty array for empty series

  describe('classifyMilestones'):
    - first unachieved is 'in-progress', all before are 'achieved', all after are 'future'
    - all achieved when IC >= all amounts
    - all future when IC = 0
    - isNestEgg flag propagated correctly
    - progress capped at 1.0 for achieved milestones (not > 1)
    - progress = 0 when IC = 0
    - progress for partial completion (e.g., IC=250k, amount=500k → progress=0.5)

  describe('findAchievementDate'):
    - returns formatted "Jan '24" for first crossing month
    - returns null when series never reaches amount
    - returns first date when first point already exceeds amount (with comment about import limitation)
    - handles empty series

  describe('findProjectedDate'):
    - returns "Mon 'YY" for first projection crossing
    - returns null when projection never reaches amount
    - returns "50+ yrs" sentinel when projection is capped (test with series that does not reach amount after 50 years worth of points)

  describe('formatDateShort'):
    - "2024-01-01" → "Jan '24"
    - "2025-12-01" → "Dec '25"
    - uses T00:00:00 suffix to avoid timezone midnight rollover

  describe('buildMergedSeries'):
    - historical points get investableCapital key, no projectedCapital
    - projection points get projectedCapital key, no investableCapital
    - overlap dates get both keys
    - result is sorted ascending by date
    - handles null projectionSeries (returns investableSeries mapped to {date, investableCapital})
```

---

```
File: frontend/src/hooks/useMilestoneData.test.js
Lines: new file
Parallelism: independent
Description: Hook unit tests using renderHook from @testing-library/react. Tests guard conditions and computed values.
Details:
  - Mock retirementMath.js: vi.mock('../utils/retirementMath.js', ...) to control computeNestEgg and generateProjectionSeries outputs.
  - Mock milestoneUtils.js: vi.mock('../utils/milestoneUtils.js', ...) for isolation, OR use actual implementations (preferred — the utils are pure functions already tested).
  - Use MOCK_RETIREMENT and MOCK_NETWORTH_BY_TYPE from '../test/fixtures.js'.
  - Add MOCK_RETIREMENT_NO_RETURN to fixtures if not present: same as MOCK_RETIREMENT but expected_return_pct: null.

  Test cases:
    - returns shouldRender=false when retirement.exists is false
    - returns shouldRender=false when milestones array is empty
    - returns shouldRender=false when typeData.series is empty
    - returns shouldRender=false when typeData is null
    - returns shouldRender=true with valid inputs
    - investableCapital = Retirement + Brokerage from last series point
    - investableCapital = 0 when IC is negative (EC-9: Math.max(0, rawIC))
    - milestones sorted ascending by amount in returned array
    - milestones enriched with state, progress, isNestEgg fields
    - projectionSeries is null when expected_return_pct not set (EC-6)
    - projectionSeries is non-null when expected_return_pct is set
    - achievedCount and totalCount correct for given fixture data
    - nestEgg is null when desired_annual_income not set (EC-11)
    - nestEgg appears as last item in milestones when non-null
```

---

```
File: frontend/src/components/MilestoneHeroCard.test.jsx
Lines: new file
Parallelism: independent
Description: Integration tests for MilestoneHeroCard using RTL. Tests toggle behavior, guard conditions, ARIA structure, and view switching.
Details:
  - Mock useMilestoneData: vi.mock('../hooks/useMilestoneData.js', ...) to control shouldRender and returned data.
  - Mock MilestoneCardsView: vi.mock('./MilestoneCardsView.jsx', () => ({default: () => <div data-testid="milestone-cards-view" />}))
  - Mock MilestoneSkylineView: vi.mock('./MilestoneSkylineView.jsx', () => ({default: () => <div data-testid="milestone-skyline-view" />}))
  - Factory: makeMilestoneData(overrides) returns a base shouldRender=true object with 2 milestones, achievedCount=1, totalCount=2.

  Test cases:
    - renders null when shouldRender is false (EC-1, EC-2)
    - renders null when retirement.exists is false (guards at hook level, but test end-to-end)
    - renders hero card when shouldRender is true (data-testid="milestone-hero-card" present)
    - renders "Milestones" title
    - renders count badge "1 of 2 achieved"
    - shows MilestoneCardsView by default (index 0)
    - does not show MilestoneSkylineView by default
    - clicking "Chart" button shows MilestoneSkylineView, hides MilestoneCardsView
    - clicking "Cards" button after switching to chart restores MilestoneCardsView
    - toggle buttons have correct role="tab" and aria-selected attributes
    - toggle container has role="tablist"
    - active tab has aria-selected="true", inactive has aria-selected="false"
    - pressing ArrowRight on "Cards" tab moves to "Chart" tab and switches view
    - pressing ArrowLeft on "Chart" tab moves to "Cards" tab and switches view
    - section has aria-labelledby pointing to title id
    - panels have role="tabpanel" and aria-labelledby matching tab ids
    - renders "Investable Capital" eyebrow label
```

---

```
File: frontend/src/components/TypeStackedChart.test.jsx
Lines: 102–120 (existing tests for milestone ReferenceLine)
Parallelism: depends-on: frontend/src/components/TypeStackedChart.jsx
Description: Remove tests that tested milestone ReferenceLine rendering (they will fail after the prop is removed).
Details:
  - Delete the three test cases at lines 102–120:
      it('renders ReferenceLine for each milestone', ...) — line 102
      it('renders no ReferenceLine when milestones is null', ...) — line 112
      it('renders no ReferenceLine when milestones is empty', ...) — line 117
  - Add a new test confirming no ReferenceLine is rendered at all:
      it('does not render any ReferenceLine elements', () => {
        render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
        expect(screen.queryByTestId(/^milestone-/)).not.toBeInTheDocument()
      })
  - All other existing tests (lines 50–101 and 122–127) are unaffected.
```

---

```
File: frontend/src/pages/NetWorthPage.test.jsx
Lines: 35–43 (existing render test)
Parallelism: depends-on: frontend/src/pages/NetWorthPage.jsx
Description: Add MilestoneHeroCard to the mocked child components, update the render test to include it.
Details:
  - Line 11 block (vi.mock calls): add:
      vi.mock('../components/MilestoneHeroCard.jsx', () => ({ default: () => <div data-testid="milestone-hero-card" /> }))
  - In the 'renders StatsCards, NetWorthChart, TypeStackedChart, AccountsBreakdown after data loads' test (line 35), add:
      expect(screen.getByTestId('milestone-hero-card')).toBeInTheDocument()
  - Add a new test:
      it('renders MilestoneHeroCard after data loads', async () => {
        render(<NetWorthPage />)
        await waitFor(() => expect(screen.getByTestId('milestone-hero-card')).toBeInTheDocument())
      })
  - Verify the TypeStackedChart mock at line 10 does not pass milestones — the mock component receives no milestones prop now, which is correct since we removed it.
```

---

```
File: frontend/src/test/fixtures.js
Lines: 319–335 (existing MOCK_RETIREMENT block)
Parallelism: independent
Description: Add fixture data for milestone-related test scenarios.
Details:
  - After MOCK_RETIREMENT (line 335), add:

    export const MOCK_RETIREMENT_NO_RETURN = {
      ...MOCK_RETIREMENT,
      expected_return_pct: null,
    }

    export const MOCK_RETIREMENT_NO_MILESTONES = {
      ...MOCK_RETIREMENT,
      milestones: [],
    }

    export const MOCK_RETIREMENT_SINGLE_MILESTONE = {
      ...MOCK_RETIREMENT,
      milestones: [{ label: 'Half-Mil', amount: 500000 }],
    }

  - MOCK_NETWORTH_BY_TYPE already has Retirement=240000 and Brokerage=200000 on the last series point (2026-01-01). Investable capital for test assertions: 440000. Both existing fixtures support milestone tests without modification.
```

---

## Dependency Order

The dependency chain for parallel execution:

```
Layer 1 (all independent — run in parallel):
  - milestoneUtils.js           CREATE
  - chartUtils.jsx              MODIFY (add COLOR_ACCENT_LIGHT)
  - recharts mock               MODIFY (add Customized stub)
  - fixtures.js                 MODIFY (add new fixtures)
  - milestoneUtils.test.js      CREATE (pure function tests, no React)

Layer 2 (depends on Layer 1):
  - useMilestoneData.js         CREATE (depends on milestoneUtils.js)
  - MilestoneCardsView.jsx      CREATE (depends on chartUtils.jsx for fmtFull)
  - MilestoneCardsView.module.css CREATE (independent)
  - MilestoneSkylineView.jsx    CREATE (depends on chartUtils.jsx for COLOR_ACCENT_LIGHT)
  - MilestoneSkylineView.module.css CREATE (independent)
  - useMilestoneData.test.js    CREATE (depends on fixtures.js)

Layer 2b (also independent of each other, can run with Layer 2):
  - TypeStackedChart.jsx        MODIFY (pure deletion, no new deps)
  - TypeStackedChart.test.jsx   MODIFY (depends on TypeStackedChart.jsx change)

Layer 3 (depends on Layer 2):
  - MilestoneHeroCard.jsx       CREATE (depends on hook + both views)
  - MilestoneHeroCard.module.css CREATE (alongside MilestoneHeroCard.jsx)
  - MilestoneHeroCard.test.jsx  CREATE (depends on MilestoneHeroCard.jsx interface)

Layer 4 (depends on Layer 3):
  - NetWorthPage.jsx            MODIFY (depends on MilestoneHeroCard.jsx)
  - NetWorthPage.test.jsx       MODIFY (depends on NetWorthPage.jsx change)
```

In practice, two implementer agents can work in parallel:
- **Agent 1:** milestoneUtils.js → useMilestoneData.js → MilestoneHeroCard.jsx → NetWorthPage.jsx
- **Agent 2:** chartUtils.jsx + MilestoneCardsView.jsx + MilestoneSkylineView.jsx + TypeStackedChart.jsx (all largely independent of Agent 1's work)
- **QA Agent:** milestoneUtils.test.js and useMilestoneData.test.js (Layer 1/2 independent), then MilestoneHeroCard.test.jsx and page test updates after Layer 3 completes.

---

## Test Strategy

### New test files

**`frontend/src/utils/milestoneUtils.test.js`** — Pure function tests. No mocking required. Can be written before milestoneUtils.js is implemented (TDD). Covers:
- Happy path: standard 4-milestone set, mixed achieved/future
- EC-3: zero IC
- EC-4: already-achieved milestone
- EC-5: all milestones achieved
- EC-7: unsorted input → sorted output
- EC-8: tiny progress (0.2% → progress=0.002 → bar shows 4px minimum via CSS, not JS)
- EC-9: negative IC → progress uses Math.max(0, ic)
- EC-10: single milestone
- EC-11: nestEgg=null → no nest egg item appended
- EC-14: projection beyond 50 years → "50+ yrs"

**`frontend/src/hooks/useMilestoneData.test.js`** — Hook tests with renderHook. Covers:
- All shouldRender=false conditions (EC-1, EC-2, EC-12)
- EC-6: no return pct → projectionSeries=null
- EC-9: negative IC treated as 0 for progress
- EC-11: nestEgg=null → not in milestones array
- Memoization: rerender with same props does not recompute (verify with spy on generateProjectionSeries)

**`frontend/src/components/MilestoneHeroCard.test.jsx`** — Integration tests covering:
- Happy path: renders with valid data
- EC-1/EC-2: returns null
- Toggle: default view is cards (index 0)
- Toggle: click switches view
- Toggle: keyboard arrow key navigation
- ARIA: tablist, tab, tabpanel, aria-selected, aria-labelledby
- Count badge text format

### Modified test files

**`TypeStackedChart.test.jsx`** — Remove the 3 milestone ReferenceLine tests; add 1 test confirming no reference lines. Remaining 10 tests unaffected.

**`NetWorthPage.test.jsx`** — Add MilestoneHeroCard mock; add 1 new render test; update the existing multi-component render test.

### Edge cases requiring specific test coverage

| EC | Test Location | Test Name |
|----|--------------|-----------|
| EC-1 | MilestoneHeroCard.test.jsx | 'renders null when milestones array is empty' |
| EC-2 | MilestoneHeroCard.test.jsx | 'renders null when retirement.exists is false' |
| EC-3 | milestoneUtils.test.js | 'progress is 0 when IC is 0' |
| EC-6 | useMilestoneData.test.js | 'projectionSeries is null when expected_return_pct not set' |
| EC-7 | milestoneUtils.test.js | 'sortMilestones returns ascending order' |
| EC-8 | MilestoneCardsView not directly testable for 4px min (CSS-only) — test that progress value passed is exact even for tiny values |
| EC-9 | useMilestoneData.test.js | 'investableCapital is 0 when raw IC is negative' |
| EC-10 | milestoneUtils.test.js | 'classifyMilestones handles single milestone' |
| EC-11 | useMilestoneData.test.js | 'nest egg not in milestones when nestEgg is null' |
| EC-12 | useMilestoneData.test.js | 'shouldRender=false when typeData.series is empty' |
| EC-14 | milestoneUtils.test.js | 'findProjectedDate returns 50+ yrs sentinel when not found' |

### Tests that can run in parallel with implementation

The `milestoneUtils.test.js` file can be written entirely before `milestoneUtils.js` is implemented (TDD). The hook test can be written once the hook signature is known (defined here). The component tests can be written after interfaces are defined (all defined in this document).

---

## Risks and Open Questions

### Risk 1: CSS token availability (--green-tint, --amber-tint, --amber, --green)

The design spec references `var(--green-tint)`, `var(--amber-tint)`, `var(--amber)`, `var(--green)` tokens. The codebase survey read `chartUtils.jsx` (which has hex constants) but did not read `index.css` directly. If these tokens do not exist in `index.css`, the implementer must substitute the hex literals from the design spec:
- `--green-tint` → `rgba(46,204,138,0.12)`
- `--green` → `#2ECC8A` (same as `--color-positive`)
- `--amber-tint` → `rgba(245,166,35,0.12)`
- `--amber` → `#F5A623`

**Action:** Implementer must read `index.css` before writing `MilestoneCardsView.module.css` and use tokens if available, hex if not. Add a comment `/* token not in index.css — using hex directly */` if falling back.

### Risk 2: Recharts ReferenceLine label prop API

The architecture doc notes: "Recharts ReferenceLine does not support the content prop for custom rendering in all versions. Verify with Recharts 2.12.7 that `<ReferenceLine content={CustomLabel} />` works. If not, use `<ReferenceLine label={{ content: CustomLabel }} />`."

**Action:** The plan uses `label={<MilestoneLabel ... />}` (the `label` prop with a JSX element). In Recharts 2.x, `label` accepts an object `{value, position, content}` or a JSX element directly. The JSX element form renders the element, receiving `viewBox` and the line's position props. If the JSX element form does not work, fall back to `label={{ content: (props) => <MilestoneLabel {...props} milestone={m} isMobile={isMobile} /> }}`.

### Risk 3: MilestoneLabel collision avoidance

The plan uses index-based alternating vertical offset (odd-index labels offset +14px below the line). This is a simplified version of the design spec's "stagger for close milestones" strategy. If milestones happen to be close in Y value, labels may still overlap if they are both even- or both odd-indexed. The architect noted the full collision avoidance requires computing pixel positions, which requires the chart's Y-axis scale — not readily available in the label content render prop.

**Action:** Implement the simple odd/even stagger. If in Playwright QA the labels visually collide badly, the fallback is to only render labels on the even-indexed milestones (reducing label count by 50%). This is explicitly noted as a fallback in the architecture doc. Do not block implementation on implementing full pixel-space collision detection.

### Risk 4: TypeStackedChart test removal

Three existing tests in `TypeStackedChart.test.jsx` specifically test the milestone ReferenceLine behavior (lines 102–120). These tests must be removed as part of this change. The implementer modifying `TypeStackedChart.jsx` should also update its test file in the same commit to avoid a window where the test suite is broken.

### Risk 5: NetWorthPage test update timing

The `NetWorthPage.test.jsx` must be updated to add the `MilestoneHeroCard` mock before the page renders. If `NetWorthPage.jsx` is modified to import `MilestoneHeroCard` without the test file being updated simultaneously, the test will fail with an unmocked module error. These two file changes must land together.

---

## Rollback Notes

- `TypeStackedChart.jsx`: Restore lines 62, 157–166, 218–222 to their previous state (add `milestones` param back to signature and PropTypes, restore the ReferenceLine loop). The old `<ReferenceLine>` rendering was buggy (compared against total NW, not investable capital) but was visually non-crashing.
- `NetWorthPage.jsx`: Remove the `MilestoneHeroCard` import and JSX line; restore `milestones={retirement?.milestones}` to the `TypeStackedChart` call.
- New files (`milestoneUtils.js`, `useMilestoneData.js`, `MilestoneHeroCard.jsx`, `MilestoneHeroCard.module.css`, `MilestoneCardsView.jsx`, `MilestoneCardsView.module.css`, `MilestoneSkylineView.jsx`, `MilestoneSkylineView.module.css`): delete them.
- `chartUtils.jsx`: Remove the `COLOR_ACCENT_LIGHT` line.
- `recharts mock`: Remove the `Customized` export.
- No database or API changes — rollback is purely a code revert.
