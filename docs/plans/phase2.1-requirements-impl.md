# Implementation Requirements -- Phase 2.1: Dual-View Milestone Hero Card

**Date:** 2026-03-10
**Source:** PM Agent (based on user selection of Concepts 1 + 4 from brainstorm)
**Status:** Ready for architecture/design pipeline
**Supersedes:** Previous draft that incorrectly referenced "Summit Climb" as the primary view

---

## 1. Clarified Intent

The user reviewed 8 milestone visualization concepts from the Phase 2.1 brainstorm and selected **two** to combine into a single hero card with a view toggle:

- **Primary view: "Dashboard Cards"** (Brainstorm Concept 1 -- Stack of Flags Card Grid) -- A row/grid of cards, one per milestone plus the nest egg target. Each card shows the milestone label, dollar amount, a horizontal progress bar, percentage complete, and projected date or achieved date. Achieved milestones flip to a green state with a checkmark. The nest egg target card has a cobalt border-glow to distinguish it visually.
- **Secondary view: "Mountain Skyline"** (Brainstorm Concept 4 -- Projection Chart) -- A full SVG area chart showing historical investable capital as a filled cobalt area with gradient, a dashed projection polyline extending forward to retirement, horizontal reference lines for each milestone, a vertical "today" divider, and clipPath regions separating history from projection.

These two views live inside a single hero card component with a toggle mechanism. **Dashboard Cards is the default view.** The toggle pattern follows the precedent set by `HorizontalSwipeContainer` used in `MobileBudgetPage.jsx` (scroll-snap on mobile, dot indicators, `role="tablist"` / `role="tab"` / `role="tabpanel"` ARIA pattern, swipe gestures).

The hero card replaces the current buggy `ReferenceLine` rendering on `TypeStackedChart` (lines 157-166, which compare milestones against total NW instead of investable capital). It is placed between `TypeStackedChart` and `AccountsBreakdown` in the `NetWorthPage` layout.

---

## 2. User Stories

**US-1:** As a user with milestones configured, I see a hero card on the Net Worth page that shows my progress toward each milestone at a glance, so I can quickly assess where I stand without scrolling into the retirement settings form.

**US-2:** As a user, I can toggle between a card grid view (showing concrete numbers per milestone) and a chart view (showing my historical trajectory and projection), so I get both snapshot and trajectory perspectives.

**US-3:** As a mobile user, I can swipe between the two views using the same gesture pattern I already know from the budget page, so the interaction is consistent.

**US-4:** As a user who has passed milestones, I see them clearly marked as achieved with a green state, checkmark, and the month/year they were first crossed, so I feel a sense of progress.

**US-5:** As a user with no milestones set, the hero card does not render, so the page is not cluttered with empty UI.

**US-6:** As a user without retirement settings at all (`data.exists === false`), the hero card does not render.

---

## 3. Data Requirements

All data is already available -- no new API endpoints or backend changes (per AG-5 from the parent requirements).

### Inputs

| Data | Source | Notes |
|------|--------|-------|
| `investableCapital` (latest) | `typeData.series[last].Retirement + typeData.series[last].Brokerage` | Already computed in `RetirementPanel.jsx` lines 44-48; must be lifted or recomputed |
| Investable capital series | `typeData.series.map(d => (d.Retirement ?? 0) + (d.Brokerage ?? 0))` | Derivable per-point; needed for Mountain Skyline chart and for finding historical achievement dates |
| `milestones` | `retirement.milestones` -- `[{label: string, amount: number}]` | Must be sorted by amount ascending for display (EC-7) |
| `nestEgg` | `computeNestEgg()` from `retirementMath.js` | May be null if `desired_annual_income` not set |
| `expected_return_pct` | `retirement.expected_return_pct` | Needed for projection line; may be absent (EC-6) |
| `monthly_contribution` | `retirement.monthly_contribution` | Needed for projection series |
| `currentAge` / `targetAge` | `retirement.current_age` / `retirement.target_retirement_age` | Needed for projection horizon and target year marker |
| Projection series | `generateProjectionSeries()` from `retirementMath.js` | Generates monthly compound-growth forward series |
| Merged series | `mergeHistoryWithProjection()` from `retirementMath.js` | Merges historical + projected for the chart view |

### Derived Values (per milestone)

| Value | Derivation |
|-------|-----------|
| `progress` | `Math.min(investableCapital / milestone.amount, 1)` -- capped at 1.0 for display |
| `state` | `"achieved"` if `investableCapital >= amount`, `"in-progress"` if next unachieved, `"future"` otherwise |
| `achievedDate` | Scan investable capital series for first month where cumulative >= amount; format as `"Mon 'YY"` |
| `projectedDate` | For future milestones: find first month in projection series where `projected_net_worth >= amount`; format as `"Mon 'YY"` or `"N/A"` if projection unavailable |

### Nest Egg as Final Card/Reference Line

The nest egg target (from withdrawal rate math) is displayed as the final card in Dashboard Cards view and as the highest reference line in Mountain Skyline view. It is visually distinguished from user-defined milestones:
- Dashboard Cards: cobalt border-glow on the nest egg card
- Mountain Skyline: different line style (thicker or double-dashed)

If `nestEgg` is `null` (income/withdrawal not configured), it is simply omitted -- not shown as a card or reference line.

---

## 4. Feature Scope -- Two Views in One Card

### 4A. Dashboard Cards View (Primary -- Default)

A grid of milestone cards inside the hero card:

- **Card layout:** 2-column grid on desktop (>= 768px), single-column stack on mobile (< 768px). Each card is a self-contained panel.
- **Card contents per milestone:**
  - Milestone label (e.g., "Half-Mil", "Fat FIRE")
  - Dollar amount (e.g., "$500,000")
  - Horizontal progress bar showing `progress` ratio
  - Percentage text (e.g., "62%")
  - Status line: achieved date (e.g., "Achieved Jan '24") or projected date (e.g., "Proj. Mar '29")
- **Achieved cards:** Green progress bar at 100%, checkmark icon, achieved date. Green semantic state.
- **In-progress cards:** Cobalt progress bar at partial fill, percentage shown, projected date. Cobalt semantic state.
- **Future cards:** Amber/muted progress bar at partial fill, percentage shown, projected date. Amber semantic state.
- **Nest egg card:** Same layout as other cards but with a cobalt border-glow (CSS `box-shadow` or `outline`) regardless of state, to mark it as the "summit" card.
- **Header:** "MILESTONES" title with a count badge (e.g., "2 of 4 done") matching the brainstorm mockup.
- **Progress bar minimum width:** 4px for any non-zero progress, so 0.2% is visible (EC-8).
- **Progress bar accessibility:** `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.

### 4B. Mountain Skyline View (Secondary)

A standalone area chart showing only investable capital over time:

- **Historical area:** Cobalt area fill with gradient, solid line. Data from `typeData.series` mapped to investable capital per point.
- **Projection line:** Dashed lighter cobalt or white polyline extending from the latest data point forward to the retirement target year. Uses `generateProjectionSeries()` with the user's `expected_return_pct` and `monthly_contribution`. Merged with history via `mergeHistoryWithProjection()`.
- **"Today" divider:** A vertical reference line at the most recent historical data point, separating history from projection. Subtle dashed or dotted style.
- **Milestone reference lines:** Horizontal lines at each milestone amount:
  - Achieved milestones: green (`--color-positive`) line
  - Future milestones: amber (`--color-warning`) dashed line
  - Each labeled with milestone name (collision mitigation strategy decided by architect -- DD-I6)
- **Nest egg reference line:** If computed, shown as a distinguished horizontal line at the nest egg amount.
- **Y-axis:** Domain covers from 0 to the highest milestone or nest egg target (whichever is greater), with headroom.
- **X-axis:** Date labels, `interval="preserveStartEnd"`, reduced tick count on mobile.
- **Chart height:** 300px desktop, 220px mobile (matching existing chart conventions from `TypeStackedChart` and `NetWorthChart`).

### 4C. View Toggle

- **Default view:** Dashboard Cards (index 0).
- **Desktop toggle:** A segmented control (two buttons) in the hero card header. Labels: "Cards" and "Chart" (or similar short labels). Active segment uses `--accent` cobalt.
- **Mobile toggle:** Same segmented control, plus swipe gesture support within the hero card. Follows the `HorizontalSwipeContainer` scroll-snap pattern.
- **ARIA:** `role="tablist"` on toggle container, `role="tab"` on each button with `aria-selected`, `role="tabpanel"` on each view.
- **Persistence:** Component-local state only. Resets to Dashboard Cards on page reload. No localStorage.
- **Transition:** CSS scroll-snap if using `HorizontalSwipeContainer`, or simple show/hide. Must respect `prefers-reduced-motion`.

---

## 5. Responsive Behavior

### Dashboard Cards View

| Breakpoint | Layout |
|-----------|--------|
| Desktop (>= 768px) | 2-column grid of milestone cards. Cards are equal width. |
| Mobile (< 768px) | Single-column stack, full-width cards. |

Card contents are identical at all sizes -- no content is hidden on mobile, only layout changes.

### Mountain Skyline View

| Breakpoint | Layout |
|-----------|--------|
| Desktop (>= 768px) | Full-width chart, ~300px height. Milestone labels as positioned pills or right-aligned text. |
| Mobile (< 768px) | Full-width chart, ~220px height. Milestone labels abbreviated. X-axis tick count reduced. Y-axis width reduced (52px vs 72px). |

Uses `ResponsiveContainer` from Recharts (if Recharts is chosen) or `viewBox` scaling (if raw SVG). Uses `useResponsive()` hook for breakpoint detection, consistent with existing charts.

### Hero Card Container

- `--bg-card` (#1C2333) surface with standard card padding
- Header row: title + count badge + segmented toggle
- Content area: the active view
- No max-width constraint on the card itself (matches other cards on the page), but the designer may specify one (DD-I8)

---

## 6. Milestone States

Three states, determined by comparing `investableCapital` against each milestone's `amount` (sorted ascending):

| State | Condition | Dashboard Cards Appearance | Mountain Skyline Appearance |
|-------|-----------|---------------------------|----------------------------|
| **Achieved** | `investableCapital >= amount` | Green progress bar (100%), checkmark icon, achieved date | Green horizontal reference line |
| **In-progress** | First unachieved milestone | Cobalt progress bar (partial fill), percentage, projected date | Amber reference line (closest target above current IC) |
| **Future** | All subsequent unachieved milestones | Amber/muted progress bar (partial fill), percentage, projected date | Amber reference line |

The **nest egg card** follows the same state logic but additionally has the cobalt border-glow regardless of state.

Color tokens:
- Achieved: `--color-positive` (#2ECC8A)
- In-progress: `--accent` (#4D9FFF)
- Future: `--color-warning` (#F5A623)
- Nest egg glow: `--accent` (#4D9FFF) with reduced opacity

---

## 7. Edge Cases and Error States

All edge cases from `phase2.1-requirements.md` (EC-1 through EC-9) apply. View-specific handling:

| ID | Condition | Dashboard Cards | Mountain Skyline |
|----|-----------|----------------|-----------------|
| EC-1 | No milestones defined (empty array), retirement settings exist | Hero card does not render. No empty state. | Same -- card absent. |
| EC-2 | No retirement settings (`data.exists === false`) | Hero card does not render. | Same. |
| EC-3 | Investable capital is zero | All cards show 0% with 4px minimum progress bar. Projected dates shown if projection available, else "N/A". | Flat line at zero. Milestone reference lines above. |
| EC-4 | Milestone already achieved | Card shows 100%, green state, achieved date. Bar does not exceed bounds. | Green reference line below current IC position. |
| EC-5 | All milestones achieved | All cards green with checkmarks. If nest egg also achieved, nest egg card shows "Ahead of target" label. | All reference lines green, below IC area. |
| EC-6 | No `expected_return_pct` set | Cards still show progress and achieved dates. Future milestone projected dates show "N/A". | Historical area renders. No projection line. Subtle text: "Set expected return for projections." |
| EC-7 | Milestones not sorted by amount | Sort by amount ascending before rendering. | Same. |
| EC-8 | Very large milestone (e.g., $50M vs $100K) | 4px minimum progress bar width. Percentage shows actual value (e.g., "0.2%"). | Y-axis extends to highest milestone. Historical IC is a thin band at bottom. |
| EC-9 | Negative investable capital | Treat as zero for progress calculations. All cards show 0%. | Chart shows actual negative area. Progress uses `Math.max(0, ic)`. |
| EC-10 | Single milestone only | One card rendered full-width (no grid). | One reference line. Fully functional. |
| EC-11 | Nest egg is null but milestones exist | Milestone cards render. No nest egg card. | Milestone reference lines render. No nest egg line. |
| EC-12 | `typeData` loaded but `retirement` not yet loaded | Hero card does not render until both are available. No loading spinner -- appears when ready. | Same. |
| EC-13 | Recharts label collision (Mountain Skyline) | N/A | Custom label component with vertical offset, or hover-only labels. Architect decides strategy (DD-I6). |
| EC-14 | Projection horizon > 50 years | Cards show "50+ years" for milestones beyond projection cap. | Chart X-axis capped at 50 years from today. |

---

## 8. Placement and Wiring

### Page Layout Order in `NetWorthPage.jsx`

```
StatsCards
NetWorthChart (total NW history)
TypeStackedChart (NW by bucket, CAGR table) -- ReferenceLine loop REMOVED
>>> MilestoneHeroCard (NEW) <<<
AccountsBreakdown
RetirementPanel (form + MilestoneEditor + RetirementSummary)
```

### Props / Data Flow

The hero card needs from `NetWorthPage`:
- `typeData` -- to derive investable capital (latest + full series)
- `retirement` -- milestones, return rate, contribution, ages, income, withdrawal rate, SS

The architect decides whether to pass raw data and compute inside the component, or pre-compute derived values in `NetWorthPage` and pass them down (DD-I3).

### TypeStackedChart Changes

- Remove the `milestones` prop from the component interface
- Remove the `<ReferenceLine>` rendering loop (lines 157-166 of `TypeStackedChart.jsx`)
- Remove the `milestones` entry from `PropTypes`
- Update `NetWorthPage.jsx` line 99: remove `milestones={retirement?.milestones}`

---

## 9. Success Criteria (Implementation-Specific)

These supplement SC-1 through SC-12 from the parent requirements:

- **SC-I1:** Hero card renders between `TypeStackedChart` and `AccountsBreakdown` in `NetWorthPage`.
- **SC-I2:** `TypeStackedChart` no longer renders milestone `<ReferenceLine>` elements or accepts a `milestones` prop.
- **SC-I3:** Dashboard Cards is the default view on page load.
- **SC-I4:** Segmented toggle switches between Dashboard Cards and Mountain Skyline. Both views render correctly.
- **SC-I5:** On mobile, swipe gesture switches views (consistent with `HorizontalSwipeContainer` pattern).
- **SC-I6:** Achieved milestones show the historical month/year they were first crossed (derived from investable capital series scan).
- **SC-I7:** Nest egg card has a visible cobalt border-glow distinguishing it from other milestone cards.
- **SC-I8:** Mountain Skyline shows: historical investable capital area, dashed projection line, horizontal milestone reference lines (green/amber by state), vertical "today" divider.
- **SC-I9:** ARIA: `role="tablist"` on toggle, `role="tab"` on buttons with `aria-selected`, `role="tabpanel"` on views, `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` on progress bars.
- **SC-I10:** Hero card does not render when milestones array is empty or retirement settings do not exist.
- **SC-I11:** Progress bars have minimum 4px rendered width for non-zero progress values.
- **SC-I12:** All milestone data uses investable capital (Retirement + Brokerage), not total net worth.

---

## 10. Constraints and Anti-Goals

### Constraints

- **C-1:** Investable capital = Retirement + Brokerage (consistent with `RetirementPanel.jsx`).
- **C-2:** Dark Cobalt design tokens only. New tokens require designer agent approval.
- **C-3:** Milestone data model unchanged (`[{label, amount}]`).
- **C-4:** No new API endpoints or network requests.
- **C-5:** Performance: renders in under 200ms with 60 data points.
- **C-6:** Keyboard navigable with appropriate ARIA labels/roles.
- **C-7:** Toggle pattern should follow `HorizontalSwipeContainer` precedent (or a simplified version for 2 views).

### Anti-Goals

- **AG-I1:** No inline milestone editing from the hero card. Editing is in `MilestoneEditor` inside `RetirementPanel`.
- **AG-I2:** No animation on progress bars or chart transitions (future enhancement).
- **AG-I3:** No localStorage persistence of view toggle selection.
- **AG-I4:** The other 6 brainstorm concepts are not built (Summit Climb, Fuel Gauge, Achievement Shelf, Runway Staircase, Twin Lines, Distance to Summit).
- **AG-I5:** No Monte Carlo or probability projections.
- **AG-I6:** No separate investable capital trend line on TypeStackedChart.
- **AG-I7:** No changes to RetirementPanel form fields, RetirementSummary layout, or CAGR table.
- **AG-I8:** No separate milestone page. Everything stays on Net Worth page.
- **AG-I9:** No celebration animations when milestones are achieved.

---

## 11. Deferred Decisions (for Architect/Designer)

| ID | Decision | Owner |
|----|----------|-------|
| DD-I1 | Whether Mountain Skyline uses Recharts or raw SVG | Architect |
| DD-I2 | Whether to reuse `HorizontalSwipeContainer` or build a simpler inline toggle for 2 views | Architect |
| DD-I3 | How to compute and pass data to the hero card (lift computation, independent recomputation, or shared hook) | Architect |
| DD-I4 | Card header layout (title left + toggle right, or centered toggle below title) | Designer |
| DD-I5 | Y-axis format in Mountain Skyline (compact vs full) | Architect (match existing conventions) |
| DD-I6 | Milestone reference line label collision strategy (offset pills, hover-only, legend below) | Architect + Designer |
| DD-I7 | Whether "On Track / Off Track" badge should move from RetirementSummary into hero card | Designer (recommend: do not move in Phase 2.1) |
| DD-I8 | Whether hero card has max-width constraint on desktop | Designer |

---

## 12. Open Questions

- **OQ-I1:** Should the card header show a summary count (e.g., "2 of 4 done")? The Concept 1 mockup includes this. Recommend yes -- it adds useful context at no implementation cost.
- **OQ-I2:** When the Mountain Skyline projection line crosses a milestone reference line, should the intersection point be marked with a dot? Adds visual reinforcement of projected dates but increases chart complexity.
- **OQ-I3:** Should both views share a single card title ("Milestones") or use view-specific titles ("Milestone Progress" / "Growth Projection")?

---

## 13. Scope Summary

### Will be built:

1. **`MilestoneHeroCard` component** -- Container card with header (title + count badge + segmented toggle) and two view panels.
2. **`MilestoneCardsView` component** (Dashboard Cards) -- 2-column grid (desktop) / single-column stack (mobile) of milestone cards with progress bars, semantic states, achieved dates, projected dates. Nest egg card with cobalt glow.
3. **`MilestoneSkylineView` component** (Mountain Skyline) -- Area chart with historical investable capital fill, dashed projection line, milestone reference lines (green/amber), "today" divider.
4. **Milestone data derivation utilities** -- Functions to: sort milestones, compute state per milestone, scan series for achieved date, scan projection for projected date, compute progress percentage.
5. **Remove milestone reference lines from `TypeStackedChart`** -- Delete `<ReferenceLine>` loop (lines 157-166), remove `milestones` prop and PropTypes.
6. **Wire into `NetWorthPage`** -- Add hero card between `TypeStackedChart` and `AccountsBreakdown`, passing `typeData` and `retirement` data.
7. **Tests** -- Unit tests for derivation utilities, component tests for both views and the toggle, edge case coverage for EC-1 through EC-14.

### Will NOT be built:

- The other 6 brainstorm visualization concepts
- Backend changes or new API endpoints
- Inline milestone editing from the hero card
- Monte Carlo projections
- View toggle persistence
- Progress bar or transition animations
- Changes to RetirementPanel, RetirementSummary, MilestoneEditor, or CAGR table
- A separate milestone tracking page
