# Requirements -- Phase 2.1: Milestone Basis Correction + Retirement Progress UX

**Date:** 2026-03-09
**Source:** PM Agent (based on user feedback and codebase analysis)
**Status:** Ready for research/architecture pipeline

---

## 1. Clarified Intent

Phase 2 shipped milestones as horizontal dashed `<ReferenceLine>` elements on the TypeStackedChart, comparing dollar amounts against the full stacked area (total net worth). This is financially incorrect: total NW includes home equity, vehicles, and other illiquid assets that cannot fund retirement withdrawals.

Phase 2.1 fixes the underlying data model so milestones and retirement readiness compare against **investable capital** (Retirement + Brokerage bucket balances), and replaces the current milestone visualization with something more effective. The RetirementPanel already computes `investableCapital` correctly -- the bug is that the milestone reference lines are drawn on the TypeStackedChart where the Y-axis represents total stacked NW, creating a false visual comparison.

**Two distinct problems to solve:**

1. **Data correctness:** Milestones must be evaluated against investable capital, not total NW. Any visualization of milestone progress must use Retirement + Brokerage balances as the denominator.

2. **UX quality:** The user finds the current horizontal dashed reference lines on the stacked area chart "not very good." The visualization needs to be rethought. The requirements below specify *what information* the user needs -- not *how* to display it. The design and architecture steps will determine the visualization approach.

---

## 2. Success Criteria

### Data Correctness
- SC-1: Milestones are compared against investable capital (Retirement + Brokerage), never against total net worth.
- SC-2: The "On Track / Off Track" badge in RetirementSummary uses investable capital for its projection (this already works -- must not regress).
- SC-3: The TypeStackedChart no longer renders milestone `<ReferenceLine>` elements (they are misleading on a total-NW chart).

### UX -- Information Requirements
The milestone/retirement visualization must answer these questions at a glance:

- SC-4: **Where am I now?** Current investable capital as a concrete dollar amount.
- SC-5: **How far along am I?** Progress toward each milestone and/or the retirement nest egg target, expressed as a ratio or percentage.
- SC-6: **When will I get there?** Projected date (month/year) to reach the next milestone, based on current growth trajectory.
- SC-7: **Am I on pace?** Whether current trajectory meets the retirement target by the target retirement year.
- SC-8: **What milestones have I passed?** Clear distinction between achieved and future milestones.

### Non-Functional
- SC-9: The milestone visualization renders in under 200ms on a dataset with 5 years of monthly history (60 data points).
- SC-10: All new UI elements are keyboard-navigable and have appropriate ARIA labels/roles.
- SC-11: The visualization is usable on mobile (viewport >= 375px width). Content may reflow but must remain readable and interactive.
- SC-12: No new network requests -- milestone evaluation uses data already fetched (typeData series + retirement settings).

---

## 3. Constraints and Anti-Goals

### Constraints
- C-1: Investable capital = `Retirement + Brokerage` bucket values from the `typeData.series` endpoint. This definition is already established in `RetirementPanel.jsx` (lines 44-48) and must remain consistent.
- C-2: Must use the existing design system (Dark Cobalt tokens, CSS custom properties). No new color tokens unless the designer agent defines them.
- C-3: Milestone data model (stored as JSON in `retirement_settings.milestones`) does not change. The backend schema is stable.
- C-4: The TypeStackedChart continues to show net worth by account type -- it just no longer shows milestone reference lines.

### Anti-Goals (explicitly out of scope)
- AG-1: **No new pages.** Milestones stay on the Net Worth page. A dedicated forecasting page is Phase 4.
- AG-2: **No Monte Carlo or probability-based projections.** Simple compound growth only (Phase 5 scope).
- AG-3: **No changes to the RetirementPanel form inputs.** The form fields (ages, income, contributions, advanced settings) are stable.
- AG-4: **No changes to CAGR calculation or display.** The CAGR table in TypeStackedChart is unrelated.
- AG-5: **No new API endpoints.** All data needed is already available from `/api/networth/by-type` and `/api/retirement`.
- AG-6: **Do not prescribe a specific visualization type** in this requirements doc. The designer/architect will decide whether to use progress bars, gauges, timelines, separate charts, cards, or something else entirely.

---

## 4. Edge Cases and Error States

- **EC-1: No milestones defined.** User has retirement settings but zero milestones. The milestone visualization should either hide gracefully or show a prompt to add milestones.
- **EC-2: No retirement settings at all.** `data.exists === false`. The milestone visualization does not render. The existing graceful degradation pattern (`.catch(() => ({ exists: false }))`) continues to work.
- **EC-3: Investable capital is zero.** User has no Retirement or Brokerage accounts. Progress toward any milestone is 0%. Projected dates should show "N/A" or equivalent rather than "Infinity years."
- **EC-4: Milestone already achieved.** Current investable capital exceeds a milestone amount. Must clearly mark as achieved (not show 100%+ progress bar extending beyond bounds).
- **EC-5: All milestones achieved.** Every defined milestone is below current investable capital. Show them all as achieved. If a nest egg target exists and is also achieved, show "ahead of target" state.
- **EC-6: No expected return rate set.** User has not filled in the advanced settings. Projection-to-date calculations cannot run. Show current progress without projected dates, or use a sensible default (the form placeholder suggests 7%).
- **EC-7: Milestones not in ascending order.** User may define milestones in any order (e.g., $1M before $500K). The visualization should sort milestones by amount for display regardless of input order.
- **EC-8: Very large milestone values.** A milestone of $50M with current investable capital of $100K. Progress is 0.2%. The visualization must remain readable and not collapse to an invisible sliver.
- **EC-9: Negative investable capital.** Theoretically possible if brokerage accounts have margin debt. Treat as zero for progress calculations.

---

## 5. Deferred Decisions

- **DD-1: Visualization approach.** Whether milestones use a progress bar, timeline, gauge, separate mini-chart, card grid, or other pattern. Decided by frontend-designer + architect agents.
- **DD-2: Milestone projected dates algorithm.** Whether to use the user's `expected_return_pct` setting, the observed CAGR from typeData, or offer both. Decided by architect.
- **DD-3: Investable capital trend line.** Whether to add a separate line/area on the TypeStackedChart showing just investable capital (Retirement + Brokerage sum), in addition to the stacked breakdown. Decided by designer/architect.
- **DD-4: Mobile layout specifics.** Whether the milestone visualization stacks vertically, collapses into an accordion, or uses a different mobile-specific pattern. Decided by frontend-designer.
- **DD-5: Animation/transitions.** Whether progress indicators animate on load or update. Decided by frontend-designer.

---

## 6. Open Questions

- **OQ-1: Should the "On Track / Off Track" badge move?** Currently it lives inside RetirementSummary, which is inside RetirementPanel. If the new milestone visualization shows progress toward the nest egg target, the badge might be redundant or should be consolidated. The designer should decide where track status lives.
- **OQ-2: Should achieved milestones show the date they were achieved?** The historical typeData series has monthly granularity. We could find the first month where investable capital exceeded each milestone. Worth considering but may add complexity.
- **OQ-3: Milestone ordering relative to nest egg target.** The nest egg target (from withdrawal rate math) is conceptually the "final" milestone. Should it be displayed alongside user-defined milestones, or kept separate in RetirementSummary? The designer should decide.

---

## 7. Scope Summary

### Will be built in Phase 2.1:
1. **Remove milestone reference lines from TypeStackedChart.** Delete the `<ReferenceLine>` rendering loop and the `milestones` prop.
2. **Build a new milestone progress visualization** (design TBD) that:
   - Uses investable capital (Retirement + Brokerage) as the basis
   - Shows current progress toward each milestone
   - Shows projected dates to reach future milestones
   - Distinguishes achieved vs. future milestones
   - Handles all edge cases listed above
3. **Ensure RetirementSummary continues to use investable capital** (no regression).
4. **Update props/wiring in NetWorthPage** to connect the new visualization.
5. **Tests** for the new visualization component and updated integration tests.

### Will NOT be built:
- New API endpoints or backend changes
- Changes to the retirement settings form
- Monte Carlo projections or probability analysis
- A separate investments or forecasting page
- Changes to the CAGR table or TypeStackedChart stacked area rendering
