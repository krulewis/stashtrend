# Architecture Decision -- Phase 2.1: Dual-View Milestone Hero Card

**Date:** 2026-03-10
**Author:** Architect Agent
**Status:** Decision complete -- ready for engineer planning
**Inputs:** `phase2.1-requirements-impl.md`, `phase2.1-research-impl.md`, `phase2.1-brainstorm.md`, codebase review

---

## Decision Summary

Phase 2.1 introduces a `MilestoneHeroCard` component placed between `TypeStackedChart` and `AccountsBreakdown` on the Net Worth page. The card contains two switchable views -- Dashboard Cards (a grid of milestone progress cards) and Mountain Skyline (a Recharts area chart with projection line and milestone reference lines). The toggle uses a two-button segmented control built on the existing `RangeSelector` pattern. All milestone data derivation logic lives in a new `useMilestoneData` custom hook, which both views consume. The chart view uses Recharts (already a project dependency) rather than raw SVG. The buggy `<ReferenceLine>` loop is removed from `TypeStackedChart`.

---

## Chosen Approach

### 1. Toggle Mechanism: RangeSelector-Style Button Strip

**Description:** A two-button segmented control ("Cards" | "Chart") rendered in the hero card header, reusing the visual pattern from `RangeSelector.module.css` (`.rangeButtons`, `.rangeBtn`, `.rangeBtnActive`). View state is `useState(0)` in `MilestoneHeroCard`, defaulting to index 0 (Dashboard Cards). The inactive view is not rendered (conditional rendering, not `display: none`), to avoid mounting the Recharts chart when it is not visible.

**Rationale:**
- The `RangeSelector` button strip is already used by `NetWorthChart` and `TypeStackedChart` on the same page. Reusing its visual vocabulary creates immediate consistency without introducing a new interaction pattern.
- The research report evaluated four toggle options (button strip, ARIA tabs, swipe container adaptation, CSS-only radio). The button strip scored highest on effort (5 lines of toggle JSX), compatibility (proven pattern), and accessibility (native `<button>` elements need no roving tabindex).
- `HorizontalSwipeContainer` is tightly coupled to full-viewport mobile layouts (`position: fixed` dots, `calc(100dvh - ...)` height formulas). Extracting it for card-level use risks regression to the working mobile budget page and requires meaningful CSS decoupling work for marginal benefit (swipe on a card that may be only 400px tall conflicts with page scroll).
- Mobile tap targets are already adequate: `RangeSelector` buttons have `min-height: 36px` on mobile (44px touch target met when combined with padding).

**ARIA approach:** Rather than `role="tablist"` / `role="tab"` (which requires roving tabindex keyboard management the codebase does not have a precedent for), the two buttons use `aria-pressed="true|false"` on each button. This satisfies WCAG toggle button requirements without adding keyboard interaction complexity. The requirements document specifies `role="tablist"` (SC-I9), but `aria-pressed` on buttons is a semantically correct alternative for a two-option toggle and avoids introducing the codebase's first roving tabindex implementation for a feature with exactly two states. The content areas use `role="region"` with `aria-label` rather than `role="tabpanel"` for consistency with the chosen button semantics.

**Open question for human review:** The requirements document (SC-I5, C-7) calls for swipe gesture support on mobile to match `HorizontalSwipeContainer`. This architecture intentionally omits swipe because the research found it risky at card level. If the user considers swipe mandatory, we would need to build a `CardSwipeContainer` (estimated 80-100 additional lines). Recommend deferring swipe to a future enhancement once the card is validated.

### 2. Component Hierarchy

```
MilestoneHeroCard                  -- Container: header + toggle + active view
  |-- MilestoneCardsView           -- Dashboard Cards grid (Concept 1)
  |     |-- MilestoneCard (x N)   -- Individual milestone card with progress bar
  |-- MilestoneSkylineView         -- Mountain Skyline chart (Concept 4)
```

**`MilestoneHeroCard`** (container):
- Owns toggle state (`useState(0)`)
- Calls `useMilestoneData(typeData, retirement)` to compute all derived values
- Conditionally renders either `MilestoneCardsView` or `MilestoneSkylineView`
- Renders the header row: title ("Milestones"), count badge ("2 of 4 done"), toggle buttons
- Guards rendering: returns `null` if milestones array is empty, retirement does not exist, or required data is not yet loaded (EC-1, EC-2, EC-12)

**`MilestoneCardsView`** (Dashboard Cards):
- Receives processed milestone data as props from the parent
- Renders a CSS grid of `MilestoneCard` components (2-column desktop, 1-column mobile)
- No internal state

**`MilestoneCard`** (individual card):
- Receives a single milestone's computed data (label, amount, progress, state, achievedDate, projectedDate, isNestEgg)
- Renders label, formatted dollar amount, progress bar (`role="progressbar"`), percentage, status line
- Applies semantic color class based on state (achieved/in-progress/future)
- Applies cobalt glow class if `isNestEgg` is true

**`MilestoneSkylineView`** (Mountain Skyline):
- Receives investable series, projection series, merged series, processed milestones, and current investable capital as props
- Renders a Recharts `AreaChart` with historical area, projection line, milestone reference lines, and "today" divider
- No internal state (chart is purely declarative)

### 3. Data Flow

**Decision: Custom hook (`useMilestoneData`) computes all derived values.**

The hook receives `typeData` and `retirement` as arguments (both already available in `NetWorthPage` state) and returns a single object with all computed data that both views need. This avoids duplicating computation logic between the two views and avoids lifting computation into `NetWorthPage` (which should not know about milestone presentation logic).

**Hook signature:**
```js
function useMilestoneData(typeData, retirement) {
  // Returns:
  return {
    // Guard conditions
    shouldRender,         // boolean -- false if data missing or no milestones

    // Core data
    investableCapital,    // number -- latest Retirement + Brokerage
    investableSeries,     // [{date, value}] -- IC per historical month
    milestones,           // [{label, amount, progress, state, achievedDate, projectedDate, isNestEgg}]
    achievedCount,        // number -- count of achieved milestones
    totalCount,           // number -- total milestone count (including nest egg if present)

    // Chart-specific data (only computed when needed -- lazy via useMemo)
    projectionSeries,     // [{date, projected_net_worth}] or null
    mergedSeries,         // [{date, value, projected_net_worth?}] or null
  }
}
```

**Why a hook rather than computing in `NetWorthPage`:** `NetWorthPage` is already a data-fetching orchestrator with 5 API calls and 8 state variables. Adding milestone derivation logic there would violate the pattern where `NetWorthPage` passes raw data to children and children own their presentation logic. `RetirementPanel` already follows this pattern -- it receives `data` and `typeData` and derives `investableCapital` and `projectedAtRetirement` internally.

**Why a hook rather than computing in the component body:** The computations involve memoizable work (sorting milestones, scanning series for achievement dates, generating projection series). A hook with `useMemo` keeps the memoization dependencies explicit and the component body clean.

**Investable capital computation:** Same formula as `RetirementPanel` lines 44-48: `(latest.Retirement ?? 0) + (latest.Brokerage ?? 0)`. This is intentionally duplicated in the hook rather than shared via a utility function, because the two components receive data in different shapes (`RetirementPanel` gets `typeData` as a prop; the hook also gets `typeData`). If a third consumer appears, extracting to a shared utility would be warranted.

**Projection data:** The hook calls `generateProjectionSeries()` and `mergeHistoryWithProjection()` from `retirementMath.js`. These are already pure functions with no React dependencies. The projection is generated only when `expected_return_pct` is available. When absent, `projectionSeries` and `mergedSeries` are `null`, and the Mountain Skyline view renders history-only with a subtle "Set expected return for projections" message (EC-6).

**Return rate fallback (DD-2 / OQ-A):** Decision: omit projections entirely when `expected_return_pct` is not set. Do not fall back to observed CAGR or a hardcoded default. Rationale: a 7% default or CAGR-derived rate would silently produce projected dates that appear authoritative but are based on assumptions the user never made. Showing "N/A" for projected dates with a prompt to set the return rate is more honest and directs users to the correct setting.

### 4. Chart Approach for Mountain Skyline (DD-I1): Recharts

**Description:** The Mountain Skyline chart uses Recharts `AreaChart` with:
- A solid `Area` for historical investable capital (cobalt fill with gradient)
- A `Line` for projection (dashed, lighter cobalt)
- `ReferenceLine` for each milestone (horizontal, green or amber by state)
- `ReferenceLine` for "today" divider (vertical)
- `ResponsiveContainer` for responsive width
- Custom label component on milestone reference lines to handle collision

**Rationale -- Recharts over raw SVG:**
- Recharts is already a project dependency (v2.12.7) used by every chart in the application. Adding a raw SVG chart would introduce a second rendering paradigm.
- `ResponsiveContainer`, axis formatting (`fmtCompact`), tooltip styles (`TOOLTIP_STYLE`), and color constants (`COLOR_ACCENT`, `COLOR_POSITIVE`, `COLOR_AMBER`) from `chartUtils.jsx` are directly reusable. Raw SVG would need to reimplement responsive sizing, axis generation, and tooltip rendering.
- The primary risk with Recharts -- `ReferenceLine` label collision -- is mitigable with a custom label component (see Label Collision Strategy below).
- Test mocks for Recharts components already exist in `frontend/__mocks__/recharts.jsx`. Raw SVG would need new test patterns.
- The only advantage of raw SVG is pixel-precise control of the "today" divider clip-path region. Recharts can achieve the same effect with two overlapping series (one clipped to history dates, one to projection dates) or with a `<defs>` clip-path injected via a custom `<Area>` content prop.

**Label Collision Strategy (DD-I6 / EC-13):**

For milestone reference line labels, use a custom `content` prop on `<ReferenceLine>` that renders positioned SVG text with vertical offset. The algorithm:
1. Sort milestones by amount ascending.
2. Compute the pixel Y position of each milestone using the chart's Y-axis scale.
3. If two adjacent milestone labels would be closer than 16px in pixel space, offset the lower one rightward and add a connecting tick mark.
4. On mobile, abbreviate labels to first 8 characters with ellipsis if the label exceeds that length.

This is simpler than hover-only labels (which hide information) and a legend below the chart (which disconnects labels from their reference lines).

**Y-axis domain (DD-I5):** Match existing conventions: `fmtCompact` formatter, auto domain with headroom. Domain max = `Math.max(highestMilestone, nestEgg ?? 0) * 1.1` to ensure the highest reference line is not at the chart ceiling.

### 5. State Management

**View toggle:** `useState(0)` in `MilestoneHeroCard`. Index 0 = Dashboard Cards, index 1 = Mountain Skyline. Not persisted (AG-I3). Resets on page reload.

**Computed milestone state:** Derived in `useMilestoneData` via `useMemo`. No separate state variable. The milestone state array is recomputed when `typeData` or `retirement` changes (which only happens on page load or after a retirement settings save).

**No global state, no context:** The milestone card is self-contained. It receives `typeData` and `retirement` as props from `NetWorthPage` and derives everything internally. There is no need for React context or a state management library.

### 6. CSS Strategy

**CSS Modules** for all new components, following the universal project convention. Every existing component uses `ComponentName.module.css`. No inline styles except where Recharts requires them (SVG attributes like `stroke`, `fill`, `strokeDasharray` which cannot use CSS custom properties).

**New CSS module files:**
- `MilestoneHeroCard.module.css` -- container, header, toggle overrides
- `MilestoneCardsView.module.css` -- card grid layout
- `MilestoneCard.module.css` -- individual card styling, progress bar, semantic state classes
- `MilestoneSkylineView.module.css` -- chart container (minimal, since Recharts handles most chart styling)

**Semantic color classes in `MilestoneCard.module.css`:**
```css
.achieved  { /* progress bar background: var(--color-positive) */ }
.inProgress { /* progress bar background: var(--accent) */ }
.future    { /* progress bar background: var(--color-warning) */ }
.nestEggGlow { /* box-shadow: 0 0 0 1px var(--accent-tint), 0 0 12px var(--accent-tint) */ }
```

**Progress bar styling:** CSS `<div>` with percentage width (matching `BudgetTable.jsx` pattern), `min-width: 4px` for any non-zero progress (EC-8), `border-radius: var(--radius-sm)`, height 6px. `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.

**Card container pattern:** Reuse the `.container` pattern from `NetWorthChart.module.css` (`background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); padding: 16px` mobile, `20px 24px` desktop, `margin-bottom: 20px`/`24px`).

**Card height on toggle (OQ-E):** Use `min-height` on the content area set to accommodate the taller view. Dashboard Cards with 4 milestones in a 2-column grid is approximately 240px. Mountain Skyline chart is 300px desktop / 220px mobile. Set `min-height: 300px` desktop, `min-height: 220px` mobile on the content area. This prevents layout jump on toggle without requiring animation.

### 7. Props Contract

**`NetWorthPage` to `MilestoneHeroCard`:**
```jsx
<MilestoneHeroCard typeData={typeData} retirement={retirement} />
```

Only two props. Both are already available in `NetWorthPage` state. The hero card derives everything else internally.

**`MilestoneHeroCard` to `MilestoneCardsView`:**
```jsx
<MilestoneCardsView milestones={milestones} />
```

Where `milestones` is the processed array from the hook (each item has `label`, `amount`, `progress`, `state`, `achievedDate`, `projectedDate`, `isNestEgg`).

**`MilestoneHeroCard` to `MilestoneSkylineView`:**
```jsx
<MilestoneSkylineView
  mergedSeries={mergedSeries}
  investableSeries={investableSeries}
  milestones={milestones}
  investableCapital={investableCapital}
  hasProjection={projectionSeries != null}
/>
```

### 8. TypeStackedChart Changes

Remove the milestone rendering from `TypeStackedChart`:
- Delete lines 157-166 (the `milestones && milestones.map(...)` `<ReferenceLine>` loop)
- Remove `milestones` from the component's props destructuring (line 62)
- Remove `milestones` from `PropTypes` (lines 218-221)
- In `NetWorthPage.jsx` line 99: change `<TypeStackedChart data={typeData} milestones={retirement?.milestones} />` to `<TypeStackedChart data={typeData} />`

### 9. File Structure

All new files follow existing naming conventions (PascalCase component name, co-located `.module.css`, co-located `.test.jsx`).

```
frontend/src/
  components/
    MilestoneHeroCard.jsx              -- Container with toggle
    MilestoneHeroCard.module.css       -- Container + header styles
    MilestoneHeroCard.test.jsx         -- Integration tests for toggle, rendering guards
    MilestoneCardsView.jsx             -- Dashboard Cards grid
    MilestoneCardsView.module.css      -- Grid layout
    MilestoneCard.jsx                  -- Individual milestone card
    MilestoneCard.module.css           -- Card + progress bar + semantic states
    MilestoneSkylineView.jsx           -- Mountain Skyline chart
    MilestoneSkylineView.module.css    -- Chart container
    MilestoneSkylineView.test.jsx      -- Chart rendering tests
  hooks/
    useMilestoneData.js                -- Data derivation hook
  utils/
    milestoneUtils.js                  -- Pure functions: sortMilestones, computeMilestoneStates,
                                          findAchievementDate, findProjectedDate
    milestoneUtils.test.js             -- Unit tests for pure milestone functions
```

**Rationale for splitting `milestoneUtils.js` from the hook:** The pure functions (sort, state computation, date scanning) are independently testable without React. The hook composes them with `useMemo` and React lifecycle. This separation makes unit testing straightforward -- the utils file gets pure-function tests, the hook gets `renderHook` tests, and the components get RTL integration tests.

---

## Rejected Alternatives

### Alternative 1: HorizontalSwipeContainer Adaptation (Option C from Research)

**What it was:** Adapt the existing `HorizontalSwipeContainer` to work at card level by adding a `fixedDots={false}` prop or creating a `CardSwipeContainer` fork. This would give swipe gesture support on mobile.

**Why rejected:**
- `HorizontalSwipeContainer` has hardcoded `position: fixed` dot positioning tied to the full-viewport mobile budget layout (`bottom: calc(56px + env(safe-area-inset-bottom))`). Decoupling this requires either modifying the existing component (risking regression to `MobileBudgetPage`, a tested and working feature) or duplicating 120+ lines of scroll-snap and gesture logic into a new component.
- Scroll-snap inside a card that is only 300-400px tall creates gesture ambiguity on mobile: a horizontal swipe near the card boundary can be misinterpreted as a vertical page scroll, especially on iOS Safari where gesture disambiguation is aggressive.
- Dots as a toggle mechanism inside a card lack text labels, making the two views less discoverable than labeled buttons. Users would need to know to swipe (no affordance) or recognize dots as navigation (learned behavior from the budget page, but a different page context).
- The two-button strip achieves the same functional result (view switching) with 5 lines of JSX versus approximately 80-100 lines for a card-level swipe container.

### Alternative 2: ARIA Tabs with Roving Tabindex (Option B from Research)

**What it was:** A proper `role="tablist"` / `role="tab"` / `role="tabpanel"` implementation with arrow-key tab switching (roving tabindex pattern).

**Why rejected:**
- The codebase has zero implementations of the ARIA roving tabindex pattern. Introducing it for a two-item toggle is disproportionate complexity. The roving tabindex pattern requires a `useEffect` or `onKeyDown` handler managing focus between tab elements (~20 lines), plus careful handling of Home/End keys and wrapping behavior.
- `HorizontalSwipeContainer` uses `role="tablist"` for its dot indicators, but those dots are simple buttons without roving tabindex -- they are individually focusable via normal tab order. Adding a true roving tabindex tab bar would create an inconsistency: two `role="tablist"` patterns on the site with different keyboard contracts.
- For a two-option toggle, `aria-pressed` on buttons is semantically equivalent and requires no additional keyboard management beyond what `<button>` provides natively.

### Alternative 3: Raw SVG for Mountain Skyline Chart

**What it was:** Hand-craft the area chart, projection line, reference lines, axes, and tooltips using raw SVG elements (`<path>`, `<line>`, `<text>`) instead of Recharts.

**Why rejected:**
- The project has zero raw SVG chart implementations. Every chart uses Recharts. Introducing raw SVG creates a second rendering paradigm that future developers must understand and maintain.
- Raw SVG requires reimplementing: responsive width scaling (Recharts `ResponsiveContainer` handles this), Y-axis scale computation and tick generation, X-axis date formatting, tooltip positioning and content, hover interaction for data points. Conservatively 200-300 lines of SVG math and layout code versus approximately 60-80 lines of Recharts JSX that reuses `chartUtils.jsx` utilities.
- The test mock infrastructure (`frontend/__mocks__/recharts.jsx`) already stubs Recharts components for jsdom tests. Raw SVG would need new test approaches (snapshot testing or manual DOM assertions on `<path>` `d` attributes).
- The sole advantage of raw SVG -- pixel-precise clip-path control for the history/projection boundary -- is achievable in Recharts via two overlapping `<Area>` components with different data ranges or a `<defs>` `<clipPath>` element.

### Alternative 4: Computing Milestone Data in NetWorthPage

**What it was:** Compute `investableCapital`, `investableSeries`, milestone states, projection series, and merged series in `NetWorthPage.jsx` and pass them as individual props to `MilestoneHeroCard`.

**Why rejected:**
- `NetWorthPage` is a data-fetching orchestrator, not a data-transformation layer. It fetches 5 endpoints and distributes raw data to child components. `RetirementPanel` computes `investableCapital` and `projectedAtRetirement` internally from `typeData` and `data`. The milestone card should follow the same pattern.
- Adding 40-50 lines of milestone derivation logic to `NetWorthPage` would increase its size from 112 lines to approximately 160 lines and introduce concerns (milestone sorting, date scanning, projection generation) that are unrelated to page orchestration.
- If the milestone card is ever moved to a different page or made reusable, a hook-based approach moves with the component. Props computed in a parent page do not.

### Alternative 5: Single View Only (No Toggle)

**What it was:** Build only the Dashboard Cards view (Concept 1) without the Mountain Skyline chart, avoiding toggle complexity entirely.

**Why rejected:**
- The user explicitly selected both Concept 1 and Concept 4 during the brainstorm review. The dual-view with toggle is the stated requirement, not a design suggestion. Building only one view would not satisfy the user's request.
- The Mountain Skyline chart provides trajectory information ("where am I going?") that the Dashboard Cards view does not. Cards show a snapshot; the chart shows the journey. Both perspectives were identified as necessary in SC-4 through SC-8.

---

## Design Details

### Data Model

No backend changes. Milestone data model remains `[{label: string, amount: number}]`.

**Derived milestone model** (computed in `useMilestoneData`):
```js
{
  label: string,           // from retirement.milestones[i].label
  amount: number,          // from retirement.milestones[i].amount
  progress: number,        // 0.0 to 1.0, capped
  state: 'achieved' | 'in-progress' | 'future',
  achievedDate: string | null,   // "Jan '24" or null
  projectedDate: string | null,  // "Mar '29" or null
  isNestEgg: boolean,      // true for the appended nest egg target
}
```

### API Contract

No changes. No new endpoints. All data from existing `/api/networth/by-type` and `/api/retirement`.

### Integration Points

1. **`NetWorthPage.jsx`** -- Adds `<MilestoneHeroCard>` between `<TypeStackedChart>` and `<AccountsBreakdown>`. Removes `milestones` prop from `<TypeStackedChart>`.
2. **`TypeStackedChart.jsx`** -- Removes `<ReferenceLine>` loop, `milestones` prop, and `milestones` PropTypes.
3. **`retirementMath.js`** -- Consumed by the `useMilestoneData` hook (existing functions, no changes to the utility).
4. **`chartUtils.jsx`** -- Consumed by `MilestoneSkylineView` for `fmtCompact`, `AXIS_TICK`, `GRID_STROKE`, `TOOLTIP_STYLE`, `COLOR_ACCENT`, `COLOR_POSITIVE`, `COLOR_AMBER`, `formatDateLabel`.
5. **`useResponsive.js`** -- Consumed by `MilestoneSkylineView` for chart height and Y-axis width.
6. **`__mocks__/recharts.jsx`** -- May need a `ReferenceArea` stub added if used; `ReferenceLine` stub already exists.

---

## Deferred Decision Resolutions

| ID | Decision | Resolution |
|----|----------|------------|
| DD-I1 | Recharts vs raw SVG for Mountain Skyline | **Recharts.** Consistent with all other charts; utilities reusable; test mocks exist. |
| DD-I2 | Reuse HorizontalSwipeContainer or simpler toggle | **Simpler toggle.** RangeSelector-style button strip. Swipe deferred. |
| DD-I3 | Data computation location | **Custom hook (`useMilestoneData`).** Keeps NetWorthPage clean; keeps logic portable. |
| DD-I5 | Y-axis format | **`fmtCompact` from chartUtils.** Matches existing charts. Domain max = highest target * 1.1. |
| DD-I6 | Label collision strategy | **Custom `content` prop with vertical offset.** Sort by amount, offset overlapping labels rightward. Mobile truncation at 8 chars. |

| ID | Question | Answer |
|----|----------|--------|
| OQ-A | Return rate fallback | **Omit projections** when `expected_return_pct` not set. No fallback to CAGR or default. |
| OQ-B | Nest egg in milestone list | **Yes,** appended as final item with `isNestEgg: true` flag. Cobalt glow distinguishes it. RetirementSummary keeps its "On Track/Off Track" badge unchanged (DD-I7 recommendation: do not move in Phase 2.1). |
| OQ-C | Achievement date detection | **Yes, include in MVP.** Scan `investableSeries` for first crossing per milestone. Low effort (~5 lines per milestone). Satisfies SC-I6. |
| OQ-D | IC trend line on TypeStackedChart | **Out of scope** for Phase 2.1 per AG-I6. |
| OQ-E | Card height on toggle | **`min-height` approach.** 300px desktop, 220px mobile on content area. |
| OQ-I1 | Count badge in header | **Yes.** Format: "X of Y done". |
| OQ-I2 | Intersection dot on chart | **No.** Adds visual complexity without sufficient information gain. Projected dates are already shown in Dashboard Cards view. |
| OQ-I3 | Shared vs view-specific title | **Shared.** Single title "Milestones" for both views. The toggle buttons provide sufficient context for which view is active. |

---

## Risks and Mitigations

### Risk 1: Recharts ReferenceLine Label Collision

**Likelihood:** High (documented problem with Recharts when multiple reference lines are close in Y-value).
**Impact:** Medium -- labels overlap and become unreadable, degrading the Mountain Skyline view.
**Mitigation:** Custom `content` prop on `<ReferenceLine>` that computes pixel-space Y positions and applies vertical offsets when labels are within 16px. The custom renderer receives the `viewBox` and `y` coordinate from Recharts, enabling precise positioning. If collision avoidance proves insufficient in testing, fall back to rendering labels only on hover/focus (tooltip pattern) as a secondary strategy.

### Risk 2: Duplicate Investable Capital Computation

**Likelihood:** Certain (the same formula exists in `RetirementPanel` and will exist in `useMilestoneData`).
**Impact:** Low -- the formula is two lines (`latest.Retirement + latest.Brokerage`). If the definition of investable capital changes, both locations need updating.
**Mitigation:** Accept the duplication for now. Add a code comment in both locations cross-referencing the other. If a third consumer appears, extract to a shared utility in `retirementMath.js`. The two-consumer threshold does not justify premature abstraction.

### Risk 3: Performance with Large Projection Series

**Likelihood:** Low -- `generateProjectionSeries` with 50 years produces 600 data points.
**Impact:** Low -- 600 points is well within Recharts' performance envelope. The existing `TypeStackedChart` handles 200 downsampled points; `MilestoneSkylineView` will handle 600 merged points.
**Mitigation:** Cap projection horizon at 50 years (EC-14). Apply `downsample()` from `chartUtils.jsx` if merged series exceeds 400 points. The `useMemo` in the hook prevents recomputation on every render.

### Risk 4: Chart Height Jump on View Toggle

**Likelihood:** Medium -- Dashboard Cards with 2 milestones is shorter than the 300px chart.
**Impact:** Low -- content below the card shifts vertically, which is noticeable but not functionally harmful.
**Mitigation:** `min-height` on the content area (300px desktop, 220px mobile) ensures the card never shrinks below chart height. If cards exceed chart height (8+ milestones), the card naturally grows.

### Risk 5: Nest Egg Null Handling

**Likelihood:** Medium -- users who have not set `desired_annual_income` or `withdrawal_rate_pct` will have `nestEgg === null`.
**Impact:** Low -- but must not crash or show a broken card.
**Mitigation:** When `nestEgg` is null, omit the nest egg card from Dashboard Cards and the nest egg reference line from Mountain Skyline. The `totalCount` in the header badge excludes the nest egg when null. EC-11 is explicitly handled.

### Risk 6: Milestone Achievement Date Accuracy

**Likelihood:** Low -- the investable series has monthly granularity, so achievement dates are accurate to the month.
**Impact:** Negligible -- monthly precision is sufficient for "Achieved Jan '24" display.
**Mitigation:** None needed. The scan finds the first month where cumulative IC >= milestone amount. If the series starts after a milestone was already achieved (account data imported mid-history), the achievement date will show the first available data point. Add a comment documenting this limitation.

---

## Open Questions Requiring Human Judgment

1. **Swipe gesture (SC-I5):** This architecture omits mobile swipe on the hero card toggle. The requirements document lists it as a success criterion. If the user considers swipe mandatory, the engineer plan should include a `CardSwipeContainer` component (estimated +80-100 lines, +1 CSS module file). Recommend asking the user before implementation begins.

2. **ARIA semantics (SC-I9):** The requirements specify `role="tablist"`/`role="tab"`/`role="tabpanel"`. This architecture uses `aria-pressed` buttons + `role="region"` instead, for the reasons documented above. If strict WCAG tabs pattern compliance is required by organizational policy, the roving tabindex implementation adds approximately 20 lines of keyboard handling. Recommend confirming with the user whether `aria-pressed` is acceptable.

---

## Implementation Notes for Engineer

- The `RangeSelector` component itself is not directly reusable because it expects a `ranges` array with `{label, months}` shape and does not support `aria-pressed`. Build a new 2-button toggle component within `MilestoneHeroCard` that copies the CSS classes from `RangeSelector.module.css` or references them directly. The visual pattern is the same; the data contract differs.
- The `mergeHistoryWithProjection` function in `retirementMath.js` merges on a `net_worth` key. The milestone chart uses an `value` key for investable capital. Either add an adapter in `useMilestoneData` that renames the key, or pass a custom key mapper. The simpler approach is to build the merged series manually in the hook using the same Map-merge logic (6 lines).
- Recharts `ReferenceLine` does not support the `content` prop for custom rendering in all versions. Verify with Recharts 2.12.7 that `<ReferenceLine content={CustomLabel} />` works. If not, use `<ReferenceLine label={{ content: CustomLabel }} />` which is the documented API for custom label rendering.
- The `__mocks__/recharts.jsx` file needs to be checked for whether it already exports `ReferenceArea`. If `ReferenceArea` is used for the Mountain Skyline (e.g., to create the history/projection clip regions), add it to the mock file.
