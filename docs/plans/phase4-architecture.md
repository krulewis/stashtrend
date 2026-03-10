# Phase 4: Forecasting Page -- Architecture Decision Document

**Date:** 2026-03-09
**Author:** Architect Agent
**Status:** Ready for engineering plan
**Size:** L
**Inputs:** phase4-requirements.md, phase4-research.md, codebase inspection

---

## Decision Summary

Phase 4 adds a new `/forecasting` route with a dedicated page component that projects investable capital (Retirement + Brokerage balances) forward to retirement age using compound growth math. All projection calculations run client-side using existing `retirementMath.js` utilities plus two new helper functions. No new backend endpoints are needed. The page uses a `LineChart` (Recharts) with multiple lines for baseline, +10%, and -10% contribution scenarios, interactive sliders for contribution amount and return rate, a nest egg reference line, and a retirement readiness summary panel. Retirement settings are consumed from the existing `GET /api/retirement` endpoint and optionally edited inline for first-time users via a lightweight setup form. The page follows the established page component pattern from `NetWorthPage.jsx` with local `useState` for all state management.

---

## Decision 1: Projection Engine Placement

**Decision:** All projection calculations run in the browser (frontend-only), using existing `generateProjectionSeries()` from `retirementMath.js` called within `useMemo` hooks.

**Rationale:** The projection math is O(n) where n is the number of months to retirement. For a 50-year projection (the maximum realistic case), that is 601 data points per scenario, 1803 total across three scenarios. Benchmarks show this completes in under 1ms on modern hardware. Frontend-only computation enables true real-time slider feedback (no network round-trip), reuses the existing tested utility functions without duplication, and requires no new API surface area. The existing `RetirementPanel` already uses this exact approach for its `projectedAtRetirement` calculation.

**Rejected alternatives:**

- **Backend projection endpoint (`POST /api/forecasting/project`):** Would add 100-300ms latency per slider change, making real-time exploration impossible without debouncing to a degree that breaks the interactive feel. Would also duplicate the `retirementMath.js` logic in Python with no compensating benefit, since the backend holds no data that the frontend does not already have after initial page load. The only scenario where backend computation makes sense is Monte Carlo simulation (Phase 5), which involves thousands of iterations with statistical distribution math -- a fundamentally different workload.

- **Web Worker:** Moves computation off the main thread. This is architecturally sound for CPU-intensive work, but the actual computation here is sub-millisecond. The overhead of posting messages to/from a Worker, plus the tooling complexity (Vite Worker setup, no existing precedent in the codebase), far exceeds any benefit. The codebase has zero Web Worker usage today, and introducing one for a trivially fast calculation sets a misleading precedent. If Phase 5 Monte Carlo proves slow enough to warrant a Worker, that decision should be made then.

**Risks:**
- Phase 5 Monte Carlo will likely require a different execution model (Worker or backend). The frontend-only approach for Phase 4 does not commit us to the same approach for Phase 5 -- the `retirementMath.js` module is a pure-function library that can be imported by a Worker without refactoring.

---

## Decision 2: New API Endpoints

**Decision:** No new API endpoints. The Forecasting page consumes two existing endpoints:

| Endpoint | Data Used | Existing? |
|----------|-----------|-----------|
| `GET /api/networth/by-type` | `series` (historical Retirement + Brokerage values), `cagr` (per-bucket CAGR for default return rate) | Yes |
| `GET /api/retirement` | `current_age`, `target_retirement_age`, `desired_annual_income`, `monthly_contribution`, `expected_return_pct`, `social_security_annual`, `withdrawal_rate_pct` | Yes |
| `POST /api/retirement` | Save retirement settings (inline setup form for first-time users) | Yes |

**Rationale:** Every data point needed for projections is already available from these endpoints. The projection math is frontend-only (Decision 1). Creating a new endpoint would add backend code, tests, and API surface for zero functional benefit.

**Rejected alternatives:**

- **Dedicated `GET /api/forecasting/data` endpoint** that pre-aggregates investable capital series and blended CAGR: Would reduce frontend computation by a few microseconds of addition/weighting, but adds backend code, a new test surface, and couples the backend to a frontend presentation concern. The frontend already fetches `by-type` data and can derive investable capital in a single loop.

- **`GET /api/forecasting/defaults` endpoint** returning computed slider defaults (blended CAGR, contribution amount): Same problem -- moves trivial computation to the backend for no benefit and adds a network dependency to what should be an instant calculation.

**Risks:**
- The Forecasting page makes the same API calls as `NetWorthPage`. If both pages are visited in one session, the data is fetched twice. This is acceptable because: the data is small (< 50KB), the calls are fast (< 100ms), and adding a shared cache or global state would be premature optimization that conflicts with the local-state-per-page pattern used everywhere else. If this becomes a real issue, SWR or React Query can be introduced project-wide later.

---

## Decision 3: New Utility Functions in retirementMath.js

**Decision:** Add three new exported functions to `/home/user/stashtrend/frontend/src/utils/retirementMath.js`:

### 3a. `getInvestableCapital(typeData)`

```
getInvestableCapital(typeData) => number | null
```

Extracts investable capital from the latest point in `typeData.series` by summing `Retirement` and `Brokerage` bucket values. Returns `null` if series is empty or missing.

**Rationale:** This logic currently exists inline in `RetirementPanel.jsx` (lines 44-48). Both `RetirementPanel` and `ForecastingPage` need this calculation. Extracting it to a shared utility eliminates duplication and ensures both pages use the same definition of "investable capital." The function is pure (no React dependency) and belongs in `retirementMath.js` alongside the other projection utilities.

After extraction, `RetirementPanel.jsx` should be updated to call `getInvestableCapital(typeData)` instead of its inline IIFE. This is a safe refactor -- same logic, same result, just moved.

### 3b. `computeBlendedCAGR(typeData)`

```
computeBlendedCAGR(typeData) => number
```

Computes balance-weighted average CAGR across Retirement and Brokerage buckets. Uses the longest available time period for each bucket independently (prefer 5Y > 3Y > 1Y). Falls back to 7.0% when no CAGR data exists for either bucket.

Algorithm:
1. Get latest balance for each bucket from `typeData.series[-1]`
2. Get best available CAGR for each bucket: try `cagr[bucket]["5y"]`, then `"3y"`, then `"1y"`, then `null`
3. If both CAGR values are null: return 7.0
4. If one is null: return the other bucket's CAGR (100% weight on the available one)
5. If both exist: return `(retBal * retCAGR + brokBal * brokCAGR) / (retBal + brokBal)`
6. Edge case: if total balance is 0 but both CAGRs exist, use simple average

**Rationale:** The requirements specify balance-weighted CAGR as the default return rate slider value. This is more accurate than a simple average because the larger portfolio bucket should dominate the blended rate. The 5Y > 3Y > 1Y priority per bucket (independently) is the correct choice over forcing the same window for both buckets -- it uses the best available estimate for each.

**Rejected alternatives:**

- **Simple arithmetic average of Retirement and Brokerage CAGR:** Misleading when balances differ significantly. A $500K retirement account at 8% and a $10K brokerage at 20% should not average to 14% -- the weighted result of 8.2% better reflects expected portfolio growth.

- **Use only the larger bucket's CAGR:** Simpler but ignores the smaller bucket entirely. With a 70/30 split, discarding 30% of the portfolio's return history throws away meaningful information.

- **Force both buckets to the same time window:** If Retirement has 5Y CAGR but Brokerage only has 1Y, forcing both to 1Y discards 4 years of useful Retirement data. Using each bucket's best available period independently gives the most informed estimate.

### 3c. `calculateContributionToTarget({ currentNetWorth, currentContribution, annualReturnPct, years, targetAmount })`

```
calculateContributionToTarget(opts) => number | null
```

Calculates the total monthly contribution needed to reach `targetAmount` (nest egg) by the end of `years`. Uses the closed-form future value of annuity formula to solve for payment, rather than iterative approximation.

Formula (closed-form, solving FV annuity for PMT):
```
r = annualReturnPct / 100 / 12   (monthly rate)
n = years * 12                    (total months)
fvLump = currentNetWorth * (1 + r)^n
shortfall = targetAmount - fvLump
if shortfall <= 0: return currentContribution (already on track)
neededContrib = shortfall * r / ((1 + r)^n - 1)
return Math.ceil(neededContrib / 100) * 100  (round up to nearest $100)
```

Returns: the total monthly contribution needed (not the additional amount). The caller computes the delta: `neededContrib - currentContribution` to display "Increase contributions by $X/month."

Returns `null` when `annualReturnPct` is 0 (division by zero in annuity formula) or `years <= 0`.

**Rationale:** The closed-form solution is exact, runs in O(1), and avoids the convergence questions of iterative approaches. The FV annuity formula is standard financial math. Rounding up to the nearest $100 matches the slider step size and gives the user an actionable number.

**Rejected alternatives:**

- **Iterative binary search using `generateProjectionSeries`:** Works but is O(n * log(range)) where n is months and range is the search space for contribution. Unnecessarily complex when a closed-form solution exists. Also harder to test edge cases.

- **Newton's method / iterative refinement:** Overkill for a monotonic single-variable equation with a known closed-form solution.

---

## Decision 4: Historical Investable Capital Series

**Decision:** Derive a historical investable capital time series from `typeData.series` by summing `Retirement + Brokerage` at each date point. Display this as a solid line on the chart preceding the projection start date.

```
historicalInvestable = typeData.series.map(pt => ({
  date: pt.date,
  net_worth: (pt.Retirement ?? 0) + (pt.Brokerage ?? 0)
}))
```

Then use `mergeHistoryWithProjection(historicalInvestable, projectionSeries)` to create the combined chart dataset.

**Rationale:** Showing historical data alongside projections provides critical context -- the user can see their actual growth trajectory and how the projection extends from it. Without history, the chart starts from a single point with no visual anchor. The `mergeHistoryWithProjection` utility already exists and handles the overlap at the transition date correctly (both `net_worth` and `projected_net_worth` keys present).

**Rejected alternatives:**

- **Projection-only chart starting from today:** Loses the context of how the user arrived at their current balance. The transition from history to projection is itself informative -- a flat history followed by an optimistic projection highlights unrealistic assumptions.

- **Show total net worth history (all buckets) instead of investable-only:** Would create a visual disconnect at the transition point where the historical line includes Cash, Real Estate, etc. but the projection only covers investable assets. The user would see a downward step at "today" which is confusing.

**Risks:**
- If a user has very little Retirement/Brokerage history but large balances in other buckets, the historical line will look artificially low compared to what they see on the Net Worth page. This is correct behavior (the Forecasting page explicitly projects investable capital only) but could confuse users. Mitigated by clear labeling: "Investable Capital (Retirement + Brokerage)" on the chart title/legend.

---

## Decision 5: Chart Implementation

**Decision:** Use Recharts `LineChart` with four `Line` components and one `ReferenceLine`:

| Line | Data Key | Style | Color | Purpose |
|------|----------|-------|-------|---------|
| Historical | `net_worth` | Solid, strokeWidth 2 | `COLOR_ACCENT` (#4D9FFF) | Actual investable capital over time |
| Baseline projection | `projected_net_worth` | Dashed (`strokeDasharray="8 4"`), strokeWidth 2 | `COLOR_ACCENT` (#4D9FFF) | Same color as historical to show continuity, dashed to distinguish |
| +10% contribution | `projected_plus10` | Dotted (`strokeDasharray="4 4"`), strokeWidth 1.5 | `COLOR_POSITIVE` (#2ECC8A) | Optimistic scenario |
| -10% contribution | `projected_minus10` | Dotted (`strokeDasharray="4 4"`), strokeWidth 1.5 | `COLOR_AMBER` (#F5A623) | Conservative scenario |
| Nest egg target | n/a (ReferenceLine) | Dashed horizontal | `COLOR_AMBER` (#F5A623) | Target reference |

**Rationale:** `LineChart` with multiple `Line` components is the established pattern in `GroupsTimeChart.jsx`. Using `strokeDasharray` for visual differentiation satisfies the accessibility requirement (not color alone). The color assignments follow the semantic design system: accent for primary data, green for positive scenario, amber for cautionary scenario. The nest egg reference line uses `ReferenceLine` which is already used in `TypeStackedChart` for milestones.

**Rejected alternatives:**

- **AreaChart with filled regions:** Overlapping filled areas create visual noise with 4+ series. The fill makes it hard to see where individual lines cross. Area charts work well for single-series or stacked data (as in `NetWorthChart` and `TypeStackedChart`) but not for comparison scenarios.

- **ComposedChart (Area for history, Lines for projection):** Technically possible with Recharts `ComposedChart`, but no existing precedent in the codebase. The `sharedChartElements()` utility was built for `LineChart`/`AreaChart` and may not compose cleanly with `ComposedChart`. The visual distinction between history and projection is already handled by line style (solid vs dashed), making a mixed chart type unnecessary complexity.

**Risks:**
- The merged dataset from `mergeHistoryWithProjection` will have `null` values for projection keys on historical dates and `null` for `net_worth` on future dates. Recharts `Line` with `connectNulls={false}` (default) handles this correctly -- it only draws where data exists. Verify this in implementation with a quick visual test.

---

## Decision 6: Component Hierarchy and Data Flow

**Decision:** The following component tree, all under `src/pages/` and `src/components/`:

```
ForecastingPage (src/pages/ForecastingPage.jsx)
├── Page header (h1 "Forecasting" + Refresh button)
├── Loading / Error guards
├── [if no retirement settings] ForecastingSetup (inline setup form)
├── ForecastingControls (sliders + reset button)
│   ├── SliderInput (monthly contribution)
│   └── SliderInput (annual return rate)
├── ForecastingChart (Recharts LineChart)
│   ├── Historical line
│   ├── Baseline projection line
│   ├── +10% projection line
│   ├── -10% projection line
│   ├── Nest egg ReferenceLine
│   └── Custom tooltip
└── ForecastingSummary (retirement readiness cards + gap analysis)
    ├── Investable capital card
    ├── Nest egg needed card
    ├── Projected at retirement card
    ├── Gap amount card
    ├── On/Off track badge
    └── Contribution suggestion text
```

### New files:

| File | Type | Purpose |
|------|------|---------|
| `src/pages/ForecastingPage.jsx` | Page component | Top-level page: data fetching, state management, layout |
| `src/pages/ForecastingPage.module.css` | CSS Module | Page-level layout styles |
| `src/components/ForecastingChart.jsx` | Chart component | Recharts LineChart with projection lines and reference lines |
| `src/components/ForecastingChart.module.css` | CSS Module | Chart container styles |
| `src/components/ForecastingControls.jsx` | Controls component | Slider inputs, reset button, control layout |
| `src/components/ForecastingControls.module.css` | CSS Module | Control layout and slider styles |
| `src/components/ForecastingSummary.jsx` | Summary component | Retirement readiness cards, gap analysis, on/off track badge |
| `src/components/ForecastingSummary.module.css` | CSS Module | Summary card grid styles |
| `src/components/ForecastingSetup.jsx` | Setup component | Inline retirement settings form for first-time users |
| `src/components/ForecastingSetup.module.css` | CSS Module | Setup form styles |
| `src/components/SliderInput.jsx` | Reusable control | Generic labeled slider + numeric input with bidirectional sync |
| `src/components/SliderInput.module.css` | CSS Module | Slider and input styles |

### Modified files:

| File | Change |
|------|--------|
| `src/nav.js` | Add `/forecasting` entry after `/networth` |
| `src/App.jsx` | Add import + Route for `ForecastingPage` |
| `src/utils/retirementMath.js` | Add `getInvestableCapital`, `computeBlendedCAGR`, `calculateContributionToTarget` |
| `src/components/RetirementPanel.jsx` | Replace inline investable capital IIFE with `getInvestableCapital(typeData)` call |

### Data flow:

1. `ForecastingPage` fetches `typeData` and `retirement` on mount via `Promise.all`
2. `ForecastingPage` computes derived values: `investableCapital`, `blendedCAGR`, `historicalSeries`
3. `ForecastingPage` initializes slider state from retirement settings + computed defaults
4. Slider state lives in `ForecastingPage` as `useState` (contribution, returnRate)
5. On slider change, `useMemo` recomputes: 3 projection series, merged chart data, projected-at-retirement, nest egg, gap analysis
6. Props flow down: `ForecastingControls` receives slider values + onChange handlers; `ForecastingChart` receives merged data; `ForecastingSummary` receives computed summary values

**Rationale:** This follows the established pattern from `NetWorthPage`: all state local to the page component, data fetched on mount with `Promise.all`, props passed down to presentational children. No global state, no context providers, no custom hooks beyond `useResponsive`. The component boundaries are drawn at natural visual/responsibility boundaries: controls, chart, summary.

`SliderInput` is extracted as a reusable component because both the contribution and return rate sliders share identical structure (label + numeric input + range slider with bidirectional sync). Building it once avoids duplicated slider logic and cross-browser styling.

**Rejected alternatives:**

- **Single monolithic `ForecastingPage` with everything inline:** Would create a 400+ line component. The chart, controls, and summary have clear independent responsibilities that benefit from separation for readability and testability.

- **useReducer for slider state:** The state is just two numbers (contribution, returnRate). `useState` with two calls is simpler and sufficient. `useReducer` adds indirection for no benefit at this scale.

- **React Context for sharing data between components:** Unnecessary when there is a single page component passing props to direct children. Context is for avoiding prop drilling through multiple layers -- our tree is only 2 levels deep.

- **Reuse `RetirementSummary` component directly:** `RetirementSummary` displays a simple list of rows. The Forecasting page needs a card grid layout, gap analysis text, contribution suggestion, and dynamic updating from sliders. The data shape and presentation are different enough that a new `ForecastingSummary` component is warranted. Forcing `RetirementSummary` to handle both use cases would create a confusing prop API.

**Risks:**
- The page fetches both `typeData` and `retirement` on mount. If the retirement endpoint returns `exists: false`, the page still renders (with slider defaults and no nest egg line). The `.catch(() => ({ exists: false }))` pattern from `NetWorthPage` should be replicated.

---

## Decision 7: State Management for Interactive Controls

**Decision:** Slider state is managed via `useState` in `ForecastingPage`. All derived values (projections, summary data) are computed via `useMemo` keyed on the slider values and fetched data.

```
State (useState in ForecastingPage):
  contribution: number     -- current slider value
  returnRate: number       -- current slider value
  typeData: object | null  -- fetched on mount
  retirement: object | null -- fetched on mount
  loading: boolean
  error: string | null

Derived (useMemo):
  investableCapital: number | null
  blendedCAGR: number
  historicalSeries: Array
  baselineProjection: Array
  plus10Projection: Array
  minus10Projection: Array
  mergedChartData: Array
  projectedAtRetirement: number | null
  nestEgg: number | null
  gapAmount: number | null
  neededContribution: number | null
  isOnTrack: boolean | null
```

Slider changes trigger a re-render of `ForecastingPage`. The `useMemo` dependencies ensure projections are only recomputed when inputs actually change. Given the sub-millisecond cost of the projection math, no debouncing is needed for the computation itself. However, the slider `onChange` should use a modest debounce (50ms) to prevent excessive re-renders during rapid dragging -- this is a Recharts rendering concern, not a computation concern.

**Decision on slider value persistence:** Slider values are ephemeral (exploration-only). There is no "Save as defaults" button on the Forecasting page. The rationale: the Forecasting page is for what-if exploration, and the retirement settings page (on the Net Worth page) is the canonical place to save settings. Mixing exploration with persistence on the same page creates confusion about what is "saved" vs "exploring." If the user wants to change their saved contribution or return rate, they navigate to Net Worth and edit the retirement panel.

**Rejected alternatives:**

- **Debounce slider value updates (not just rendering):** Would create visible lag between slider position and displayed value in the numeric input, breaking the bidirectional sync requirement. Instead, debounce only at the chart rendering layer if needed.

- **"Save as defaults" button:** Creates a read-modify-write flow where the page reads current retirement settings, merges slider values, and POSTs back. This has a subtle race condition if settings are edited in another tab, and it blurs the line between exploration and commitment. The requirements document flagged this as an open question -- the architecture decision is to exclude it. Users who want to save changed assumptions do so through the retirement panel on Net Worth.

**Risks:**
- Without a save mechanism, users who discover a good contribution target through exploration must remember the number and manually enter it on the Net Worth page. This is a UX friction point. Mitigation: the "Edit Settings" link at the bottom of the Forecasting page navigates to the Net Worth page, providing a clear path. If user feedback shows this is too cumbersome, a "Save" button can be added in a future iteration without architectural changes (it is just a `saveRetirement` call with merged values).

---

## Decision 8: Retirement Settings Integration and First-Time Setup

**Decision:** The Forecasting page reads retirement settings via `fetchRetirement()` on mount. It does NOT duplicate the full `RetirementPanel` editing form. Instead:

- **If settings exist:** Display a compact read-only summary at the bottom of the page (age, target age, income, contribution) with an "Edit Settings" link that navigates to `/networth` (where `RetirementPanel` lives).

- **If settings do not exist (`exists: false`):** Display a `ForecastingSetup` component -- a lightweight inline form with only the 4 essential fields (current age, target retirement age, desired annual income, monthly contribution). An "Advanced" toggle reveals Social Security, withdrawal rate, and expected return -- same pattern as `RetirementPanel`. On save, calls `saveRetirement()` and re-fetches, then the page renders with the new settings.

`ForecastingSetup` is a new component, not a reuse of `RetirementPanel`, because:
1. `RetirementPanel` is tightly coupled to its parent (`NetWorthPage`) through the `data`/`onSave`/`typeData` prop contract and includes `MilestoneEditor` which is irrelevant to Forecasting.
2. The Forecasting setup form is intentionally minimal -- it does not include milestones.
3. The two forms serve different purposes: `RetirementPanel` is for ongoing editing; `ForecastingSetup` is a one-time onboarding gate.

However, the save payload shape is identical (both POST to `/api/retirement` with the same schema), so the `saveRetirement` API helper is reused directly.

**Rejected alternatives:**

- **Embed `RetirementPanel` directly on the Forecasting page:** Creates visual clutter (the full form with milestones, all fields visible) on a page whose primary purpose is chart-based exploration. The panel is designed for a settings-editing context, not a chart-viewing context.

- **Extract shared form fields into a `RetirementForm` base component used by both panels:** Architecturally clean but over-engineered for Phase 4. The two forms differ in which fields they show by default, whether milestones are included, and how they interact with their parent. Extracting a shared component would require a complex props/slots API. If a third consumer appears, extraction becomes worthwhile.

- **Redirect to Net Worth page if no settings exist:** Breaks the user flow. The user navigated to Forecasting, so they should be able to set up and see results without leaving.

**Risks:**
- Two forms can save retirement settings (`RetirementPanel` on NW page, `ForecastingSetup` on Forecasting page). If the user saves from Forecasting, then visits NW, the NW page fetches fresh data and reflects the changes. No stale data risk because each page fetches independently on mount. The single-row DB constraint (`CHECK (id = 1)`) ensures there is always exactly one settings record.

---

## Decision 9: Investable Capital Calculation Consolidation

**Decision:** Extract the investable capital calculation from `RetirementPanel.jsx` into `getInvestableCapital(typeData)` in `retirementMath.js`. Both `RetirementPanel` and `ForecastingPage` call this shared function.

Additionally, derive the full historical investable capital series in `ForecastingPage`:

```js
const historicalSeries = useMemo(() => {
  if (!typeData?.series?.length) return []
  return typeData.series.map(pt => ({
    date: pt.date,
    net_worth: (pt.Retirement ?? 0) + (pt.Brokerage ?? 0)
  }))
}, [typeData])
```

This derivation stays inline in `ForecastingPage` rather than being extracted to a utility because it is page-specific (only the Forecasting chart needs a time series of investable capital -- `RetirementPanel` only needs the latest value).

**Rationale:** The `getInvestableCapital` extraction is a straightforward DRY improvement. The function is 4 lines, pure, and has a clear single responsibility. Keeping the time series derivation inline follows the existing pattern where page components do their own data transformation before passing to chart components (see `NetWorthPage` and `GroupsPage`).

**Risks:**
- The refactor of `RetirementPanel` to use the extracted function changes the import graph but not the behavior. Tests for `RetirementPanel` should continue to pass without modification. Add a unit test for `getInvestableCapital` covering: normal case, empty series, missing Retirement key, missing Brokerage key, both missing.

---

## Decision 10: Navigation Integration

**Decision:** Add `/forecasting` to `NAV_ITEMS` in `nav.js` as the second entry (after Net Worth, before Account Groups):

```js
export const NAV_ITEMS = [
  { path: '/networth',    label: 'Net Worth',      icon: '📈' },
  { path: '/forecasting', label: 'Forecasting',    icon: '🔮' },
  { path: '/groups',      label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',     label: 'Budgets',        icon: '💰' },
  { path: '/builder',     label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',        label: 'Sync Data',      icon: '🔄' },
]
```

Add a corresponding route in `App.jsx`:
```jsx
<Route path="/forecasting" element={<ForecastingPage />} />
```

**Rationale:** Forecasting is a natural extension of Net Worth -- it projects the same data forward. Placing it immediately after Net Worth creates a logical flow: see where you are (Net Worth) then see where you are headed (Forecasting). Both `Sidebar` and `BottomTabBar` iterate `NAV_ITEMS`, so a single array addition populates both navigation surfaces automatically.

The crystal ball icon (`🔮`) is distinct from other nav icons and conceptually appropriate for forecasting/projection. If the user or designer objects, it can be changed in a single line.

**Rejected alternatives:**

- **Place after Budgets:** Breaks the data-domain grouping. Net Worth and Forecasting share the same data sources (account balances, retirement settings). Budgets and Budget Builder are a separate domain (spending/income).

- **Place as last item (before Sync):** Buries the feature. Forecasting is a primary analytical feature, not a utility.

**Risks:**
- Adding a 6th item to the mobile bottom tab bar may crowd the bar on narrow screens (< 360px). The existing 5 items already fill the bar. Mitigation: the `BottomTabBar` component should handle overflow gracefully (e.g., smaller icon/label sizing, or horizontal scroll). Verify during Playwright QA on a narrow viewport.

---

## Decision 11: Contribution Variant Lines Behavior

**Decision:** When the contribution slider is at $0, display a single projection line labeled "Growth only (no contributions)" instead of three identical lines. When the contribution slider is > $0, display three lines: baseline, +10%, -10%.

The +/-10% variants are computed as:
```js
const plus10Contrib = Math.round(contribution * 1.1 / 100) * 100  // round to step
const minus10Contrib = Math.round(contribution * 0.9 / 100) * 100
```

Rounding to the nearest $100 (the slider step) ensures the variant values are "clean" numbers that make sense to the user.

**Rationale:** Three overlapping identical lines at $0 contribution provide no information and could confuse users wondering why the lines appear the same. The requirements explicitly call for this behavior (US-2 acceptance criteria). Rounding variant contributions to the slider step prevents displaying odd numbers like "$1,650/month" when the slider only moves in $100 increments.

**Risks:**
- At very low contributions ($100-$200), the +/-10% variants round to the same value as baseline, producing three identical lines again. Mitigation: when `plus10Contrib === contribution` or `minus10Contrib === contribution`, suppress the duplicate line. This is an edge case the implementation should handle explicitly.

---

## Decision 12: SliderInput Component Design

**Decision:** Create a generic `SliderInput` component used for both the contribution and return rate sliders:

```
SliderInput({ label, value, onChange, min, max, step, format, ariaLabel })
```

Props:
- `label`: Display label text
- `value`: Current numeric value (controlled)
- `onChange`: Callback with new numeric value
- `min`, `max`, `step`: Range constraints
- `format`: Function to format the display value (e.g., `v => '$' + v.toLocaleString()` or `v => v.toFixed(1) + '%'`)
- `ariaLabel`: Accessibility label for the range input

The component renders:
1. A label element
2. A numeric `<input type="text">` (not `type="number"` -- see below) showing the formatted value
3. An `<input type="range">` slider

Bidirectional sync: changing either input updates the shared `value` via `onChange`. The text input parses on blur (strips formatting characters, clamps to min/max). The range input updates on every `onChange` event.

**Why `type="text"` instead of `type="number"`:** The dollar contribution input needs formatting (commas, dollar sign) which `type="number"` does not support. Using `type="text"` with `inputMode="decimal"` gets the numeric keyboard on mobile while allowing formatted display. The return rate input could use `type="number"` but using the same component for both with consistent behavior is simpler.

**Rejected alternatives:**

- **Separate components for dollar slider and percentage slider:** Duplicates 90% of the logic. The only difference is the format function and the input constraints, which are already parameterized via props.

- **Use a third-party slider library (rc-slider, react-range):** Adds a dependency for a straightforward HTML range input. The project has zero third-party UI component dependencies beyond Recharts, and the custom styling needed (dark theme, cobalt accent) would require overriding the library's styles anyway.

**Risks:**
- Cross-browser range input styling is notoriously inconsistent. Webkit, Firefox, and IE/Edge all use different pseudo-elements for the thumb and track. The CSS module will need vendor-prefixed selectors. This is the first range input in the codebase, so there is no existing pattern to follow. Budget time for cross-browser visual testing.

---

## Design Details Summary

### Data Model Changes
None. No database schema changes. No new tables. No migration.

### API Contract Changes
None. No new endpoints. No changes to existing endpoint request/response shapes.

### Component Structure
See Decision 6 for the full component tree and file list.

### Integration Points

| Integration Point | How |
|---|---|
| `retirementMath.js` | 3 new functions added; 1 existing function (`getInvestableCapital`) extracted from `RetirementPanel` |
| `chartUtils.jsx` | Reuse `sharedChartElements`, `fmtCompact`, `fmtFull`, `COLOR_*`, `TOOLTIP_STYLE`, `downsample`, `filterByRange` -- no modifications needed |
| `api.js` | Reuse `fetchNetworthByType`, `fetchRetirement`, `saveRetirement` -- no modifications needed |
| `nav.js` | Add 1 entry to `NAV_ITEMS` array |
| `App.jsx` | Add 1 import + 1 Route |
| `RetirementPanel.jsx` | Replace inline investable capital IIFE with `getInvestableCapital()` call; add import |

---

## Open Questions Requiring Human Input

1. **Nav icon choice:** The architecture specifies `🔮` (crystal ball). The user should confirm or suggest an alternative. This is a cosmetic decision with no architectural impact.

2. **Negative CAGR warning placement:** When the blended historical CAGR is negative, where should the warning message appear? Options: (a) inline next to the return rate slider, (b) as a banner above the chart, (c) as a tooltip on the slider. Recommendation: (a) inline next to the slider, as it is contextually relevant to the default value shown. Needs user/designer confirmation.

3. **Mobile bottom tab bar with 6 items:** Adding Forecasting makes 6 nav items in the mobile bottom bar. The designer should verify this fits on 360px-wide screens and specify the overflow behavior if it does not (smaller labels, horizontal scroll, or grouping).

4. **CAGR time window display:** Should the default return rate slider show which time window(s) were used to compute the blended CAGR? For example: "7.2% (based on 5Y Retirement + 1Y Brokerage)" as helper text. This aids transparency but adds visual complexity. Recommendation: show it as subtle helper text below the slider. Needs user confirmation.

---

## Risks and Mitigations Summary

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Mobile bottom tab bar overflow with 6 items | Medium | Low | Test on 360px viewport during Playwright QA; fall back to smaller labels or icon-only mode |
| 2 | Cross-browser range input styling inconsistency | High | Low | Budget extra CSS time; test on Chrome, Firefox, Safari; use vendor prefixes |
| 3 | Recharts `Line` with null values in merged dataset | Low | Medium | Verify `connectNulls={false}` behavior; add integration test with mixed null data |
| 4 | Users want to save slider values but no save mechanism exists | Medium | Low | "Edit Settings" link provides a path; add save button in future iteration if feedback warrants |
| 5 | Phase 5 Monte Carlo requires different computation architecture | Certain | Low | Phase 4 math is in pure functions that can be imported into a Web Worker without refactoring |
| 6 | Stale data if user edits retirement settings in another tab | Low | Low | Single-user local app; each page fetches on mount; no real concurrency concern |
| 7 | Variant lines collapse at low contribution amounts ($100-$200) | Low | Low | Suppress duplicate lines when rounded +/-10% equals baseline |
