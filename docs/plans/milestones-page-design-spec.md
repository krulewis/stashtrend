# Design Spec: Milestones Page Consolidation

**Feature:** Milestones Page Consolidation
**Date:** 2026-03-12
**Scope:** Layout decisions only — no redesign of individual component internals

---

## Visual Overview

The page is a reorganization, not a redesign. All five sections (ForecastingSummary,
MilestoneCardsView, ForecastingChart, ForecastingControls, RetirementPanel) are
self-contained cards that already handle their own backgrounds, borders, and padding.
The page layout is a single vertical flex column with consistent `gap: var(--sp-5)`
between sections — the same rhythm the page already uses for `.content`. No new
chrome, no section header bars, no dividers are needed. The component cards provide
sufficient visual separation on their own.

The one structural addition is a thin `<section>` wrapper around RetirementPanel
at the bottom of the page. Its purpose is scroll targeting and accessibility labeling
only — it adds no visible styling.

---

## Decision 1: Section Separators and Headers

**Decision: No section separators or headers between any sections.**

Rationale:

- Every component in this stack — ForecastingSummary, ForecastingControls,
  ForecastingChart, RetirementPanel — renders its own `var(--bg-card)` surface with
  a `1px var(--border)` border and `var(--radius-lg)` radius. The card boundaries
  themselves are the separators. Adding a rule or header label on top of card
  boundaries creates redundant chrome.

- MilestoneCardsView renders a raw grid (`.grid` in `MilestoneCardsView.module.css`
  — no container card, no border of its own). It will sit between two bordered
  cards (ForecastingSummary above, ForecastingChart below), and the `gap: var(--sp-5)`
  from `.content` provides the visual breathing room.

- The page already has a page-level `<h1>` ("Milestones"). Adding section-level `<h2>`
  headers for "Readiness", "Milestones", "Projection", "Controls", "Settings" would
  inflate visual weight and fragment a page that is meant to read as one continuous
  planning surface.

- No other page in the app (NetWorthPage, BudgetPage, GroupsPage) uses intra-page
  section headers. Introducing them here would be inconsistent with established
  patterns.

**Section header treatment for MilestoneCardsView specifically:**
MilestoneCardsView currently lives inside `MilestoneHeroCard`, which provides a
title ("Milestones") and count badge ("X of Y achieved"). When MilestoneHeroCard is
deleted and MilestoneCardsView is rendered directly, that title/badge UI disappears.

Decision: Do not add a replacement header. The page `<h1>` is already "Milestones".
ForecastingSummary immediately above already contextualizes what this page is about.
The milestone cards are self-labeling through their own pills and eyebrow text. Adding
a "Milestones" subheader directly above cards that are titled "Milestone" is redundant.

If a future iteration wants a count badge ("3 of 5 achieved"), that is a
MilestoneCardsView internal concern and is out of scope for this consolidation.

---

## Decision 2: MilestoneCardsView Empty/Hidden State (shouldRender = false)

When `milestoneData.shouldRender` is `false`, the conditional `{milestoneData.shouldRender && <MilestoneCardsView ... />}` resolves to nothing — the component is not mounted, no placeholder takes its place.

**Decision: Render nothing. No empty state placeholder between ForecastingSummary and ForecastingChart.**

Rationale:

- `shouldRender` is `false` in two cases: (a) data not yet loaded — both `typeData`
  and `retirement` are `null`; (b) user has retirement settings but zero milestones
  configured (EC-2 from requirements).

- Case (a) is already gated: MilestoneCardsView only appears inside the
  `!isRetirementTargetInvalid && !hasNoData` block, which itself is inside the
  `!loading && !error` block. By the time the component would render, both datasets
  are loaded. `shouldRender` being false at this point means genuinely no milestones
  exist.

- Case (b): a user with zero milestones already sees ForecastingSummary (readiness
  cards) and ForecastingChart (projection) without milestones. The gap between those
  two sections is tighter when MilestoneCardsView is absent, but this is desirable —
  it brings the chart closer to the summary for a user who has no milestones to see.
  There is no visual hole because the sections are cards with defined heights.

- An empty-state placeholder ("You have no milestones configured — add some via the
  Retirement Settings panel below") would add new UI copy that is out of scope and
  would also be confusing UX: the placeholder would appear between two content-rich
  sections, interrupting the flow rather than helping it. The RetirementPanel at the
  bottom already provides the path to configure milestones.

**What the page looks like when shouldRender is false:**

```
ForecastingSummary card
                             ← var(--sp-5) gap
ForecastingChart card
                             ← var(--sp-5) gap
ForecastingControls card
                             ← var(--sp-5) gap
RetirementPanel card
```

The uniform gap rhythm is preserved. No visual anomaly.

---

## Decision 3: RetirementPanel Wrapper Treatment

RetirementPanel renders its own `.container` card (background `var(--bg-card)`,
border `1px var(--border)`, radius `var(--radius-lg)`, padding `20px 24px`).
It needs no additional visual wrapper.

**Decision: Wrap RetirementPanel in a bare `<section>` element with `id` and `ref`
only. No added class, no added styling.**

```jsx
<section id="retirement-settings" ref={retirementRef} aria-labelledby="retirement-settings-heading">
  <RetirementPanel
    data={retirement}
    onSave={handleSaveRetirement}
    loading={retirementLoading}
    error={retirementError}
    typeData={typeData}
  />
</section>
```

The `<section>` element is semantically appropriate (it is a distinct thematic region
of the page), provides the scroll anchor without requiring `document.getElementById`,
and allows a screen reader to announce the region via `aria-labelledby`. RetirementPanel
already has an internal `.title` element with text "Retirement Settings" — that element
should receive `id="retirement-settings-heading"` to satisfy the `aria-labelledby`
reference. This is a one-attribute addition to RetirementPanel's internal title element.

**Note to implementer:** RetirementPanel.jsx is listed as "component file unchanged" in
the architecture. If adding `id="retirement-settings-heading"` to the internal title
touches that file, confirm with user whether this is acceptable. If not, omit the
`aria-labelledby` on the `<section>` and use `aria-label="Retirement Settings"` inline
instead — no file change required.

**No collapsible/accordion treatment.** RetirementPanel is a settings form accessed
via scroll-to-anchor from ForecastingSummary's "Edit Settings" link. Making it
collapsible would break the scroll UX — the user scrolls down expecting to see the
form, not a collapsed header they have to click to expand. The "configure once"
pattern means the panel is visible by default on every page visit, which is acceptable
at the page bottom where it does not compete with primary reading content.

---

## Decision 4: CSS Module Changes in ForecastingPage.module.css

**Decision: No new CSS classes required.**

The existing `.content` rule handles everything:

```css
.content {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
```

This already produces consistent vertical spacing between all sections. MilestoneCardsView
(a raw grid with no outer card) and the RetirementPanel `<section>` wrapper (unstyled)
both participate correctly in this flex column.

The only consideration is MilestoneCardsView's grid rendering directly inside `.content`.
Since `.content` is `flex-direction: column`, each direct child is a full-width flex
item. MilestoneCardsView's `.grid` is a CSS Grid that handles its own two-column layout.
This nesting is compatible — no changes needed.

**One addition to ForecastingPage.module.css is needed if the implementer wants to
suppress the section wrapper's default browser margin/padding:**

```css
/* Scroll anchor wrapper — no visual styling */
.retirementAnchor {
  display: contents;
}
```

`display: contents` makes the `<section>` wrapper invisible to layout — the
RetirementPanel card participates directly in the `.content` flex column as if the
wrapper does not exist. This prevents any theoretical margin/gap doubling from the
`<section>` element's default block formatting.

This class is optional. Because `<section>` has no user-agent margin/padding by
default in modern browsers (the global reset `margin: 0; padding: 0` on `*` already
handles this), `display: contents` is a belt-and-suspenders precaution. Include it
only if testing reveals a gap inconsistency.

---

## Decision 5: Mobile Layout

**Breakpoint: 768px** (existing breakpoint used consistently across all components on
this page).

**Decision: No mobile-specific layout changes required. The existing responsive stack
works correctly with the new section order.**

Analysis by section:

**ForecastingSummary** — already mobile-responsive. `.cardsGrid` collapses to
`grid-template-columns: 1fr` at `max-width: 600px`. This is narrower than the
768px page breakpoint, which is fine — summary cards stack before the sidebar
disappears.

**MilestoneCardsView** — already mobile-responsive. `.grid` is single-column by
default and switches to two columns at `min-width: 768px`. On mobile, milestone
cards stack vertically. This is the correct behavior — cards are wide enough to be
readable at full mobile width.

**ForecastingChart** — no changes. Chart is already full-width and responsive via
Recharts `<ResponsiveContainer>`.

**ForecastingControls** — already mobile-responsive. `.slidersGrid` is a single
flex column on mobile, switching to a two-column grid at `min-width: 768px`.

**RetirementPanel** — already mobile-responsive. `.grid` collapses to
`grid-template-columns: 1fr` at `max-width: 600px`. Fields stack vertically on
mobile.

**Scroll depth concern on mobile:** With all five sections present, the RetirementPanel
is further down the page on mobile than it was on NetWorthPage. The "Edit Settings"
link in ForecastingSummary's `handleEditSettings` callback performs a smooth scroll
to `retirementRef`. This works correctly on mobile — `scrollIntoView` with
`{ behavior: 'smooth', block: 'start' }` handles variable scroll distances. No
additional mobile treatment needed.

**Bottom tab bar overlap:** The mobile `BottomTabBar` has fixed positioning and takes
approximately 60px at the bottom of the viewport. The page's last section
(RetirementPanel) needs sufficient bottom padding so the save/cancel actions are not
obscured. RetirementPanel's `.actions` row sits inside the panel's own 20px padding —
combined with the page's existing scroll container margin, this should be sufficient.
If testing reveals the save button is clipped by the tab bar, add `padding-bottom:
var(--sp-5)` to the `.content` rule in `ForecastingPage.module.css`. This is a
safe, additive change.

---

## Token Reference

No new tokens. All tokens referenced in this spec are already defined in `index.css`:

| Token | Value | Usage in this feature |
|-------|-------|-----------------------|
| `--sp-5` | `20px` | Gap between sections in `.content` |
| `--bg-card` | `#1C2333` | Card backgrounds (existing components) |
| `--border` | `#1E2D4A` | Card borders (existing components) |
| `--radius-lg` | `12px` | Card border radius (existing components) |

---

## Accessibility

**Section landmarks:** The `<section>` wrapper around RetirementPanel introduces
a named landmark at the bottom of the page. ForecastingSummary, ForecastingChart,
ForecastingControls, and MilestoneCardsView do not require wrapper landmarks — they
are components within a single-topic page, not distinct regions.

**Page heading:** `<h1>` changes from "Forecasting" to "Milestones". This is the
only heading change. No sub-headings added.

**Focus and scroll behavior:** `handleEditSettings` calls `scrollIntoView`. The
scroll lands at the `<section>` wrapper, not on a focusable element, so focus does
not move. This is intentional — the user wants to see the form, not tab into it.
If keyboard users need to navigate to the form, they can use standard Tab progression.
The scroll brings the form into viewport without hijacking keyboard focus.

**MilestoneCardsView outside MilestoneHeroCard:** MilestoneHeroCard previously
wrapped MilestoneCardsView in:
```html
<div role="region" aria-label="Milestone cards" class="viewPanel">
```
When MilestoneHeroCard is deleted and MilestoneCardsView renders directly,
that `role="region"` wrapper is gone. MilestoneCardsView renders only a plain `<div>`
with a CSS grid. This is acceptable — the milestone cards each have `role="progressbar"`
with `aria-label` on the progress bar elements, which are the most important accessible
annotations. A region wrapper is a navigational convenience, not a requirement. The
`<section aria-label="Retirement Settings">` at the bottom provides the page's only
region landmark, which is appropriate given it is the one area with distinct thematic
separation from the projection content above.

**Color contrast:** All foreground/background combinations in the sections being moved
are unchanged from their existing implementations. No new combinations introduced.

---

## Summary Checklist for Implementer

- `.content` in `ForecastingPage.module.css` — no changes required; existing `gap:
  var(--sp-5)` handles all section spacing.
- MilestoneCardsView — render directly inside the main content block, guarded by
  `{milestoneData.shouldRender && ...}`. No wrapper div, no section header.
- RetirementPanel — render inside `<section id="retirement-settings" ref={retirementRef}>`.
  Use `aria-label="Retirement Settings"` on the section (avoids touching RetirementPanel
  internals).
- When `shouldRender` is `false` — render nothing. Page flows directly from
  ForecastingSummary to ForecastingChart with normal gap.
- Mobile — no breakpoint changes. Verify RetirementPanel save button is not clipped
  by BottomTabBar after implementation; add `padding-bottom: var(--sp-5)` to
  `.content` only if clipping is observed.
- Optionally add `.retirementAnchor { display: contents; }` to
  `ForecastingPage.module.css` and apply it to the `<section>` wrapper if gap
  inconsistency is observed in testing.
