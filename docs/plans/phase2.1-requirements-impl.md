# Implementation Requirements -- Phase 2.1: Dual-View Milestone Hero Card

**Date:** 2026-03-10
**Source:** PM Agent (based on user selection from brainstorm concepts)
**Status:** Ready for architecture/design pipeline

---

## 1. Clarified Intent

The user reviewed 8 milestone visualization concepts from the Phase 2.1 brainstorm and selected **two** to combine into a single hero card with a view toggle:

- **Primary view: "Stack of Flags"** (Brainstorm Concept 2 -- Summit Climb Vertical Timeline) -- A vertical track with milestone nodes, a "you are here" glowing marker, solid/dashed connectors distinguishing achieved vs. future milestones
- **Secondary view: "Mountain Skyline"** (Brainstorm Concept 4 -- Projection Chart) -- An SVG area chart showing historical investable capital with a dashed projection line forward to retirement, plus milestone reference lines

These two views are housed in a single card component with a view toggle mechanism. The toggle pattern follows the existing `HorizontalSwipeContainer` precedent used in `MobileBudgetPage.jsx`, which uses dot indicators with `role="tablist"` / `role="tab"` / `role="tabpanel"` ARIA patterns and supports both swipe gestures and tap-to-select.

The card replaces the current buggy `ReferenceLine` rendering on `TypeStackedChart` (which compares milestones against total NW instead of investable capital). All milestone progress in both views uses investable capital (Retirement + Brokerage) as the basis.

---

## 2. User Stories

**US-1:** As a user tracking retirement milestones, I want to see my current position relative to achieved and future milestones in a vertical timeline so I can quickly understand where I am on my financial journey.

**US-2:** As a user, I want to see my investable capital growth history and forward projection on a chart with milestone reference lines so I can visually gauge when I will reach each milestone.

**US-3:** As a user, I want to toggle between the timeline view and the chart view within the same card so I can choose the perspective that is most useful to me at any moment.

**US-4:** As a mobile user, I want both views to work well on narrow screens so I can check my milestone progress on my phone.

**US-5:** As a user with no milestones set, I want the card to either hide or show a prompt to add milestones so the UI does not display an empty or broken state.

---

## 3. Data Requirements

All data is already available -- no new API endpoints or backend changes.

### Inputs

| Data | Source | Notes |
|------|--------|-------|
| `investableCapital` (latest) | `typeData.series[last].Retirement + typeData.series[last].Brokerage` | Already computed in `RetirementPanel.jsx` lines 44-48 |
| Investable capital series | `typeData.series.map(d => (d.Retirement ?? 0) + (d.Brokerage ?? 0))` | Derivable per-point; needed for Mountain Skyline chart and achievement date scanning |
| `milestones` | `retirement.milestones` -- `[{label: string, amount: number}]` | Must be sorted by amount ascending for display (EC-7) |
| `nestEgg` | `computeNestEgg()` from `retirementMath.js` | May be null if `desired_annual_income` not set |
| `expected_return_pct` | `retirement.expected_return_pct` | Needed for projection line; may be absent (EC-6) |
| `monthly_contribution` | `retirement.monthly_contribution` | Needed for projection series |
| `currentAge` / `targetAge` | `retirement.current_age` / `retirement.target_retirement_age` | Needed for projection horizon and target year marker |
| Projection series | `generateProjectionSeries()` from `retirementMath.js` | Generates monthly compound-growth forward series |
| Merged series | `mergeHistoryWithProjection()` from `retirementMath.js` | Merges historical + projected for the chart view |

### Derived Values

| Value | Derivation |
|-------|------------|
| Per-milestone progress % | `Math.min(investableCapital / milestone.amount * 100, 100)` -- clamp to 100% |
| Per-milestone achieved status | `investableCapital >= milestone.amount` |
| Per-milestone achieved date | Scan investable capital series for first date where sum >= milestone.amount |
| Per-milestone projected date | Generate projection series from current IC; find first point where `projected_net_worth >= milestone.amount` |
| "You are here" position | Between last achieved milestone and next unachieved milestone in the sorted list |

---

## 4. Feature Scope -- Two Views in One Card

### 4A. Stack of Flags View (Primary -- Vertical Timeline)

A vertical track running top-to-bottom within the card:

- **Achieved milestone nodes:** Filled circles with checkmark icons, green color (`--color-positive`), connected by solid cobalt (`--accent`) line segments. Each node shows: milestone label, dollar amount, and achieved date (month + year, derived from historical series scan).
- **"You are here" marker:** A glowing cobalt dot positioned between the last achieved milestone and the next future one. Labeled with current investable capital dollar amount.
- **Future milestone nodes:** Hollow/outlined circles with muted text, connected by dashed line segments below the current position. Each node shows: milestone label, dollar amount, and projected date (month + year, or "N/A" if projection unavailable).
- **Nest egg target node (optional):** If `nestEgg` is computed, it appears as the final node with a visually distinct treatment (cobalt glow border or star icon). If `nestEgg` is null, it is omitted.
- **Node spacing:** Non-proportional (equal vertical gaps between nodes). Proportional spacing creates severe usability issues when milestone amounts are far apart. The brainstorm document confirms this design decision.

### 4B. Mountain Skyline View (Secondary -- Area Chart)

A standalone Recharts `AreaChart` showing only investable capital:

- **Historical area:** Cobalt area fill with solid line, covering all historical data points from `typeData.series`.
- **Projection line:** Dashed lighter cobalt line extending from the latest data point forward to the retirement target year. Uses `generateProjectionSeries()` with the user's `expected_return_pct` and `monthly_contribution`. Merged with history via `mergeHistoryWithProjection()`.
- **"Today" marker:** A vertical `ReferenceLine` at the most recent historical data point, separating history from projection.
- **Milestone reference lines:** Horizontal `ReferenceLine` elements at each milestone amount. Achieved milestones use green (`COLOR_POSITIVE`); future milestones use amber (`COLOR_AMBER`). Labels use the Recharts `content` prop or a custom label component to mitigate label collision.
- **Nest egg reference line:** If computed, shown as a distinguished reference line at the nest egg amount.
- **Y-axis:** Domain covers investable capital range plus headroom to the highest milestone or nest egg target.
- **X-axis:** Date labels, reduced tick count on mobile.

### 4C. View Toggle

The toggle mechanism allows switching between the two views:

- **Default view:** Stack of Flags (vertical timeline) is the default/primary view.
- **Toggle UI:** A pair of dot indicators below the card content, following the `HorizontalSwipeContainer` dot pattern (role="tablist" with role="tab" buttons, role="tabpanel" on the content panes). On desktop, labeled text tabs ("Timeline" / "Chart") may be used instead of dots if the designer determines dots are too subtle at larger viewport widths.
- **Swipe support on mobile:** If reusing `HorizontalSwipeContainer`, swipe gestures switch views natively via scroll-snap. On desktop, clicks/keyboard on the tab buttons switch views.
- **Persistence:** View selection is stored in component-local state only. It resets on page reload. No localStorage or URL persistence -- this is a lightweight preference, not a routing concern.
- **Animation:** Smooth transition between views via CSS scroll-snap (if using HorizontalSwipeContainer) or a crossfade. Respects `prefers-reduced-motion`.

---

## 5. Responsive Behavior

### Mobile (< 768px)

- **Stack of Flags:** Vertical layout works naturally on narrow screens. Labels may condense (dollar amount on second line below label). The "you are here" marker and node labels use the full card width.
- **Mountain Skyline:** Recharts `ResponsiveContainer` handles width automatically. Chart height reduces (use `isMobile` from `useResponsive()` -- same pattern as `TypeStackedChart` which uses 220px mobile / 300px desktop). Milestone label text abbreviates to fit. X-axis tick count reduces.
- **Toggle:** Dot indicators are centered below the card. Swipe gestures are the primary interaction.

### Desktop (>= 768px)

- **Stack of Flags:** Vertical timeline renders within a fixed-width column inside the card. The card does not stretch to full page width if that makes the timeline look sparse -- max-width constraint is appropriate.
- **Mountain Skyline:** Chart uses full card width. Labels have room for full milestone names.
- **Toggle:** Text tabs or segmented control are preferred over dots for discoverability. Keyboard navigation (arrow keys between tabs) must work.

### Tablet (768px - 1023px)

- Follows desktop layout with potential width adjustments. No unique tablet-specific behavior required.

---

## 6. Milestone States

Each milestone exists in one of three states, determined by comparing `investableCapital` against `milestone.amount`:

| State | Condition | Visual Treatment (Timeline) | Visual Treatment (Chart) |
|-------|-----------|---------------------------|------------------------|
| **Achieved** | `investableCapital >= milestone.amount` | Green filled circle + checkmark + achieved date | Green horizontal reference line |
| **In-Progress** | Next unachieved milestone (the one immediately above current IC) | The "you are here" marker sits between last achieved and this node | Amber horizontal reference line (closest to current position) |
| **Future** | All unachieved milestones after the in-progress one | Hollow circle, muted text, dashed connector | Amber horizontal reference line |

**Nest egg target** follows the same state logic but has additional visual distinction (cobalt glow, different icon) to separate it from user-defined milestones.

---

## 7. Edge Cases and Error States

All edge cases from the Phase 2.1 requirements document (EC-1 through EC-9) apply. Additional implementation-specific cases:

| ID | Condition | Behavior |
|----|-----------|----------|
| EC-1 | No milestones defined (empty array), retirement settings exist | Hide the milestone hero card entirely. Do not render an empty timeline or chart. The RetirementPanel still renders normally. |
| EC-2 | No retirement settings (`data.exists === false`) | Hero card does not render. Existing graceful degradation pattern continues. |
| EC-3 | Investable capital is zero (no Retirement/Brokerage accounts) | Timeline: "You are here" marker at $0, all milestones shown as future. Chart: historical area is flat at zero. Projected dates show "N/A" if no return rate. |
| EC-4 | Single milestone already achieved | Timeline: one green node + "you are here" below it. No future nodes. Chart: IC area is above the single reference line. |
| EC-5 | All milestones achieved | Timeline: all nodes green with checkmarks, "you are here" marker below the last node. No dashed connectors. If nest egg also achieved, show a consolidated "ahead of target" state. Chart: all reference lines are green, IC area is above all of them. |
| EC-6 | No `expected_return_pct` set | Timeline: projected dates show "N/A" or are omitted for future milestones. Chart: no projection line rendered -- show only the historical area. Display a subtle notice ("Set expected return rate for projections"). |
| EC-7 | Milestones not in ascending order | Sort milestones by `amount` ascending before rendering in both views. |
| EC-8 | Very large milestone values (e.g., $50M vs $100K IC) | Timeline: non-proportional spacing handles this naturally (equal gaps). Chart: Y-axis domain extends to accommodate the highest milestone, but the historical area will be a thin band at the bottom. Consider log scale as a future enhancement but use linear for now. |
| EC-9 | Negative investable capital (margin debt) | Treat as zero for progress calculations. Timeline: "you are here" at $0. Chart: area may dip below zero but milestone comparisons use `Math.max(0, ic)`. |
| EC-10 | Only 1 milestone defined | Timeline: renders with just one node + "you are here" marker. The track is short but functional. Chart: single reference line. Both views are usable but minimal. |
| EC-11 | Projection extends beyond a reasonable horizon (100+ years) | Cap projection series at 50 years or retirement target year, whichever is sooner. If a milestone's projected date exceeds the cap, show "50+ years" rather than a specific date. |
| EC-12 | `typeData` loaded but `retirement` not yet loaded (async timing) | Do not render the hero card until both `typeData` and `retirement` data are available. No loading spinner inside the card -- it simply appears when ready (consistent with how TypeStackedChart and RetirementPanel handle loading). |
| EC-13 | Recharts label collision in Mountain Skyline view | When milestones have amounts close together, reference line labels may overlap. Mitigation: use a custom label component with the Recharts `content` prop to offset labels vertically, or use tooltip-on-hover for milestone labels instead of static text. The architect should specify the exact strategy. |

---

## 8. Placement and Wiring

The hero card is placed in `NetWorthPage.jsx` between `TypeStackedChart` and `AccountsBreakdown`:

```
StatsCards
NetWorthChart (total NW history)
TypeStackedChart (NW by bucket, CAGR table) -- ReferenceLine loop REMOVED
MilestoneHeroCard (NEW -- dual-view milestone visualization)  <-- here
AccountsBreakdown
RetirementPanel (form + MilestoneEditor + RetirementSummary)
```

### Props / Data Wiring

The hero card needs these props from `NetWorthPage`:

- `typeData` -- to derive investable capital series
- `retirement` -- milestones, return rate, contribution, ages
- Or: pre-computed values passed as individual props (architect decides the interface)

### TypeStackedChart Changes

- Remove the `milestones` prop
- Remove the `ReferenceLine` rendering loop (lines 157-166)
- Remove the `milestones` PropTypes declaration
- Update `NetWorthPage.jsx` line 99 to stop passing `milestones={retirement?.milestones}`

---

## 9. Constraints and Anti-Goals

### Constraints (carried forward from Phase 2.1 requirements)

- C-1: Investable capital = Retirement + Brokerage. Definition must remain consistent with `RetirementPanel.jsx`.
- C-2: Must use existing Dark Cobalt design tokens. No new color tokens unless the designer agent defines them.
- C-3: Milestone data model (`[{label, amount}]` in `retirement_settings.milestones`) does not change.
- C-4: No new API endpoints or backend changes (AG-5).
- C-5: Performance: renders in under 200ms with 60 data points (SC-9).
- C-6: Keyboard navigable with ARIA labels/roles (SC-10).

### Anti-Goals (explicitly out of scope)

- AG-1: **The other 6 brainstorm concepts** (Cards, Fuel Gauge, Achievement Shelf, Runway Staircase, Twin Lines, Distance to Summit) are not being built.
- AG-2: **Inline milestone editing** from the hero card. Milestones are edited only via MilestoneEditor inside RetirementPanel.
- AG-3: **Monte Carlo or probability-based projections.** Simple compound growth only.
- AG-4: **Persistence of view selection** across page loads (localStorage, URL params, etc.).
- AG-5: **Celebration animations** when milestones are achieved. Simple state distinction (green checkmark) is sufficient.
- AG-6: **Log-scale Y-axis** for the Mountain Skyline chart. Linear scale only for Phase 2.1.
- AG-7: **Changes to RetirementPanel form**, RetirementSummary, or CAGR table.
- AG-8: **A separate page** for milestone tracking. Everything stays on the Net Worth page.
- AG-9: **Drag-to-reorder milestones** in the visualization. Milestones are always sorted by amount.

---

## 10. Deferred Decisions

| ID | Decision | Owner |
|----|----------|-------|
| DD-1 | Whether the toggle uses `HorizontalSwipeContainer` directly, a new shared toggle component, or an inline implementation | Architect |
| DD-2 | Exact label collision mitigation strategy for Mountain Skyline reference lines | Architect + Designer |
| DD-3 | Whether to use the user's `expected_return_pct` or observed CAGR for projection fallback | Architect |
| DD-4 | Whether the "On Track / Off Track" badge should move from RetirementSummary into the hero card | Designer |
| DD-5 | Whether the nest egg target is shown as a milestone node or kept separate | Designer |
| DD-6 | Exact animation/transition treatment for view switching | Designer |
| DD-7 | Desktop toggle UI: dots vs. segmented control vs. text tabs | Designer |
| DD-8 | Whether the hero card has a max-width constraint on desktop or stretches to full container width | Designer |

---

## 11. Open Questions

- **OQ-1:** Should both views share the same card header (e.g., "Milestone Progress") or should the header text change per view (e.g., "Milestone Timeline" / "Growth Projection")?
- **OQ-2:** The Mountain Skyline chart adds Recharts complexity (label collisions, SVG rendering). If label collision mitigation proves too costly, should the architect be empowered to simplify (e.g., tooltips only, no static labels) without returning to PM?
- **OQ-3:** Should the Stack of Flags view show the percentage progress toward the next unachieved milestone, or only the dollar amounts? The brainstorm noted that the timeline "does not answer 'am I on pace?' quantitatively" -- adding a percentage could address this weakness.

---

## 12. Scope Summary

### Will be built:

1. **MilestoneHeroCard component** -- a single card with two togglable views
2. **Stack of Flags view** (primary) -- vertical milestone timeline with achieved/in-progress/future states, "you are here" marker, projected dates
3. **Mountain Skyline view** (secondary) -- Recharts area chart with historical IC, projection line, milestone reference lines
4. **View toggle** -- dot indicators (mobile) / tabs (desktop), following HorizontalSwipeContainer ARIA pattern
5. **Remove milestone ReferenceLine rendering** from TypeStackedChart
6. **Remove `milestones` prop** from TypeStackedChart
7. **Wire MilestoneHeroCard** into NetWorthPage between TypeStackedChart and AccountsBreakdown
8. **Edge case handling** for all EC-1 through EC-13 scenarios
9. **Tests** for the new component and updated integration tests for TypeStackedChart (milestone prop removal)

### Will NOT be built:

- The other 6 brainstorm concepts
- Backend changes or new API endpoints
- Inline milestone editing from the hero card
- Monte Carlo projections
- Persistence of view selection
- Changes to RetirementPanel, RetirementSummary, MilestoneEditor, or CAGR table
- A separate milestone page
