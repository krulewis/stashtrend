# Phase 4: Forecasting Page — Requirements Document

**Date:** 2026-03-09 (revised)
**Author:** PM Agent
**Status:** Ready for research/architecture pipeline
**Size:** L
**Depends on:** Phase 1 (CAGR -- done), Phase 2 (Retirement tracker -- done), Phase 2.1 (Investable capital fix -- next)

---

## 1. Clarified Intent

Build a new top-level Forecasting page (`/forecasting`) in the Stashtrend sidebar. The page projects the user's **investable capital** (Retirement + Brokerage account balances) forward to their target retirement age using compound growth math, and integrates retirement readiness analysis (nest egg target, on/off track status, gap analysis) alongside the projection chart.

**Investable capital, not total net worth.** This page projects the pool of money the 4% safe withdrawal rate applies to. Home equity, vehicles, and other illiquid assets are excluded. This matches the investable capital concept already implemented in `RetirementPanel` (Phase 2).

This is Layer 1 (Simple Projection) only. Monte Carlo simulation and AI narrative (Layers 2/3) are Phase 5 and explicitly out of scope.

---

## 2. User Stories and Acceptance Criteria

### US-1: View baseline projection curve
**As a** retirement-focused investor, **I want to** see my investable capital projected forward to my target retirement age using my historical CAGR and current monthly contributions, **so that** I can understand where I am heading without changing anything.

**Acceptance criteria:**
- Chart shows investable capital (Retirement + Brokerage) projected from today to target retirement age
- Uses historical weighted CAGR from `/api/networth/by-type` as the default return rate
- Starting value is current investable capital (latest `series[-1].Retirement + series[-1].Brokerage`)
- Monthly contribution default comes from saved `retirement_settings.monthly_contribution`
- X-axis: years/dates from now to retirement age; Y-axis: portfolio value (formatted with `fmtCompact`)
- Historical investable capital data shown as solid line; projected data as a distinct style (dashed or lighter shade)
- Default view loads without any user interaction beyond having retirement settings saved

### US-2: See contribution variant trajectories
**As a** user exploring savings scenarios, **I want to** see what happens if I increase or decrease my contributions by 10%, **so that** I can visualize the impact of small changes.

**Acceptance criteria:**
- Three lines on chart: baseline, +10% contributions, -10% contributions
- Each line is visually distinct (different colors AND dash patterns -- color alone is insufficient for accessibility)
- Lines diverge from the same starting point (current investable capital)
- Legend identifies all three lines
- Tooltip on hover shows exact values for all three lines at the hovered date
- When baseline contribution is $0, the +/-10% lines are not shown (10% of $0 = $0); chart shows single "Growth only" line

### US-3: Adjust monthly contribution interactively
**As a** user planning my finances, **I want to** use a slider to change the assumed monthly contribution amount, **so that** I can explore different saving scenarios in real time.

**Acceptance criteria:**
- Slider control for monthly contribution amount
- Range: $0 to max($10,000, 2x saved contribution)
- Step: $100
- Numeric input field alongside slider for precise entry; bidirectionally synced
- Chart updates in real time as slider moves (perceived < 100ms latency)
- Default value: saved `retirement_settings.monthly_contribution`, or $0 if none saved
- The +/-10% variant lines recalculate relative to the slider's current value

### US-4: Adjust return rate interactively
**As a** user, **I want to** use a slider to change the assumed annual return rate, **so that** I can see optimistic and pessimistic growth scenarios.

**Acceptance criteria:**
- Slider control for annual return rate
- Range: 0% to 15%
- Step: 0.5%
- Numeric input field alongside slider for precise entry; bidirectionally synced
- Default value: saved `expected_return_pct` > weighted historical CAGR (longest available period) > 7.0% (first available in that priority)
- Chart updates in real time as slider moves

### US-5: See retirement readiness alongside projections
**As a** user tracking retirement readiness, **I want to** see my nest egg target, projected value at retirement, and on/off track status directly on the Forecasting page, **so that** I understand whether my projections meet my retirement goals.

**Acceptance criteria:**
- Summary panel displays: current investable capital, nest egg needed, projected at retirement, target year, on/off track badge
- Nest egg target rendered on chart as horizontal dashed reference line with label
- Gap analysis text: "You are $X ahead of target" or "You need $X more by [year]"
- Off-track state includes contribution suggestion: "Increase contributions by $Y/month to close the gap"
- All values update in real time as sliders change
- All retirement data comes from saved `retirement_settings` -- no duplicate input forms on this page (see US-6 for first-time setup)

### US-6: First-time retirement settings setup
**As a** user visiting the Forecasting page with no retirement settings saved, **I want to** enter my basic retirement info without leaving the page, **so that** I can see projections immediately.

**Acceptance criteria:**
- If no `retirement_settings` exist, show inline setup panel with minimal inputs: current age, target retirement age, desired annual income, monthly contribution
- Uses the same minimal/advanced input pattern as the existing `RetirementPanel` component
- Advanced dropdown available (Social Security, withdrawal rate, expected return) but not required
- After saving, chart renders immediately with the new settings
- If settings already exist, show compact read-only summary with "Edit Settings" link that either expands inline or navigates to Net Worth page retirement panel

### US-7: Navigate to Forecasting page
**As a** user, **I want to** access the Forecasting page from the sidebar, **so that** I can find it like any other section.

**Acceptance criteria:**
- New entry in `NAV_ITEMS` array in `/frontend/src/nav.js`
- Route `/forecasting` registered in `App.jsx`
- Sidebar item appears after Net Worth (logical grouping: Net Worth -> Forecasting -> Account Groups -> ...)
- Mobile bottom tab bar also includes the item
- Page renders without errors even when no data or settings exist

---

## 3. Detailed Functional Requirements

### 3.1 Data Sources

| Data | Source | Endpoint |
|------|--------|----------|
| Current investable capital | Latest Retirement + Brokerage from type series | `GET /api/networth/by-type` -> `series[-1].Retirement + series[-1].Brokerage` |
| Historical CAGR per bucket | Bucket-level CAGR (1y/3y/5y) | `GET /api/networth/by-type` -> `cagr.Retirement`, `cagr.Brokerage` |
| Historical investable capital series | Retirement + Brokerage over time | `GET /api/networth/by-type` -> derive from `series[*].Retirement + series[*].Brokerage` |
| Retirement settings | All user retirement config | `GET /api/retirement-settings` |
| Projection math | Existing pure functions | `generateProjectionSeries()` from `retirementMath.js` |
| Nest egg math | Existing pure function | `computeNestEgg()` from `retirementMath.js` |

### 3.2 Combined CAGR for Investable Capital

The `/api/networth/by-type` endpoint returns separate CAGR for Retirement and Brokerage buckets. The default return rate slider value should use a balance-weighted average:

```
weightedCAGR = (retBal * retCAGR + brokBal * brokCAGR) / (retBal + brokBal)
```

Use the longest available period (prefer 5Y > 3Y > 1Y). If CAGR is null for a bucket (insufficient history), weight that bucket at 0 and use only the other. If both are null, fall back to 7.0%.

### 3.3 Projection Calculation

- Use existing `generateProjectionSeries()` with:
  - `currentNetWorth` = current investable capital
  - `monthlyContribution` = slider value
  - `annualReturnPct` = slider value
  - `years` = targetAge - currentAge
- Generate three series: baseline, +10% contribution, -10% contribution
- All calculations run client-side (no new backend endpoints)

### 3.4 Historical + Projected Chart

- Derive historical investable capital series from type data: for each date in `series`, sum `Retirement + Brokerage`
- Use `mergeHistoryWithProjection()` from `retirementMath.js` to combine historical and projected series
- Historical portion: solid line; projected portion: visually distinct (dashed or different opacity)
- The transition point (today) should be clearly marked

### 3.5 Gap Analysis with Contribution Suggestion

When the user is off track (projected at retirement < nest egg needed):

1. Calculate the shortfall: `nestEgg - projectedAtRetirement`
2. Calculate the additional monthly contribution needed to close the gap:
   - Solve for `additionalContrib` such that `generateProjectionSeries(investableCapital, currentContrib + additionalContrib, returnRate, years)[-1] >= nestEgg`
   - Can use iterative approximation or closed-form FV annuity formula
3. Display: "Increase contributions by $X/month to close the gap"

This requires a new utility function in `retirementMath.js` (e.g., `calculateContributionToTarget()`).

### 3.6 Chart Specifications

- Library: Recharts (consistent with all existing charts)
- Chart type: Line chart
- Lines: baseline (solid, primary color), +10% (dashed, lighter), -10% (dashed, lighter)
- Nest egg target: horizontal dashed reference line (`ReferenceLine`) with label
- X-axis: years (e.g., "2030", "2035", "2045")
- Y-axis: dollar values formatted with `fmtCompact` (e.g., "$500K", "$1.2M")
- Tooltip: date, baseline value, +10% value, -10% value (formatted with `fmtFull`)
- Responsive: fills container width; min height 300px desktop, 200px mobile

### 3.7 Interactive Controls Layout

Controls appear above the chart:

```
[Monthly Contribution: $____  |===slider===|  ]
[Annual Return Rate:   _.__% |===slider===|  ]
```

- Each control: label, numeric input (left), range slider (right)
- Slider and input bidirectionally synced
- Input validation: clamp to min/max on blur, reject non-numeric
- Reset button to return both sliders to saved/default values

### 3.8 Page Layout (top to bottom)

1. Page title: "Forecasting"
2. Setup panel (only if no retirement settings exist -- US-6)
3. Interactive controls (sliders + reset button)
4. Projection chart (historical + projected lines, +/-10% variants, nest egg reference line)
5. Retirement readiness summary (cards: investable capital, nest egg needed, projected at retirement, gap)
6. On/off track badge + gap analysis text
7. Compact settings summary with "Edit Settings" link (if settings exist)

---

## 4. Edge Cases and Error States

| # | Condition | Behavior |
|---|-----------|----------|
| 4.1 | No investment accounts (Retirement + Brokerage = $0 or missing) | Show empty state: "No investment accounts found. Sync your retirement or brokerage accounts to see projections." Chart not rendered. |
| 4.2 | No retirement settings saved | Show inline setup form (US-6). Sliders still work with defaults ($0 contribution, 7% return). No nest egg line or gap analysis until settings are saved. |
| 4.3 | Very short history (< 1 year, no CAGR available) | Default return rate to 7.0%. Show info note: "Not enough history to calculate your historical return. Using 7% default." |
| 4.4 | Historical CAGR exceeds slider max (>15%) | Default slider to 15%. Show note: "Your historical CAGR of X% exceeds the slider range. Adjust manually if needed." |
| 4.5 | Negative historical CAGR | Use it as default (slider goes to 0% minimum). Show warning: "Your historical return rate is negative. Projections assume continued decline unless adjusted." |
| 4.6 | Zero contributions ($0 slider) | Valid -- show growth from returns only. +/-10% lines collapse to single line; chart shows one line labeled "Growth only (no contributions)." |
| 4.7 | Negative or zero investable capital | If $0: projection starts from $0, only contribution accumulation shown. If negative (margin): show warning "Your investable capital is negative." Still render chart. |
| 4.8 | Target age <= current age | Show message: "Your target retirement age is at or before your current age. Update your retirement settings." No chart rendered. |
| 4.9 | Very long projection (>50 years) | Allow it. Chart x-axis adapts to show decades. No artificial cap. |
| 4.10 | Monthly contribution is null in settings | Default contribution slider to $0. Chart renders with growth from returns only. |
| 4.11 | API failure (`/api/networth/by-type` or `/api/retirement-settings`) | Show error state with retry button. Do not render partial or broken chart. |
| 4.12 | Only one bucket has data (e.g., Retirement but no Brokerage) | Use available bucket only. CAGR weighted average uses 100% weight on the available bucket. |
| 4.13 | Desired annual income not set (no nest egg calculable) | Projection chart renders without nest egg reference line. Gap analysis section hidden with prompt: "Set your desired retirement income to see gap analysis." |

---

## 5. Out-of-Scope Items

| Item | Deferred To | Rationale |
|------|-------------|-----------|
| Monte Carlo simulation | Phase 5 | Requires probability bands, historical volatility, thousands of simulation runs |
| AI narrative analysis | Phase 5 | Requires `_call_ai()` integration, prompt engineering, narrative UI panel |
| Probability bands (percentile outcomes) | Phase 5 | Monte Carlo output |
| Inflation-adjusted projections | Phase 5+ | Adds complexity; simple nominal projection is sufficient for Layer 1 |
| Tax-adjusted projections | Future | Requires tax bracket modeling, Roth vs traditional distinction |
| Benchmark comparison overlay | Phase 6 | S&P 500 overlay is a separate feature area |
| FIRE calculator | Future roadmap | Explicitly deferred per parent requirements |
| Multiple scenario save/compare | Future | Named scenario management is Phase 5+ complexity |
| Contribution auto-detection from transactions | Future | Currently manual entry via retirement_settings; auto-detect is a separate pipeline feature |
| Editable variant percentages | Future | +/-10% is fixed in Phase 4; user-configurable variants deferred |
| Separate Retirement vs Brokerage projections | Future | Phase 4 projects combined investable capital only |

---

## 6. Data Requirements

### 6.1 Existing Data -- No New Endpoints Needed

All data for Phase 4 is available from existing endpoints:

- **`GET /api/networth/by-type`** -- Returns `series` (per-date bucket values), `cagr` (per-bucket 1y/3y/5y CAGR), `bucket_colors`, `bucket_order`
- **`GET /api/retirement-settings`** -- Returns `current_age`, `target_retirement_age`, `desired_annual_income`, `monthly_contribution`, `expected_return_pct`, `social_security_annual`, `withdrawal_rate_pct`, `milestones`
- **`PUT /api/retirement-settings`** -- Saves retirement settings (used by inline setup form)

### 6.2 Existing Frontend Math -- Minimal Additions

- **`generateProjectionSeries()`** -- Already exists in `retirementMath.js`. Used as-is.
- **`computeNestEgg()`** -- Already exists. Used as-is.
- **`mergeHistoryWithProjection()`** -- Already exists. Used to overlay historical and projected data.
- **NEW: `calculateContributionToTarget()`** -- Needed for gap analysis contribution suggestion. Small addition to `retirementMath.js`.

### 6.3 Data Freshness

- Type data and CAGR fetched on page load (same pattern as Net Worth page)
- Retirement settings fetched on page load
- No polling or real-time updates needed

---

## 7. Interactive Controls Specification

### 7.1 Monthly Contribution Slider

| Property | Value |
|----------|-------|
| Label | "Monthly Contribution" |
| Type | Range slider + numeric input |
| Min | $0 |
| Max | max($10,000, 2x saved contribution) |
| Step | $100 |
| Default | Saved `monthly_contribution`, or $0 |
| Format | Dollar with commas (e.g., "$2,000") |

### 7.2 Annual Return Rate Slider

| Property | Value |
|----------|-------|
| Label | "Annual Return Rate" |
| Type | Range slider + numeric input |
| Min | 0% |
| Max | 15% |
| Step | 0.5% |
| Default | Saved `expected_return_pct` > weighted historical CAGR (longest period) > 7.0% |
| Format | Percentage with one decimal (e.g., "7.0%") |

### 7.3 Interaction Behavior

- Slider drag and numeric input both update chart in real time
- Debounce chart recalculation by 50-100ms during active slider drag
- Input field validates on blur: clamp out-of-range values to nearest valid value
- Reset button restores both controls to their initial default values
- Tab order: contribution input -> contribution slider -> return input -> return slider -> reset button

---

## 8. Non-Functional Requirements

### 8.1 Calculation Performance
- 3 projection series over 50 years (600 months each, 1800 data points total) must compute in < 10ms
- `generateProjectionSeries()` is O(n) -- already fast; no web workers needed

### 8.2 Chart Responsiveness
- Chart renders within 100ms of slider change (perceived real-time)
- Debounce slider events at 50-100ms
- Responsive to container width (mobile through desktop)
- Minimum chart height: 300px desktop, 200px mobile

### 8.3 Accessibility
- Sliders: ARIA labels ("Monthly contribution amount", "Annual return rate percentage")
- Numeric inputs: associated `<label>` elements
- Chart: text summary for screen readers (current investable capital, projected at retirement, on/off track status)
- Projection lines: distinguished by both color AND dash pattern (not color alone)
- On/off track badge: uses text + color (not color alone)

### 8.4 Design Consistency
- Dark cobalt theme using existing design tokens (CSS custom properties from `index.css`)
- CSS Modules for component styles (`.module.css` pattern)
- Reuse `fmtCompact`, `fmtFull` from `chartUtils.jsx`
- Reuse Recharts patterns from existing charts (`NetWorthChart`, `TypeStackedChart`)
- Page structure matches existing pages (title, content sections)

---

## 9. Deferred Decisions (For Architecture Phase)

| Decision | Context | Notes |
|----------|---------|-------|
| Component reuse for retirement settings | Both NW page and Forecasting page need retirement settings input. Extract shared component, or keep separate instances with shared logic? | Architecture should decide based on complexity vs duplication tradeoff |
| Contribution slider max calculation | Dynamic max (2x current) vs fixed max ($10,000) -- how to handle edge cases (user with $0 saved, user with $25K/month) | Architect may simplify to fixed max or implement dynamic |
| Historical investable capital on chart | Show historical Retirement + Brokerage series as solid line before the projection? Or start chart at today only? | Showing history gives context but adds visual complexity |
| Mobile layout for sliders + chart | Sliders above chart on desktop. On mobile, may need full-width stacked layout or collapsible controls panel. | Frontend designer should specify |
| Phase 2.1 coordination | Phase 2.1 fixes investable capital on NW page. Phase 4 uses same concept. Build independently or coordinate? | If 2.1 is done first, Phase 4 can follow same pattern. If concurrent, both should derive from `typeData.series` the same way. |

---

## 10. Open Questions

1. **Slider values: ephemeral or saveable?** Current spec says slider changes are exploration-only, with a separate "Save as defaults" button to persist. Confirm this is the right UX -- or should there be no save capability from the Forecasting page at all (settings only editable from NW page)?

2. **CAGR weighting approach:** The spec prescribes balance-weighted average of Retirement and Brokerage CAGR. If one bucket has 5Y CAGR and the other only has 1Y CAGR, should we use the same time window for both (drop to 1Y), or use each bucket's longest available independently? Recommend: use each bucket's longest available independently, since the goal is best available estimate.

3. **Reset button scope:** Does reset restore sliders to saved retirement settings values, or to the computed defaults (weighted CAGR, etc.)? Recommend: restore to the values shown on initial page load (which incorporates saved settings and computed CAGR fallback).

---

## 11. Scope Summary

### Will Be Built

1. New `/forecasting` route and `NAV_ITEMS` sidebar entry
2. `ForecastingPage` component with responsive layout
3. Projection chart showing investable capital growth (Recharts line chart)
4. Three trajectory lines: baseline, +10% contributions, -10% contributions
5. Interactive monthly contribution slider ($0-$10K+, step $100, with numeric input)
6. Interactive annual return rate slider (0%-15%, step 0.5%, with numeric input)
7. Reset button for slider controls
8. Nest egg target reference line on chart (from retirement settings)
9. Retirement readiness summary panel (investable capital, nest egg, projected at retirement, gap amount, on/off track badge)
10. Gap analysis text with contribution suggestion when off track
11. `calculateContributionToTarget()` utility function in `retirementMath.js`
12. Weighted CAGR calculation utility for combining bucket CAGRs
13. Inline retirement settings setup form for first-time users (reusing existing patterns)
14. Empty states, error states, and edge case handling per Section 4
15. Tests (unit for math utilities, component tests for page and controls)

### Will NOT Be Built

- Monte Carlo simulation (Phase 5)
- AI narrative analysis (Phase 5)
- Probability bands (Phase 5)
- Inflation-adjusted or tax-adjusted projections
- Benchmark comparison overlay (Phase 6)
- Contribution auto-detection from transactions
- Named scenario save/compare
- FIRE calculator
- Editable +/-10% variant percentages
- Separate per-bucket projections

---

## 12. Dependency Notes

- **Phase 2.1 (investable capital fix):** Should ideally land before Phase 4, since both use the same Retirement + Brokerage derivation from `typeData.series`. The pattern already exists in `RetirementPanel.jsx` (lines 44-48). Phase 4 should follow the same approach regardless of Phase 2.1 status.
- **`retirementMath.js`:** Core math exists. Phase 4 adds one new function (`calculateContributionToTarget`). All other utilities are reused as-is.
- **`/api/networth/by-type`:** Returns everything needed (series with per-bucket values, CAGR per bucket). No backend changes required.
- **`/api/retirement-settings`:** Existing endpoints for GET and PUT. No changes needed.
