# Research Report — Phase 2.1: Dual-View Milestone Hero Card with View Toggle

**Date:** 2026-03-10
**Researcher:** Research Agent
**Status:** Complete — ready for Architect

---

## Problem Summary

Phase 2.1 must replace the incorrect milestone `<ReferenceLine>` elements on `TypeStackedChart` with a dedicated milestone progress component that compares against investable capital (Retirement + Brokerage only). The frontend designer's brainstorm (`phase2.1-brainstorm.md`) converged on a hybrid of Concept 1 (milestone cards) and Concept 8 (hero card with view toggle), and the mockups file (`phase2.1-mockups.html`) was already created.

This research report focuses specifically on the implementation mechanics of that hybrid: a **dual-view milestone hero card** with a view toggle similar to the existing mobile budget chart toggle. It documents four key areas:

1. The existing toggle/swipe pattern and how to replicate or adapt it
2. Hero and summary card patterns already in the codebase
3. Data layer — how financial data flows and what is available without new API calls
4. SVG/chart patterns for any inline progress visualization

---

## Codebase Context

### 1. Existing Toggle Pattern

The budget chart toggle on mobile is implemented as `HorizontalSwipeContainer` + `MobileBudgetPage` state management. This is the only multi-view toggle pattern in the codebase. It works as follows:

**File:** `/home/user/stashtrend/frontend/src/components/mobile/HorizontalSwipeContainer.jsx`
**CSS:** `/home/user/stashtrend/frontend/src/components/mobile/HorizontalSwipeContainer.module.css`

Key mechanics:
- `activeIndex` (integer) and `onIndexChange` (callback) are the external contract — the parent owns state.
- The container uses `overflow-x: auto; scroll-snap-type: x mandatory` for swipe gesture support and calls `el.scrollTo({ left: activeIndex * el.clientWidth, behavior: 'smooth' })` programmatically when `activeIndex` changes from outside.
- A `scroll` event handler converts scroll position to an index on user-initiated swipe (ignoring programmatic scrolls via `isScrollingRef`).
- Respects `prefers-reduced-motion` — swaps `behavior: 'smooth'` for `'auto'`.
- Renders a fixed dot bar (`role="tablist"`) below the container. Each dot is a `<button role="tab">` with a 44×28px touch target.
- `isLocked` prop prevents swipe (used during reorder mode in MonthDetailView).
- Labels array maps to `aria-label` on each dot for accessibility.

**State management in parent** (`MobileBudgetPage`):
```js
const [activeView, setActiveView] = useState(0)  // 0=heatmap, 1=detail, 2=summary
```
State is NOT persisted (no localStorage). The default view is always index 0 on mount.

**Dot bar positioning** is `position: fixed` anchored above the BottomTabBar at `bottom: calc(56px + env(safe-area-inset-bottom))`. This is specific to the full-screen mobile budget layout and is NOT reusable for a card-level toggle. A hero card toggle needs to be `position: relative` within the card boundary.

**Verdict on reuse:** The swipe+dots mechanism is tightly coupled to the full-viewport mobile layout. A milestone hero card needs a different visual toggle — button-strip rather than scroll-snap panes — but can follow the same state ownership pattern (`activeView` integer, parent-owned).

### 2. Hero Card Pattern

No dedicated "hero card" component exists yet. The closest patterns are:

**`StatsCards.jsx`** — the canonical card component.
- File: `/home/user/stashtrend/frontend/src/components/StatsCards.jsx`
- CSS: `/home/user/stashtrend/frontend/src/components/StatsCards.module.css`
- Structure: `.row` grid (1-col mobile → 3-col at 480px) of `.card` divs with `background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); padding: 16px 20px`.
- Card anatomy: `.cardLabel` (10px, uppercase, letter-spacing, `--text-muted`) → `.cardValue` (24px/28px, `--text-primary`) → `.cardChange` (13px flex row with arrow and sublabel).
- Hover: `border-color: var(--accent-border-hover)`.
- Skeleton: shimmer animation via `background-size: 800px 100%` linear gradient.

**`RetirementSummary.jsx`** — the most relevant structural predecessor.
- File: `/home/user/stashtrend/frontend/src/components/RetirementSummary.jsx`
- Renders a `div.container` with label/value row pairs and an "On Track / Off Track" badge. Uses `color-mix()` for badge background. No chart, pure HTML.

**`NetWorthChart.jsx` and `TypeStackedChart.jsx`** — chart containers.
- Both use `.container { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px; }` with a `.header` flex row (title + controls), collapsing to column on mobile. This is the established pattern for any component with controls above content.

**`GroupsTimeChart.jsx`** — has a chip toggle pattern (show/hide individual groups), which is the only existing "interactive filter" pattern inside a card. Chips use inline style for color with active state via `background: ${color}22` and `border-color: active ? color : GRID_STROKE`.

**Key design token for a cobalt-bordered "hero" card:**
`--accent-border-hover: rgba(77,159,255,0.25)` is used for hover effects.
The mockups file (`phase2.1-mockups.html`) uses a glow border pattern `box-shadow: 0 0 0 1px var(--accent-tint); border-color: var(--accent)` for the nest egg "summit" card.

### 3. Data Layer

**Entry point:** `NetWorthPage.jsx`
- File: `/home/user/stashtrend/frontend/src/pages/NetWorthPage.jsx`
- Fetches all data in a single `Promise.all`: `fetchNetworthStats()`, `fetchNetworthHistory()`, `fetchAccountsSummary()`, `fetchNetworthByType()`, `fetchRetirement()`.
- `typeData` contains: `{ series: [{date, Retirement, Brokerage, Cash, "Real Estate", Debt, Other}], cagr: {Retirement: {1y,3y,5y}, Brokerage: ...}, bucket_colors, bucket_order }`.
- `retirement` contains: `{ exists, current_age, target_retirement_age, desired_annual_income, monthly_contribution, expected_return_pct, social_security_annual, withdrawal_rate_pct, milestones: [{label, amount}] }`.

**Investable capital computation** (from `RetirementPanel.jsx` lines 44–48):
```js
const investableCapital = (() => {
  if (!typeData?.series?.length) return null
  const latest = typeData.series[typeData.series.length - 1]
  return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
})()
```
This is the source of truth. The new component must compute the same way.

**Investable capital series** (derivable, no API needed):
```js
const investableSeries = typeData.series.map(d => ({
  date: d.date,
  value: (d.Retirement ?? 0) + (d.Brokerage ?? 0),
}))
```
This enables achieved-date detection (scan for first crossing) and a progress mini-chart.

**Projection math** — already available in `retirementMath.js`:
- `generateProjectionSeries({ currentNetWorth, monthlyContribution, annualReturnPct, years })` → `[{date, projected_net_worth}]`
- `mergeHistoryWithProjection(history, projection)` → merged date-sorted array (used when projecting future capital growth)

**Return rate fallback hierarchy** (open question OQ-4 from prior research):
- Primary: `retirement.expected_return_pct` (user-set, from form)
- Fallback option: `typeData.cagr.Retirement['1y']` weighted with `typeData.cagr.Brokerage['1y']` by balance
- Fallback default: omit projected dates entirely (safest for MVP)

**Milestone projected date algorithm:**
Given `investableCapital`, `monthlyContrib`, `returnPct`, and a `milestoneAmount`:
1. Call `generateProjectionSeries({ currentNetWorth: investableCapital, monthlyContribution: monthlyContrib, annualReturnPct: returnPct, years: 40 })`.
2. Find first `point.projected_net_worth >= milestoneAmount`.
3. If found, extract `point.date` as the projected crossing month.
4. If not found within 40 years, return `null` (display "N/A").

**Milestone data model** (no backend changes):
```js
// retirement.milestones: [{label: string, amount: number}]
// Sort ascending by amount for display (EC-7 requirement)
const sorted = [...milestones].sort((a, b) => a.amount - b.amount)
```

**No new API calls required** — SC-12 is satisfied. All data for the new component arrives from the two existing endpoints already fetched by `NetWorthPage.jsx`.

### 4. SVG/Chart Patterns

**Chart library:** Recharts 2.12.7 (`frontend/package.json`). All chart usage confirmed in the codebase uses Recharts.

**Chart components in use:**
- `AreaChart` with stacked `Area` (NetWorthChart, TypeStackedChart)
- `LineChart` with `Line` (GroupsTimeChart)
- `BarChart` with `Bar` (BudgetChart)
- `ResponsiveContainer` wraps every chart — always `width="100%"` with JS-computed `height`

**Responsive sizing pattern:**
```js
const { isMobile } = useResponsive()
const chartHeight = isMobile ? 220 : 300
```
Height is always a JS prop; width is always CSS-driven via `ResponsiveContainer`.

**SVG in tests:** The mock file at `/home/user/stashtrend/frontend/__mocks__/recharts.jsx` stubs all Recharts components as `<div>` elements with `data-testid`. `ReferenceLine` stub renders with `data-testid={y != null ? \`reference-line-${y}\` : 'reference-line'}`.

**Inline SVG (non-Recharts):** Not currently used anywhere in the codebase. The designer's Concept 3 (radial arc gauges) and Concept 8 (conic-gradient ring) both involve non-Recharts rendering. The brainstorm notes CSS `conic-gradient` as the path for Concept 8's progress ring — this is pure CSS, requires no SVG math. The `stroke-dasharray` approach on an SVG `<circle>` is the alternative (more control, slightly more code).

**Progress bars:** Used in `BudgetTable.jsx` as inline `<div>` elements with `width: calc(X%)`. That pattern is directly applicable to milestone progress bars. Key detail from `conventions.md`: use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.

**Animation:** CSS transitions (`--ease-quick: 150ms`, `--ease-smooth: 300ms`) are used throughout. The heatmap and dot indicator use `transition: background var(--ease-quick)`. For progress bars, a CSS `transition: width 300ms ease` on mount would animate fill-in. Recharts charts have their own built-in animation that can be disabled with `isAnimationActive={false}`.

**CSS custom properties in SVG:** Cannot use CSS vars directly in SVG `fill`/`stroke` attributes. Use the constants from `chartUtils.jsx`: `COLOR_ACCENT`, `COLOR_POSITIVE`, `COLOR_NEGATIVE`, `COLOR_AMBER`. This is documented in `conventions.md`.

---

## Options Evaluated

The architecture task requires a "dual-view" hero card with a toggle. Three distinct approaches exist for implementing that toggle, each with different tradeoffs.

### Option A: Button-Strip Toggle (Segmented Control)

**Description:** The hero card has a two-button toggle strip at the top right (or below the title). View A = "Progress" (the hero milestone focus view). View B = "All Milestones" (compact list of all milestones). State is `useState(0)` in the parent component. The content area swaps between the two views via conditional rendering. No swipe gesture.

Visual structure:
```
┌─────────────────────────────────┬──────────────┐
│ MILESTONE PROGRESS              │ Progress | All│
├─────────────────────────────────┴──────────────┤
│ [View A content or View B content]             │
└────────────────────────────────────────────────┘
```

The toggle uses the same visual pattern as `RangeSelector.jsx` — a button strip with `.rangeButtons` / `.rangeBtn` / `.rangeBtnActive` classes.

**Pros:**
- Directly reuses the `RangeSelector` visual pattern, already used by NetWorthChart and TypeStackedChart. No new CSS primitives.
- Desktop-first: mouse users naturally click a button; no swipe required.
- Both views always mounted (or just hidden with `display: none`) — no unmount/remount flash.
- Simple: `const [view, setView] = useState('progress')` — two string values, no index math.
- Keyboard accessible by default (buttons).
- The `RangeSelector` component is already generic enough to accept two labels.

**Cons:**
- No swipe gesture on mobile — users must tap the toggle explicitly.
- The segmented control approach may feel disconnected from the mobile budget toggle pattern users already know.
- If both views have different heights, the card height jumps on toggle — needs `min-height` or fixed height.

**Effort:** Low — reuses `RangeSelector` pattern directly. The toggle is ~5 lines of JSX.

**Compatibility:** Excellent. `RangeSelector` already exists and is documented in `conventions.md`.

---

### Option B: Tab Bar Toggle (ARIA role="tablist")

**Description:** A tab bar rendered inside the card with `role="tablist"` / `role="tab"` / `role="tabpanel"` ARIA semantics. Each tab reveals one view. Keyboard navigation follows the ARIA tabs pattern (arrow keys to switch tabs). Visual design: tabs are inline with the card header, underline-style active indicator.

```
┌─────────────────────────────────────────────────┐
│  MILESTONE PROGRESS                             │
│  [Progress]  [All Milestones]                   │  ← tab bar, underline active
│─────────────────────────────────────────────────│
│  [active tabpanel content]                      │
└─────────────────────────────────────────────────┘
```

The ARIA tabs pattern requires managing focus with arrow keys (roving tabindex), which adds non-trivial keyboard interaction logic compared to two standalone buttons.

**Pros:**
- Semantically correct ARIA pattern for a multi-view panel.
- Familiar "tab" mental model matches what users expect for view switching inside a card.
- Arrow key navigation is built into the pattern.

**Cons:**
- The codebase has no tab component — this would be the first ARIA tabs implementation. The WindowPicker component uses a combobox pattern, and HorizontalSwipeContainer uses a custom dots-as-tabs approach. Neither is a clean precedent for a tab bar.
- Roving tabindex management requires a `useEffect` or `onKeyDown` handler (~20 lines of additional logic versus Option A's 0 lines).
- The `HorizontalSwipeContainer` already uses `role="tablist"` + `role="tab"` for dots (see its JSX), so if both components are on the same page the semantic structure would be correct but visually inconsistent — one has dot buttons, one has labeled tabs.
- No swipe support without additional work.

**Effort:** Medium — the ARIA tabs keyboard contract adds ~20 lines beyond what Option A requires.

**Compatibility:** Moderate. No existing tab precedent to follow precisely.

---

### Option C: Swipe Container Adaptation (HorizontalSwipeContainer Lite)

**Description:** Adapt `HorizontalSwipeContainer` to work at card level rather than full-viewport level. The card would contain scroll-snap panes for the two views, with a 2-dot indicator rendered inside the card (not `position: fixed`). The swipe gesture works on mobile; the dots work on desktop.

This requires either:
- **C1:** Modify `HorizontalSwipeContainer` to accept a `fixedDots={false}` prop that renders dots inside the flow (not fixed).
- **C2:** Create a new `CardSwipeContainer` component that copies the swipe logic with card-appropriate dot positioning.

**Pros:**
- Swipe gesture works on mobile — consistent with the mobile budget page pattern.
- Users familiar with the mobile budget page already know the dot interaction model.
- True parity with the described "similar to the existing budget chart toggle on mobile" requirement.

**Cons:**
- `HorizontalSwipeContainer` has `position: fixed` dots hardcoded into its CSS, tied to the `calc(100dvh - 60px - 28px - 56px)` full-viewport height formula. Decoupling this requires modifying the existing component (risk of regression to the mobile budget page) or duplicating it.
- Scroll-snap panes require fixed or percentage height — inside a card whose height varies by content, this creates layout challenges. The full-viewport version avoids this because it knows the height upfront.
- Swipe gesture conflicts with page scroll on mobile when the card isn't full-viewport — a horizontal swipe near the card's edge could accidentally be interpreted as a scroll.
- Two panes with different content heights would need a `min-height` approach or the shorter pane would feel hollow.
- The dots pattern inside a card looks less polished than a button strip — dots were designed as a minimal page-level indicator, not a card control.

**Effort:** Medium-High — decoupling from the fixed-position layout requires meaningful changes to `HorizontalSwipeContainer.module.css` and either modifying the existing component or creating a new one.

**Compatibility:** Moderate. The existing component is tightly coupled to the mobile budget page's full-viewport layout.

---

### Option D: CSS-Only Toggle with `display` Swap (No State)

**Description:** A pure CSS toggle using `<input type="radio">` + adjacent sibling selectors. Two radio inputs (hidden, visually represented as styled labels) control which view is shown. No React state; no JS event handlers beyond the browser's native radio behavior.

**Pros:**
- No React state management at all.
- Works without JavaScript if CSS is available.

**Cons:**
- CSS radio toggle patterns are fragile in React (controlled vs. uncontrolled conflicts, form reset behavior).
- Cannot be easily tested with RTL (`userEvent.click` on labels can be tricky with radio inputs).
- Not a pattern used anywhere in the codebase — would be a one-off.
- Less accessible than explicit `role="tab"` or two buttons with ARIA pressed state.
- Cannot be animated/transitioned as cleanly as a JS-controlled swap.

**Effort:** Medium — CSS-only approach sounds simple but requires careful implementation to avoid React conflicts.

**Compatibility:** Poor. No precedent in the codebase.

---

## Recommendation

**Option A (Button-Strip Toggle) is the right choice**, with explicit `aria-pressed` on the active button.

Rationale:
1. **Reuses `RangeSelector`'s visual pattern directly.** The exact same button strip (`.rangeButtons` / `.rangeBtn` / `.rangeBtnActive` from `RangeSelector.module.css`) is already used by two chart components on the Net Worth page. Using it for the milestone card creates visual consistency. The architect can choose to import the existing `RangeSelector` component with two labels, or copy the CSS classes locally if the milestone card needs different sizing.

2. **Lowest effort with highest compatibility.** The toggle itself is ~5 lines. The pattern is already documented in `conventions.md` and has established test patterns.

3. **Avoids HorizontalSwipeContainer's layout coupling.** The swipe container is genuinely designed for full-viewport layouts and extracting it for card-level use creates significant risk of regression. The mobile budget page is a working, tested feature.

4. **Mobile suitability.** On mobile, button strip buttons are easy to tap (min-height 36px per RangeSelector.module.css, 44px on mobile). The two-button strip is more discoverable on mobile than dots, which lack text labels and require knowing to swipe.

5. **Accessibility.** Two buttons with `aria-pressed` satisfy WCAG without requiring the roving tabindex complexity of Option B.

The prior research (`phase2.1-research.md`) already recommended Option 1 (milestone progress cards) for the content. This report adds the finding that the toggle mechanism for the dual-view variant should be **a button-strip identical to `RangeSelector`**, not an adaptation of `HorizontalSwipeContainer`.

### Component Architecture Recommendation

The new component should be named `MilestoneProgressCard` (or `MilestoneTracker` per the prior research — final name is the architect's call). Its placement in `NetWorthPage.jsx`:

```
StatsCards
NetWorthChart
TypeStackedChart          ← milestones prop removed, ReferenceLine loop deleted
MilestoneProgressCard     ← NEW: placed between TypeStackedChart and RetirementPanel
RetirementPanel
```

Props received from `NetWorthPage`:
- `retirement` — the full retirement settings object (milestones, ages, return rate, withdrawal rate, income goal, etc.)
- `typeData` — the by-type series data (to derive investable capital and investable series)

The component computes internally:
- `investableCapital` (same formula as `RetirementPanel`)
- `investableSeries` (mapped from `typeData.series`)
- `nestEgg` (via `computeNestEgg` from `retirementMath.js`)
- Projected dates (via `generateProjectionSeries` from `retirementMath.js`)
- Achievement date per milestone (scan `investableSeries` for first crossing)
- Sorted milestone array (ascending by amount, with nest egg appended if set)

### View A — "Hero" (Next Milestone Focus)

Displays the next unachieved milestone prominently:
- Large percentage or dollar amount
- CSS progress bar (`role="progressbar"`, `aria-valuenow/min/max`)
- Projected date line below
- A compact "breadcrumb" strip of all milestones below the hero (achieved = green pill, current = cobalt, future = muted) — from Concept 8 in the brainstorm

### View B — "All Milestones" (Full List)

Displays all milestones and the nest egg target as a vertical list:
- One row per milestone: label, amount, progress bar, percent, projected date, achieved badge
- Matches the Concept 1 "Stack of Flags" card pattern from the brainstorm
- Mirrors the `.cardLabel` / `.cardValue` typography conventions from `StatsCards.module.css`

### State Persistence

No persistence required. `useState(0)` (or `useState('hero')`) in the component, defaulting to View A. This is consistent with all other toggle state in the codebase — `range` in `NetWorthChart`, `activeView` in `MobileBudgetPage`, `rangeMonths` in `MonthlySummaryView` — none use localStorage.

---

## Open Questions

**OQ-A: Return rate fallback hierarchy.** When `retirement.expected_return_pct` is not set, should projected dates use the observed Retirement CAGR from `typeData.cagr`, a hardcoded default (7%), or simply omit projections? The prior research raised this as OQ-4 and left it to the architect. The safest MVP answer is: omit projections if no return rate is available (show "— set return rate in advanced settings").

**OQ-B: Nest egg as a milestone.** Should the computed nest egg target appear in the milestone list as a distinguished final item, or remain solely in `RetirementSummary`? Showing it in the milestone list (with its cobalt glow border from the brainstorm) would make "On Track / Off Track" redundant in `RetirementSummary`. The architect should decide if `RetirementSummary` keeps the badge or if it migrates to `MilestoneProgressCard`.

**OQ-C: Achievement date detection.** The investable series from `typeData.series` has monthly granularity. Scanning it for the first crossing of each milestone amount is low-effort (~5 lines). Should this be included in MVP or deferred? Including it satisfies OQ-2 from the requirements doc and makes achieved milestones show "Achieved Jan '24" instead of just a checkmark.

**OQ-D: Investable capital trend line on TypeStackedChart.** The prior research noted (DD-3) that a single non-stacked `Line` on `TypeStackedChart` showing the investable capital sum might add value. This is independent of the hero card feature and should be an explicit in-scope/out-of-scope call by the architect.

**OQ-E: Hero card height on toggle.** If View A and View B have different heights, the card will reflow on toggle. Options: (a) fixed minimum height on the card, (b) CSS `min-height` that accommodates the taller view, (c) animate height with `transition: height`. Option (b) is the simplest and consistent with the existing loading state skeletons.

---

## File Reference Summary

| Purpose | File |
|---|---|
| Existing toggle (mobile budget) | `/home/user/stashtrend/frontend/src/components/mobile/HorizontalSwipeContainer.jsx` |
| Toggle CSS (fixed-position dots) | `/home/user/stashtrend/frontend/src/components/mobile/HorizontalSwipeContainer.module.css` |
| Toggle state management parent | `/home/user/stashtrend/frontend/src/pages/MobileBudgetPage.jsx` |
| Button-strip toggle to reuse | `/home/user/stashtrend/frontend/src/components/RangeSelector.jsx` |
| Button-strip CSS to reuse | `/home/user/stashtrend/frontend/src/components/RangeSelector.module.css` |
| Card anatomy reference | `/home/user/stashtrend/frontend/src/components/StatsCards.jsx` + `.module.css` |
| Card container CSS pattern | `/home/user/stashtrend/frontend/src/components/NetWorthChart.module.css` |
| Investable capital computation | `/home/user/stashtrend/frontend/src/components/RetirementPanel.jsx` lines 44–48 |
| Projection math | `/home/user/stashtrend/frontend/src/utils/retirementMath.js` |
| Data fetch orchestrator | `/home/user/stashtrend/frontend/src/pages/NetWorthPage.jsx` |
| Bug to remove | `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` lines 157–166 |
| Design tokens | `/home/user/stashtrend/frontend/src/index.css` |
| Chart SVG color constants | `/home/user/stashtrend/frontend/src/components/chartUtils.jsx` |
| Recharts test mocks | `/home/user/stashtrend/frontend/__mocks__/recharts.jsx` |
| Prior research (milestone options) | `/home/user/stashtrend/docs/plans/phase2.1-research.md` |
| Designer brainstorm | `/home/user/stashtrend/docs/plans/phase2.1-brainstorm.md` |
| HTML mockups | `/home/user/stashtrend/docs/plans/phase2.1-mockups.html` |
| Requirements | `/home/user/stashtrend/docs/plans/phase2.1-requirements.md` |
