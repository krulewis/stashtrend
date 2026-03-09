# Research Report — Phase 2.1: Milestone Basis Correction + Retirement Progress UX

**Date:** 2026-03-09
**Researcher:** Research Agent
**Status:** Complete — ready for Architect

---

## Problem Summary

Phase 2 shipped milestone tracking as horizontal dashed `ReferenceLine` elements drawn on the `TypeStackedChart`, whose Y-axis represents the *total stacked net worth* across all buckets. This is financially incorrect: milestones should be evaluated against *investable capital* (Retirement + Brokerage balances only), which is the money that can actually fund retirement withdrawals under the 4% rule. Including home equity, cash, and debt in the denominator gives a falsely optimistic picture.

Phase 2.1 must fix two things:

1. **Data correctness:** Remove milestone `ReferenceLine` elements from `TypeStackedChart`. Any new visualization must use the Retirement + Brokerage sum as the comparison basis (already computed correctly in `RetirementPanel.jsx` lines 44–48).

2. **UX quality:** Replace the current reference lines with a more effective pattern that answers: where am I now, how far along, when will I get there, am I on pace, and which milestones are already achieved.

No new backend endpoints or data fetches are permitted — all needed data already arrives from `/api/networth/by-type` (typeData) and `/api/retirement`.

---

## Codebase Context

### Data Flow: typeData and investableCapital

`typeData` is fetched from `/api/networth/by-type` and stored in `NetWorthPage.jsx` state. It contains:
- `series: [{date, Retirement, Brokerage, Cash, "Real Estate", Debt, Other}, ...]`
- `cagr: {Retirement: {1y, 3y, 5y}, Brokerage: ..., ...}`
- `bucket_colors`, `bucket_order`

`RetirementPanel.jsx` (lines 44–48) already computes investable capital correctly:
```js
const investableCapital = (() => {
  if (!typeData?.series?.length) return null
  const latest = typeData.series[typeData.series.length - 1]
  return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
})()
```

This value is passed down to `RetirementSummary.jsx` which renders it as "Current investable capital." The projection for "Projected at retirement" also correctly uses `investableCapital` as the starting balance (lines 51–62).

The investable capital *series* (not just the latest point) can be derived by mapping `typeData.series` as `(d.Retirement ?? 0) + (d.Brokerage ?? 0)` for each date — no backend change needed.

### Current Milestone Rendering (the Bug)

In `TypeStackedChart.jsx` (lines 157–166):
```jsx
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
```

The `yAxisId="left"` axis represents the sum of *all* stacked positive buckets (Retirement + Brokerage + Cash + Real Estate + Other), i.e., total asset-side net worth. If the user has $400K in investable assets plus $400K in home equity, a $500K milestone line will show as "nearly reached" when in reality investable capital is only $400K. The bug is confirmed: milestones are drawn against the wrong denominator.

Data flow for milestones: `NetWorthPage.jsx` passes `retirement?.milestones` to `TypeStackedChart`. The retirement data includes `milestones: [{label, amount}, ...]` deserialized from the JSON column in `retirement_settings`.

### Key Files and Their Roles

| File | Role | Relevant Lines |
|------|------|----------------|
| `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` | Stacked area chart with buggy milestone ReferenceLine rendering | 62, 157–166, 218–221 |
| `/home/user/stashtrend/frontend/src/components/RetirementPanel.jsx` | Form + investableCapital computation | 44–62 |
| `/home/user/stashtrend/frontend/src/components/RetirementSummary.jsx` | Nest egg / projected / on-track summary | entire file |
| `/home/user/stashtrend/frontend/src/components/MilestoneEditor.jsx` | Add/remove/edit milestone rows | entire file |
| `/home/user/stashtrend/frontend/src/pages/NetWorthPage.jsx` | Data fetching, state orchestration, component wiring | 99 (TypeStackedChart), 101–107 (RetirementPanel) |
| `/home/user/stashtrend/frontend/src/utils/retirementMath.js` | `computeNestEgg()`, `generateProjectionSeries()`, `mergeHistoryWithProjection()` | entire file |
| `/home/user/stashtrend/frontend/src/components/chartUtils.jsx` | Shared chart tokens, `COLOR_AMBER = '#F5A623'`, formatters | 119 |
| `/home/user/stashtrend/frontend/src/index.css` | Design tokens: `--color-warning: var(--amber)`, `--amber: #F5A623` | 49, 56 |
| `/home/user/stashtrend/backend/app.py` | `/api/retirement` GET/POST, `/api/networth/by-type` | 2285–2415, 814–892 |

### Recharts Version and Capabilities

The project uses **Recharts 2.12.7** (`frontend/package.json` line 21). Confirmed available components:
- `ReferenceLine` — horizontal/vertical line with `label`, `yAxisId`, `ifOverflow`, `strokeDasharray`. Used currently at TypeStackedChart line 158. Known label positioning issues (see External Research below).
- `ReferenceDot` — plotted at `(x, y)`. Supports custom `shape` prop accepting an SVG component. Useful for pinning milestone markers to a specific date+amount intersection.
- `Area` — stacked area via `stackId`. Already in use for both left and right axes.
- The dual-YAxis pattern (left for positive buckets, right for Debt) is already implemented.

### Existing Projection Capability

`generateProjectionSeries()` in `retirementMath.js` generates a compound-growth projection series from a starting balance. It already accepts `currentNetWorth`, `monthlyContribution`, `annualReturnPct`, and `years`. This is used in `RetirementPanel.jsx` for the "Projected at retirement" value. The same function could generate a full forward-looking series for milestone intersection finding.

`mergeHistoryWithProjection()` merges historical and projected series into a single date-sorted array. This is already available and tested.

### Projected Date Calculation (No Backend Needed)

A milestone projected date can be computed purely in JavaScript:
1. Extract the investable capital time series from `typeData.series` by summing `Retirement + Brokerage` per point.
2. Compute the CAGR from the latest `typeData.cagr.Retirement` and `typeData.cagr.Brokerage` (weighted by current balance), or use the user's `expected_return_pct` from retirement settings.
3. Use `generateProjectionSeries()` starting from current investable capital, running until each milestone amount is crossed. Find the first projected data point where `projected_net_worth >= milestone.amount`.
4. Edge case: if no return rate available and no CAGR, omit projected dates.

This is fully frontend-computable with existing utilities, satisfying SC-12 (no new network requests).

### Mobile Responsiveness Patterns

The existing codebase uses `useResponsive()` (breakpoints: mobile < 768px, tablet 768–1023px, desktop >= 1024px) for JS-driven sizing. CSS module media queries handle layout reflow. `TypeStackedChart.module.css` demonstrates the established pattern: mobile-first CSS with `@media (min-width: 768px)` overrides. The `RetirementPanel.module.css` shows a 2-column grid that collapses to 1-column at 600px.

### Design Token System

All new components must use CSS custom properties from `index.css`. Relevant tokens for milestones:
- `--color-warning: var(--amber)` / `--amber: #F5A623` — existing amber color for milestone marker
- `--color-positive: var(--green)` / `--green: #2ECC8A` — for achieved milestones
- `--color-negative: var(--red)` / `--red: #FF5A7A` — for off-track state
- `--accent: #4D9FFF` — for in-progress state
- `--bg-card`, `--border`, `--radius-lg`, `--text-primary`, `--text-secondary`, `--text-muted`
- Recharts SVG attributes cannot use CSS vars — use `COLOR_AMBER`, `COLOR_POSITIVE`, `COLOR_NEGATIVE` from `chartUtils.jsx`

---

## Options Evaluated

### Option 1: Milestone Progress Cards (Pure HTML/CSS, No Chart)

**Description:** Replace the buggy `ReferenceLine` elements with a standalone `MilestoneTracker` component rendered between `TypeStackedChart` and `RetirementPanel` in `NetWorthPage.jsx`. The component renders a vertical list (or responsive grid) of cards — one per milestone plus the nest egg target. Each card shows:
- Milestone label + dollar amount
- Current progress: dollar amount and percentage of investable capital vs. milestone (`investableCapital / milestone.amount * 100`)
- A CSS progress bar (achieved = green, in-progress = blue, future = muted)
- Projected date to reach the milestone (computed from `generateProjectionSeries()`)
- An "Achieved" checkmark badge when `investableCapital >= milestone.amount`

No Recharts involved. Progress bars are pure CSS (`width: calc(X%)` with `max-width: 100%`).

**Pros:**
- Zero chart library friction — no label overflow/clipping bugs, no `yAxisId` issues
- Full design control over colors, typography, spacing, mobile layout
- Directly answers all 5 user questions (SC-4 through SC-8) in a scannable format
- Mobile is trivially handled: cards stack vertically below 768px
- Easiest to add ARIA labels/roles for accessibility (SC-10)
- Progress bars are accessible (use `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`)
- Computed values (percentage, projected date) are visible as text — screen-reader friendly
- No regression risk: completely new file, TypeStackedChart change is a deletion

**Cons:**
- No visual connection to the time-series data — "projected date" is a text label, not shown on the chart
- Progress bars for very large milestone distances (e.g., $100K investable vs. $50M milestone) render as a near-invisible sliver; mitigated by clamping to a minimum visual width of ~3%
- Does not show the historical trajectory of investable capital — user cannot see *how* they arrived at current progress

**Effort estimate:** Low — new component (~80–120 lines), no backend changes, minimal `NetWorthPage.jsx` wiring changes.

**Compatibility:** Excellent. Follows the same card-based pattern as `StatsCards.jsx` and `RetirementSummary.jsx`. Uses existing CSS module conventions and design tokens.

---

### Option 2: Investable Capital Overlay on TypeStackedChart + Milestone Markers

**Description:** Keep milestone visualization *in the chart*, but fix the denominator. Add a new `Area` or `Line` series to `TypeStackedChart` that plots the investable capital sum (Retirement + Brokerage) over time. Milestone `ReferenceLine` elements are then drawn against the *investable capital* Y-scale, not the total stacked NW scale.

Two sub-options:
- **2a:** Add a separate `Line` overlay (non-stacked) showing `Retirement + Brokerage` sum, using a second `stackId`-free `Area` or a `Line`. The left YAxis already covers this range. Milestone `ReferenceLine` elements are drawn at `y={m.amount}` against this scale — now accurate.
- **2b:** Add a separate mini-chart below the stacked area chart that shows only investable capital over time, with milestone reference lines. This avoids crowding the existing chart.

**Pros:**
- Users can see the historical investable capital growth trajectory — more context than a static progress bar
- Milestone reference lines show visually where history is relative to each target
- Sub-option 2b avoids visual crowding by using a separate chart

**Cons:**
- ReferenceLine label overflow/clipping issues in Recharts 2.x are well-documented (see External Research). With multiple milestones, labels will stack on top of each other when milestone amounts are close, or get clipped at the SVG boundary. Workarounds (foreignObject, custom label component, explicit margin) add significant complexity.
- Adding a non-stacked overlay line to a stacked area chart is architecturally messy: the Y-axis domain is dominated by the stacked total, so an investable capital line (which is a subset of the total) renders inside the stacked area itself, making it hard to read.
- Sub-option 2a: The label overlap problem gets worse as users add more milestones. Recharts has no built-in label collision avoidance.
- Sub-option 2b: Requires a new chart component with its own Recharts instance, essentially the same effort as Option 1 but with more complexity.
- Does not clearly answer "when will I get there?" — projected date requires either an annotation on a projected series extension (complex) or separate text rendering.
- The dual-axis pattern in TypeStackedChart (left for assets, right for Debt) already adds cognitive overhead. Adding a third "investable capital" overlay makes the chart harder to read.

**Effort estimate:** Medium (2a) to High (2b). The label collision problem requires non-trivial custom label component work.

**Compatibility:** Moderate. The dual-axis structure in TypeStackedChart is already complex. Adding more layers increases fragility.

---

### Option 3: Milestone Timeline / Progress Track (CSS-based horizontal timeline)

**Description:** A horizontal milestone timeline widget, similar to a step indicator, rendered outside the chart. Milestones are sorted by amount and displayed as nodes on a horizontal track. The current investable capital position is marked as a filled indicator along the track. Achieved milestones are shown with a check, next milestone shows current % progress, future milestones are dimmed. Above or below each node: the dollar label and projected date.

On mobile, the timeline either scrolls horizontally or collapses to a vertical list (same as Option 1).

**Pros:**
- Visually distinctive — different from anything currently in Stashtrend, potentially more engaging
- Directly shows the "journey" from achieved milestones to future ones
- Milestone ordering and relative distance are visually apparent
- The nest egg target can be the "final" node on the track

**Cons:**
- Proportional spacing is tricky: if milestones are at $500K, $1M, $2M, and $5M, a linear scale makes the $5M node 10x farther from $500K than the $500K-to-$1M segment. A log scale looks unnatural for most users. Non-proportional (equal spacing) is more readable but loses meaningful distance information.
- Label collision is worse on a horizontal layout than a vertical one — projected dates for closely-spaced milestones overlap
- Requires more CSS engineering than Option 1 for the track, node, and progress indicator
- Mobile responsiveness requires horizontal scrolling or a layout toggle, adding complexity
- The "current progress bar toward the next milestone" still needs a percentage indicator — you end up needing both the timeline AND a detail view for the closest milestone
- If the user has 0 or 1 milestones, a timeline is not meaningful — it degrades to a single node

**Effort estimate:** Medium-High. CSS engineering is non-trivial (track, nodes, progress indicator, mobile fallback).

**Compatibility:** Moderate. The horizontal timeline pattern doesn't have a precedent in the current component library.

---

### Option 4: Dedicated Investable Capital Mini-Chart with Projection and Milestone Bands

**Description:** A new `InvestableCapitalChart` component using Recharts `AreaChart`. It plots:
- Historical investable capital (Retirement + Brokerage sum) as a single area series
- A forward-looking projection line computed from `generateProjectionSeries()` using the user's `expected_return_pct`
- Milestone amounts as horizontal `ReferenceLine` elements — but now against a Y-axis that *only* covers investable capital (not total NW), so the comparison is accurate
- Optionally: shade the region between the current value and the retirement nest egg target

This is similar to Option 2b but more self-contained: a standalone component with its own Recharts chart instance, focused entirely on investable capital.

**Pros:**
- Shows historical trajectory AND future projection — most informative of all options
- Milestone reference lines are now correctly anchored to the investable capital Y-axis
- The projection line showing "when you'll hit each milestone" is directly visible on the chart — no need for separate "projected date" text per milestone (the line intersection tells the story)
- Aligns with Wealthfront and Empower's pattern of showing a projected trajectory with goal markers
- `mergeHistoryWithProjection()` already exists and is tested — the data merging is a one-liner

**Cons:**
- ReferenceLine label collisions are still a problem if milestones are close together on the Y-axis
- Adds a third chart to the Net Worth page (NetWorthChart + TypeStackedChart + this). Page length grows.
- The projection line requires the user to have set `expected_return_pct` in advanced settings. Without it, the projection cannot run (EC-6). Fallback: show just the historical line with a notice.
- Reading projected milestone dates off a chart requires user effort (hover tooltip). Options 1 and 3 give the date as explicit text, which is faster to scan.
- More Recharts surface area means more risk of SVG label bugs, clipping, and yAxisId issues

**Effort estimate:** Medium-High. New chart component with data merging + projection + reference lines + edge case handling.

**Compatibility:** Good for the data model. Moderate for page complexity (third chart on the page).

---

## Recommendation

**Option 1 (Milestone Progress Cards) is the best starting point, with a targeted addition from Option 4 as an optional enhancement.**

### Primary Recommendation: Option 1

The requirements (SC-4 through SC-8) are fundamentally tabular/list-style information needs: dollar amount, progress %, projected date, achieved vs. not. Progress cards answer all five questions more directly than any chart-based approach because:

1. Projected date is a *text answer*, not a chart inference. Cards render it explicitly.
2. Progress percentage is precisely what `role="progressbar"` components communicate — this is a solved accessibility pattern.
3. Label collision, SVG clipping, and `yAxisId` confusion are entirely avoided.
4. Mobile layout is trivially handled by stacking cards vertically.
5. Effort is lowest, risk is lowest, and the pattern integrates naturally with existing card-based components (`StatsCards`, `RetirementSummary`).

The component should:
- Compute an investable capital series from `typeData.series` (simple mapping — no new data)
- Compute projected milestone dates using `generateProjectionSeries()` from `retirementMath.js`
- Handle EC-1 through EC-9 edge cases explicitly
- Sort milestones by amount (EC-7)
- Treat `investableCapital < 0` as 0 (EC-9)
- Omit projected dates when `expected_return_pct` is absent (EC-6), defaulting gracefully
- Show the nest egg target (if `desired_annual_income` is set) as a distinguished "final milestone"

### Placement in NetWorthPage

The new `MilestoneTracker` component (or similar name) should be placed between `TypeStackedChart` and `RetirementPanel`:

```
NetWorthChart (total NW history)
TypeStackedChart (NW by bucket, CAGR table) — milestone ReferenceLine removed
MilestoneTracker (NEW — investable capital progress toward milestones)  ← here
RetirementPanel (form + RetirementSummary)
```

### Optional Enhancement: Investable Capital Line on TypeStackedChart

If the designer decides it adds value, a single non-stacked `Line` (not `Area`) can be added to `TypeStackedChart` showing the investable capital sum. This gives users context on how Retirement + Brokerage has grown relative to the full stack without adding a fourth chart. This is a deferred decision (DD-3) and is not required for Phase 2.1 correctness.

### What Stays the Same

- `RetirementSummary` continues to receive `nestEgg`, `projectedAtRetirement`, `investableCapital`, `targetYear` from `RetirementPanel` — no regression (SC-2)
- `RetirementPanel` form and input fields are untouched (AG-3)
- `TypeStackedChart` keeps the CAGR table, stacked area rendering, and dual-axis pattern — only the `ReferenceLine` loop and `milestones` prop are removed (SC-3)
- No new API endpoints (AG-5)

---

## Open Questions

Carrying forward from the requirements document, plus additional findings from this research:

**OQ-1 (from requirements):** Should the "On Track / Off Track" badge move out of `RetirementSummary` and into `MilestoneTracker`? If `MilestoneTracker` shows progress toward the nest egg target as one of its milestone cards, the badge would be redundant in `RetirementSummary`. Architect should decide whether to consolidate.

**OQ-2 (from requirements):** Should achieved milestones show the date they were achieved? This is computable: scan the investable capital time series for the first date where the sum exceeded the milestone amount. Low added effort for high user value — worth considering.

**OQ-3 (from requirements):** Where does the nest egg target sit in the milestone list? Including it as the "final milestone" (at the retirement target) is natural and avoids duplication between `MilestoneTracker` and `RetirementSummary`.

**OQ-4 (new):** What return rate should be used for projected dates when `expected_return_pct` is not set? Options: (a) omit projections entirely, (b) use the observed Retirement CAGR from `typeData.cagr` as a fallback, (c) use a hardcoded default (e.g., 7% as the form placeholder suggests). Option (b) is the most data-driven but adds logic. The architect should decide the fallback hierarchy.

**OQ-5 (new):** Should the `MilestoneTracker` component live inside `RetirementPanel` (co-located with the form) or outside it as a sibling? Inside is more cohesive (both work with `milestones` from `retirement`), but the form is collapsible and the tracker should always be visible. Outside (sibling in `NetWorthPage`) keeps separation of concerns cleaner.

**OQ-6 (new):** When all milestones are achieved (EC-5) and the nest egg target is also achieved, should the component celebrate visually (e.g., a banner) or just show checkmarks? The requirements only require clear distinction — celebration is out of scope unless the designer includes it.

---

## Sources

- [Empower Retirement Planner](https://www.empower.com/tools/retirement-planner)
- [Empower Dashboard Overview](https://support-personalwealth.empower.com/hc/en-us/articles/201169740-Dashboard-Overview)
- [Empower Review — Rob Berger](https://robberger.com/empower-review/)
- [Empower Review — ChooseFI](https://choosefi.com/review/empower-review-the-ultimate-net-worth-tracker)
- [Wealthfront New Dashboard](https://www.wealthfront.com/blog/introducing-new-dashboard/)
- [Wealthfront Retirement Goal Inputs](https://support.wealthfront.com/hc/en-us/articles/115000627263-What-inputs-can-I-change-for-my-retirement-goal)
- [Wealthfront UX Review — Brad Sant](https://bradsant.com/wealthfront/)
- [Six Wealthtech Apps with Outstanding UX — Windmill](https://windmill.digital/six-wealthtech-apps-with-outstanding-ux/)
- [Fintech UX Best Practices 2026 — Eleken](https://www.eleken.co/blog-posts/fintech-ux-best-practices)
- [Fintech Design Patterns — Phenomenon Studio](https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/)
- [Progress Indicator Best Practices — UXPin](https://www.uxpin.com/studio/blog/design-progress-trackers/)
- [Progress Trackers and Indicators — UserGuiding](https://userguiding.com/blog/progress-trackers-and-indicators/)
- [Recharts ReferenceLine API](https://recharts.github.io/en-US/api/ReferenceLine/)
- [Recharts Label API](https://recharts.github.io/en-US/api/Label/)
- [Recharts Issue #1710 — Label stack overflow](https://github.com/recharts/recharts/issues/1710)
- [Recharts Issue #2354 — Label position mismatch](https://github.com/recharts/recharts/issues/2354)
- [Recharts Issue #730 — Label renders in center](https://github.com/recharts/recharts/issues/730)
- [Recharts Issue #3438 — ifOverflow not working](https://github.com/recharts/recharts/issues/3438)
- [Recharts Issue #3069 — ReferenceLine label margin](https://github.com/recharts/recharts/discussions/3069)
- [Recharts: foreignObject for custom HTML labels](https://gaurav5430.medium.com/exploring-recharts-using-foreignobject-to-render-custom-html-5c6b75d6207e)
- [ReferenceDot with custom shape — CodeSandbox](https://codesandbox.io/s/recharts-animating-referencedot-with-custom-shape-j573t)
- [10 Best Mint Alternatives — 7 Saturdays Financial](https://7saturdaysfinancial.com/mint-alternatives/)
