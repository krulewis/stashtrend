# Staff Review -- Phase 2.1 Implementation Plan

**Date:** 2026-03-10
**Reviewer:** Staff Engineer Agent (fresh context)
**Inputs:** phase2.1-impl-plan.md, phase2.1-architecture.md, phase2.1-design-spec.md, phase2.1-requirements-impl.md, codebase source files

---

## Findings

1. [Critical] phase2.1-impl-plan.md, Group A (recharts mock) -- Customized import added to mock but never used in component code
   The plan adds a `Customized` export to `frontend/__mocks__/recharts.jsx` (line 74-78) for the "today-dot overlay" in MilestoneSkylineView. However, the MilestoneSkylineView component spec (Group C) does NOT import or use `<Customized>` anywhere. The today divider uses `<ReferenceLine>` (already mocked). The current value dot described in the design spec (Section 4, "Current value dot") is never implemented in the plan's component specification -- it is silently dropped. The `Customized` mock export is dead code.
   Required action: Either (a) remove the Customized mock addition since the component does not use it, OR (b) add the today-dot implementation to MilestoneSkylineView.jsx using `<Customized>` and import it from recharts. If the dot is deferred, remove the mock change and add a comment noting the deferral.

2. [Critical] phase2.1-impl-plan.md, Group A (recharts mock) -- Wrong file path for recharts mock
   The plan references the mock file as `frontend/src/__mocks__/recharts.jsx` (implied in the overview "The recharts mock file needs a Customized export"). The actual file path is `frontend/__mocks__/recharts.jsx` (at the frontend root, not under `src/`). The Group A block correctly says `frontend/__mocks__/recharts.jsx` at the file header, but the plan overview text and the codebase cross-reference instructions both use the wrong path with `src/`. Implementers reading the overview could look in the wrong directory.
   Required action: Ensure all references to the recharts mock consistently use the correct path `frontend/__mocks__/recharts.jsx`.

3. [High] phase2.1-impl-plan.md, Group A (chartUtils.jsx) -- Plan claims COLOR_AMBER is at line 119, which is correct, but claims COLOR_ACCENT_LIGHT "already exists" then contradicts itself
   The plan overview (line 17) says: "`COLOR_AMBER` and `COLOR_ACCENT_LIGHT` already exist in `chartUtils.jsx` (`COLOR_AMBER = '#F5A623'` is present at line 119; `COLOR_ACCENT_LIGHT` does not exist and must be added)." The parenthetical contradicts the opening claim that both "already exist." This is confusing but the parenthetical is correct -- `COLOR_ACCENT_LIGHT` does NOT exist and must be added. The Group A block correctly says to add it. Line 119 for `COLOR_AMBER` is verified correct.
   Required action: Fix the overview sentence to say: "`COLOR_AMBER` already exists in `chartUtils.jsx` at line 119. `COLOR_ACCENT_LIGHT` does not exist and must be added."

4. [High] phase2.1-impl-plan.md, Group C (MilestoneCardsView.module.css) -- CSS tokens `--green-tint` and `--amber-tint` do not exist in index.css
   The plan's CSS spec for `MilestoneCardsView.module.css` uses `.pillGreen { background: var(--green-tint); color: var(--green) }` and `.pillAmber { background: var(--amber-tint); color: var(--amber) }`. Verified against `frontend/src/index.css`: `--green` and `--amber` exist, but `--green-tint` and `--amber-tint` do NOT exist as CSS custom properties. The plan's Risk 1 section acknowledges this possibility and provides hex fallbacks, but the CSS spec itself uses the tokens as if they exist. An implementer following the CSS spec literally will produce broken styles.
   Required action: Update the CSS spec in the plan to use the hex fallbacks directly: `background: rgba(46,204,138,0.12)` for green-tint and `background: rgba(245,166,35,0.12)` for amber-tint. Alternatively, add these tokens to `index.css` as a new change in Group A. Adding them is the cleaner option since `--accent-tint` already exists as a precedent.

5. [High] phase2.1-impl-plan.md, Group B (useMilestoneData hook) -- EC-9 inconsistency between hook and chart view
   The hook stores `investableCapital = Math.max(0, rawIC)` for progress calculations (correct per EC-9). But the hook also passes `investableCapital` to MilestoneSkylineView via the container. The design spec says the chart should show actual negative area ("Chart shows actual line (may be at or below 0)"). With `Math.max(0, rawIC)`, the chart will never show negative values because the investableCapital prop passed to the view is already clamped.
   Required action: The hook should return BOTH `rawInvestableCapital` (for chart rendering -- used in the today-dot position, tooltip, etc.) and `investableCapital` (clamped, for progress calculations). MilestoneHeroCard should pass `rawInvestableCapital` to MilestoneSkylineView. The investableSeries already contains raw values (not clamped), so the chart area will render correctly, but the `investableCapital` prop on SkylineView is used for the today-dot Y position and tooltip value, and should reflect reality.

6. [High] phase2.1-impl-plan.md, Group D (MilestoneHeroCard.jsx) -- Architecture vs plan conflict on ARIA semantics
   The architecture decision (Section 1) explicitly chose `aria-pressed` buttons + `role="region"` over `role="tablist"` / `role="tab"` / `role="tabpanel"`, with detailed rationale about avoiding roving tabindex. The implementation plan ignores this decision and uses `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`, AND implements roving tabindex with arrow key handling via refs. This contradicts the architecture document.
   Required action: Align with the architecture decision. Either (a) use `aria-pressed` buttons and `role="region"` as the architect specified (simpler, no roving tabindex needed), OR (b) if the plan intentionally overrides the architecture, document the rationale for the override. The current state is a silent contradiction that will confuse implementers.

7. [High] phase2.1-impl-plan.md, Group D (MilestoneHeroCard.jsx) -- Architecture vs plan conflict on conditional rendering vs display:none
   The architecture document (Section 1) says: "The inactive view is not rendered (conditional rendering, not `display: none`), to avoid mounting the Recharts chart when it is not visible." The design spec (Section 2, Toggle Behavior) says the opposite: "Both panels remain mounted in the DOM (display: none on inactive) to avoid chart re-init flash." The implementation plan follows the architecture (conditional rendering). This is fine, but the design spec should be noted as contradicted.
   Required action: No code change needed -- the plan correctly follows the architecture. But note that the design spec's `display: none` recommendation is overridden by architecture, and implementers should not follow the design spec on this point.

8. [Medium] phase2.1-impl-plan.md, Group B (useMilestoneData hook) -- projectionSeries uses fixed 50-year horizon instead of years-to-retirement
   The hook calls `generateProjectionSeries({..., years: 50})` unconditionally. The architecture doc says to cap at 50 years (EC-14), but the primary use case is projecting to retirement age, not 50 years. If a user is 35 targeting age 65, they need 30 years of projection -- 50 years wastes computation. If a user is 25 targeting age 80, they need 55 years but get capped at 50. The cap should be `Math.min(targetAge - currentAge, 50)` when both ages are available, falling back to 50 when they are not.
   Required action: Change `years: 50` to `years: Math.min(Number(retirement.target_retirement_age) - Number(retirement.current_age), 50) || 50`. This ensures the projection covers the retirement horizon when available and caps at 50 for safety. Also handles EC-14 correctly since `Math.min` will cap at 50.

9. [Medium] phase2.1-impl-plan.md, Group C (MilestoneSkylineView.jsx) -- `tickCount` prop on Recharts XAxis may not work as expected
   The plan passes `tickCount={isMobile ? 3 : 5}` to XAxis. However, Recharts' `tickCount` prop only works when the axis is a `number` type. For a `category` axis (which is what `dataKey="date"` produces -- string date labels), `tickCount` is ignored. The existing charts use `interval="preserveStartEnd"` WITHOUT `tickCount` and rely on Recharts' auto-interval to reduce labels. Adding `tickCount` will have no effect and may mislead reviewers into thinking tick density is controlled.
   Required action: Remove the `tickCount` prop. Use `interval="preserveStartEnd"` alone (matching existing chart conventions). If fewer ticks are needed on mobile, use Recharts' `interval` prop with a calculated numeric value based on data length, e.g., `interval={isMobile ? Math.ceil(mergedSeries.length / 3) : Math.ceil(mergedSeries.length / 5)}`.

10. [Medium] phase2.1-impl-plan.md, Group E (TypeStackedChart.jsx) -- Plan says PropTypes are at lines 218-222 but they are at lines 218-222 in the current file (211-222)
    The plan says "Lines 218-222: Remove the milestones PropTypes entry." The actual `milestones` PropTypes block is at lines 218-222 in the current `TypeStackedChart.jsx` file. This is correct. However, the plan says to remove `ReferenceLine` from the import at line 10 if unused. After removing the milestone loop, `ReferenceLine` IS unused -- the plan correctly identifies this as conditional ("If ReferenceLine is now unused..."). It IS unused. This should be stated as a definitive action, not conditional.
    Required action: Change the conditional statement to a definitive instruction: "Remove `ReferenceLine` from the recharts import at line 10, as it will be unused after the milestone loop deletion."

11. [Medium] phase2.1-impl-plan.md, Group C (MilestoneSkylineView.jsx) -- MilestoneLabel receives viewBox but the plan passes milestone and index via JSX element form
    The plan uses `label={<MilestoneLabel milestone={m} index={i} total={milestones.length} isMobile={isMobile} />}` on ReferenceLine. When Recharts renders a JSX element as a label, it clones the element and injects props like `viewBox`, `x`, `y`, `width`, `height`. The MilestoneLabel component description says it "receives {viewBox, milestone, index, total, isMobile}" -- but `viewBox` comes from Recharts injection, not from explicit props. This is correct behavior in Recharts 2.x, but the plan should be explicit that MilestoneLabel must accept and use the injected `viewBox` prop alongside its own custom props.
    Required action: Clarify in the plan that MilestoneLabel's function signature should destructure both injected Recharts props (`viewBox`, `x`, `y`) and custom props (`milestone`, `index`, `total`, `isMobile`). This is how Recharts label elements work but is non-obvious. Add a code comment for implementers.

12. [Medium] phase2.1-impl-plan.md, Group F (Tests) -- Test fixtures reference wrong file path
    The plan references fixtures at `frontend/src/__tests__/fixtures.js` in the task description ("verify existing fixtures"). The actual path is `frontend/src/test/fixtures.js`. The plan's Group F fixture modifications correctly reference `frontend/src/test/fixtures.js` (line 605), so the implementation instructions are correct, but the overall cross-reference list at the top is wrong.
    Required action: Informational only. The plan's Group F section uses the correct path. No code impact.

13. [Medium] phase2.1-impl-plan.md, Group C (MilestoneCardsView.jsx) -- fmtFull import path has wrong comment
    The plan says: "fmtFull import from '../components/chartUtils.jsx' (same directory, relative path)." Since MilestoneCardsView.jsx IS in `components/`, the import should be `'./chartUtils.jsx'`, not `'../components/chartUtils.jsx'`. The Key Imports section correctly shows `import { fmtFull } from './chartUtils.jsx'`, but the inline comment is misleading.
    Required action: Fix the inline comment to say `'./chartUtils.jsx'` to match the actual import.

14. [Medium] phase2.1-impl-plan.md, Group D (MilestoneHeroCard.jsx) -- MilestoneCard.module.css from architecture not created
    The architecture document (Section 9, File Structure) specifies a separate `MilestoneCard.jsx` file and `MilestoneCard.module.css` file. The implementation plan collapses MilestoneCard into MilestoneCardsView.jsx as an unexported inner component and puts all card CSS into `MilestoneCardsView.module.css`. This is a reasonable simplification, but the architecture also lists `MilestoneCard.module.css` as a separate file. The plan's approach is fine, but deviates from architecture without noting it.
    Required action: Add a note in the plan acknowledging this deviation: "MilestoneCard is co-located as an inner component in MilestoneCardsView.jsx rather than a separate file per the architecture doc. This reduces file count since MilestoneCard has no independent consumer."

15. [Medium] phase2.1-impl-plan.md, Group B (useMilestoneData hook) -- nestEgg computation uses Number() coercion that may produce unexpected results
    The hook computes `computeNestEgg(Number(retirement.desired_annual_income) || null, ...)`. Looking at `RetirementPanel.jsx`, these fields are stored as string state values from form inputs (e.g., `setDesiredIncome(e.target.value)`). However, the `retirement` object passed to `useMilestoneData` comes from the API response (the `fetchRetirement()` result), NOT from the component state. API responses return numeric values (see `MOCK_RETIREMENT` fixture: `desired_annual_income: 80000` as a number). The `Number()` coercion is defensive but unnecessary -- API values are already numbers. This is not a bug but is misleading code.
    Required action: Minor -- add a comment clarifying that retirement data comes from the API response where values are already numeric. The `Number()` coercion is harmless but the `|| null` coercion for `desired_annual_income` is important (converts 0 to null, which `computeNestEgg` needs).

16. [Low] phase2.1-impl-plan.md, Group C (MilestoneSkylineView.jsx) -- Missing import for Customized in recharts import list
    The Key Imports section for MilestoneSkylineView lists imports from recharts but does not include `Customized`. As noted in finding #1, the component does not use `Customized`, so this is consistent -- but it confirms the mock change is unnecessary.
    Required action: No action needed beyond resolving finding #1.

17. [Low] phase2.1-impl-plan.md, Group D (MilestoneHeroCard.module.css) -- viewPanel min-height may cause unnecessary whitespace
    The plan sets `.viewPanel { min-height: 220px }` (mobile) and `300px` (desktop). For Dashboard Cards with only 1-2 milestones on mobile, the cards may be shorter than 220px, leaving blank space at the bottom. This is intentional per the architecture (prevents layout jump on toggle), but could look odd with a single small card.
    Required action: Consider whether this is acceptable UX. If so, no change needed. If not, only apply min-height when the chart view has been activated at least once (track with a `hasShownChart` ref).

18. [Low] phase2.1-impl-plan.md, Group E (NetWorthPage.jsx) -- Plan says to insert after line 99 but MilestoneHeroCard mock must guard against null retirement
    The plan inserts `<MilestoneHeroCard typeData={typeData} retirement={retirement} />` in NetWorthPage. On initial render, `retirement` is null (before fetch completes). The hero card's `useMilestoneData` hook has a guard (`!retirement?.exists`), which will return `shouldRender: false` and the component returns null. This is correctly handled. However, `typeData` is also null initially. The hook guard checks `!typeData?.series?.length`, which is safely falsy for null. No bug here.
    Required action: None. Guards are correctly specified.

19. [Low] phase2.1-impl-plan.md, Test Strategy -- Missing test for MilestoneCardsView and MilestoneSkylineView components
    The plan specifies test files for `milestoneUtils.test.js`, `useMilestoneData.test.js`, and `MilestoneHeroCard.test.jsx`. However, there are no dedicated test files for `MilestoneCardsView` or `MilestoneSkylineView`. The architecture document lists `MilestoneSkylineView.test.jsx` in the file structure (Section 9). The MilestoneHeroCard test mocks both child views, so their internals are not tested. Progress bar rendering, status pill content, state-dependent colors, and chart reference line rendering are all untested.
    Required action: Add test specs for `MilestoneCardsView.test.jsx` (testing: status pills, progress bar aria attributes, achieved/in-progress/future state rendering, nest egg glow class, EC-5 "Ahead of target" text, EC-6 "Set expected return" text) and `MilestoneSkylineView.test.jsx` (testing: renders AreaChart, renders reference lines per milestone count, renders no-projection notice when hasProjection=false).

20. [Low] phase2.1-impl-plan.md, Group C (MilestoneSkylineView.jsx) -- Y-axis domain fallback logic
    The plan uses `domain={[0, highestTarget || 'auto']}`. If all milestones have amount 0 (unlikely but possible with malformed data), `highestTarget = 0 * 1.08 = 0`, and `0 || 'auto'` evaluates to `'auto'`. This is fine -- `'auto'` is a valid Recharts domain value. But if there is one milestone at amount 0, the domain `[0, 'auto']` may produce an odd chart. This is an extreme edge case unlikely to occur in practice.
    Required action: None. Edge case is too unlikely to warrant complexity.

---

## Summary

- **Critical:** 2 findings (#1, #2) -- dead code / wrong path for recharts mock
- **High:** 5 findings (#3, #4, #5, #6, #7) -- CSS token gaps, EC-9 inconsistency, architecture contradictions
- **Medium:** 7 findings (#8-#14, #15) -- projection horizon, tickCount, label rendering, import paths, deviations from architecture
- **Low:** 5 findings (#16-#20) -- minor cleanup, missing view-level tests

The most impactful issues to resolve before implementation are:
1. Fix the ARIA semantics conflict (finding #6) -- pick one approach
2. Add `--green-tint` and `--amber-tint` CSS tokens to `index.css` or use hex fallbacks in the CSS spec (finding #4)
3. Resolve the Customized/today-dot gap (finding #1)
4. Add view-level component tests (finding #19)
5. Fix the EC-9 rawIC vs clampedIC distinction (finding #5)
