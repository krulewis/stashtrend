# Brainstorm — Phase 2.1: Milestone Progress Visualization

**Date:** 2026-03-09
**Author:** Frontend Designer Agent
**Status:** Brainstorm complete — ready for architect review

---

## Design Context

The Dark Cobalt system runs on: `--bg-root` (#0A0F1E) as page background, `--bg-card` (#1C2333) as card surfaces, `--accent` (#4D9FFF) as the primary cobalt blue, `--color-positive` (#2ECC8A) green for success, `--color-warning` (#F5A623) amber for caution, and `--color-negative` (#FF5A7A) red for danger. Milestone progress carries a natural semantic mapping: green for achieved, cobalt for in-progress, amber for "further off," muted for distant future.

Available data for all concepts below:
- `investableCapital`: single number (Retirement + Brokerage, latest point)
- `investable series`: derivable by mapping `typeData.series` → `(d.Retirement ?? 0) + (d.Brokerage ?? 0)` per month
- `milestones`: `[{label, amount}]` sorted by amount ascending
- `nestEgg`: computed target (may be null if income/withdrawal rate not set)
- `projectedAtRetirement`: single number (compound growth to target age)
- Projection series: generatable via `generateProjectionSeries()` from current balance

Placement target: between `TypeStackedChart` and `RetirementPanel` in `NetWorthPage.jsx`.

---

## Concept 1 — "Stack of Flags" Progress Cards

**Name:** Stack of Flags — Milestone Card Grid

**Description:**
A vertical stack (single column on mobile, two columns on desktop) of cards, one per milestone plus the nest egg target as a final "summit" card. Each card is a self-contained panel that shows the milestone name, dollar amount, a thin horizontal progress bar, percentage complete, and projected date below. Achieved milestones flip to a green "sealed" state with a checkmark and the date first crossed. The nest egg target card is visually distinguished with a cobalt border glow.

**ASCII Mockup:**

```
┌─────────────────────────────────────────────┐
│  MILESTONES                    2 of 4 done  │
└─────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ ✓ Half-Mil           │  │ ✓ First Million       │
│ $500,000             │  │ $1,000,000            │
│ ████████████████ 100%│  │ ████████████████ 100% │
│ Achieved Jan '24     │  │ Achieved Aug '24      │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ → Fat FIRE           │  │ ◎ Nest Egg Target     │ ← cobalt glow border
│ $2,000,000           │  │ $3,200,000            │
│ ████████░░░░░░░░  62%│  │ ██████░░░░░░░░░░  49% │
│ Proj. Mar '29        │  │ Proj. Dec '31         │
└──────────────────────┘  └──────────────────────┘
```

**Strengths:**
- Directly answers all 5 questions (current, progress, projected date, on-pace, achieved vs future)
- Mobile trivially handled — cards stack to single column
- No Recharts involvement — zero label-collision bugs
- `role="progressbar"` pattern is a well-understood accessibility primitive
- Achieved milestones with historical date (OQ-2) require only an investable capital series scan — low added cost
- Scales gracefully from 1 to 20 milestones

**Weaknesses:**
- No visual sense of trajectory — just a static snapshot
- With many milestones, the card grid becomes long and scrolly
- For very small progress percentages (0.2%), the bar is a near-invisible sliver — needs `min-width` floor

**Effort:** Low — new component ~100-140 lines, minimal wiring in NetWorthPage

**Mobile (375px):** Cards collapse to full-width single column. Progress bar and text scale comfortably. No horizontal scrolling.

---

## Concept 2 — "Summit Climb" Vertical Timeline

**Name:** Summit Climb — Vertical Milestone Track

**Description:**
A vertical track running top-to-bottom with milestone nodes placed at non-proportional but ordered intervals. A vertical line connects all nodes. The current investable capital position is shown as a glowing cobalt dot on the track between the last achieved milestone and the next target. Achieved milestones above the current position have filled green circles with checkmarks. Future milestones below have hollow circles with muted labels. Connecting line segments between achieved nodes are cobalt; segments below the current dot are dashed/muted. Each node has a label, dollar amount, and — for future milestones — a projected year in small type.

```
  ✓ Half-Mil          $500K       Jan '24
  │ (solid cobalt line)
  ✓ First Million     $1,000K     Aug '24
  │
  ● NOW: $1,240K ←── glowing cobalt dot + live label
  │ (dashed line below)
  ○ Fat FIRE          $2,000K     ~Mar '29
  │
  ◎ Nest Egg Target   $3,200K     ~Dec '31
     (cobalt glow, star icon)
```

**Strengths:**
- Strong "journey" metaphor — past achievements are above you, goals are ahead
- Achieved vs future distinction is spatially obvious at a glance
- Feels like a leveling system / achievement tree, which is engaging
- The "current position dot" is memorable and distinctive versus any current Stashtrend pattern

**Weaknesses:**
- Non-proportional spacing (equal node gaps) loses financial distance information — $500K to $1M looks the same as $1M to $2M
- Proportional spacing creates usability issues: nodes near each other in value collapse, nodes far apart leave empty track
- With 1-2 milestones the track is short and feels sparse
- Does not answer "am I on pace?" quantitatively — only implied by trajectory

**Effort:** Medium — CSS track + node positioning + current-position dot placement

**Mobile (375px):** Vertical layout works naturally on narrow screens. Labels may need to be condensed (amount on second line). No scrolling issues if fewer than 8 milestones.

---

## Concept 3 — "Fuel Gauge" Radial Arc

**Name:** Fuel Gauge — Radial Progress Arc per Milestone

**Description:**
One large SVG arc gauge per milestone, drawn in an inline SVG (not Recharts). The arc spans roughly 240 degrees (like a speedometer). The filled portion represents progress toward the milestone. Current value label sits in the center of the arc. Below the arc: milestone label, projected date, and an "achieved" badge if complete. Multiple milestones lay out in a horizontally scrolling row on desktop, stacked vertically on mobile. The arc fill color transitions: green when achieved, cobalt when in progress, amber when less than 25% complete.

```
         ╭─────────╮
       ╱   85.3%    ╲
      │   $1.24M     │
       ╲  of $1.45M ╱
         ╰─────────╯
       ████████████░░░
      First Million Goal
      Proj. Mar '29
```

**Strengths:**
- Visually striking — no other component in Stashtrend uses radial SVG
- Percentage readout is instantly legible at center of arc
- Familiar gauge metaphor transfers from real-world mental models (car fuel, fitness rings)
- Multiple gauges in a row are visually distinctive and scannable at a glance

**Weaknesses:**
- Inline SVG requires manual arc path math (`M`, `A` commands) or a helper like d3-shape — adds non-trivial code
- With more than 4 milestones, the horizontal row scrolls off screen on desktop
- Very small percentages (under 3%) look like no progress at all — arc fill is invisible
- Achieved state is less natural — a "full" arc looks the same whether at 100% or 200%
- Does not show projected date trajectory or history visually
- Accessibility for SVG arcs requires `aria-valuenow/valuemin/valuemax` plus `title` elements inside SVG

**Effort:** Medium — inline SVG arc math, responsive row, state color logic

**Mobile (375px):** Gauges stack vertically, one per row. At 375px a single gauge takes roughly 280px width — fits comfortably.

---

## Concept 4 — "Mountain Skyline" Projection Chart

**Name:** Mountain Skyline — Investable Capital History + Projection Line

**Description:**
A new standalone Recharts `AreaChart` (not the existing TypeStackedChart) showing only investable capital over time. The left half of the chart is the historical series (cobalt area fill, solid line). At the most recent data point, a dashed projection line continues forward to retirement. Milestone amounts are horizontal `ReferenceLine` elements — but now correctly anchored to the investable capital Y-axis. Each milestone line has a custom label rendered as a small floating pill (using Recharts `content` prop or foreignObject). The "today" boundary is a vertical `ReferenceLine` separating history from projection. Achieved milestones get a green line; future milestones get amber.

```
  $3.5M ┤                           ··· Nest Egg
        │                         ·
  $2.0M ┤- - - - - - - - - - - ·    ← Fat FIRE (amber dashed)
        │                     ·
  $1.24M┤━━━━━━━━━━━━━━━━━━━━●·     ← today
        │    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  $1.0M ┤━━━━━━━━━━━━━━━━━━━━━━━━━━ ← First Million (green, achieved)
        │    ▓▓▓▓▓▓▓▓▓▓
  $500K ┤━━━━━━━━━━━━━━━━━━━━━━━━━━ ← Half-Mil (green, achieved)
        │  ▓▓▓▓▓
        └────────────────────────────
        2020    2024    2028    2031
              ↑today
```

**Strengths:**
- Shows the actual growth trajectory — users can see acceleration or stagnation
- Projection line makes "when will I get there?" visually intuitive (line-milestone intersection)
- Historical achievement dates are visible as the chart crosses each milestone line
- Closest to what best-in-class financial apps (Empower, Wealthfront) show
- `mergeHistoryWithProjection()` already exists and handles the data merge

**Weaknesses:**
- Recharts `ReferenceLine` label collision problems are well-documented and severe with multiple close milestones
- Adding a third chart to the Net Worth page increases scroll length significantly
- Y-axis domain must accommodate the highest milestone, which may dwarf current progress visually
- Projection requires `expected_return_pct` — EC-6 (not set) degrades to history-only, which needs a graceful empty state
- Does not answer "am I on pace?" as clearly as a badge — users must infer it from whether the projection line reaches the nest egg before the retirement year marker

**Effort:** Medium-High — new Recharts component + projection data merge + custom label component to avoid collision bugs + dual-series (history/projection) rendering

**Mobile (375px):** Chart degrades gracefully — Recharts ResponsiveContainer handles width. Labels may need to abbreviate milestone names to avoid overflow. Tick count reduces.

---

## Concept 5 — "Achievement Shelf" Badge Grid

**Name:** Achievement Shelf — Game-Style Milestone Badges

**Description:**
A horizontal shelf of achievement badges rendered as circular or hexagonal icons. Achieved badges are fully colored with a glow and an icon inside (e.g., a star, a mountain peak, a rocket). Unachieved badges are desaturated/ghosted with a lock icon. Hovering or focusing a badge expands a tooltip-style popover showing the dollar target, current progress %, and projected date. The shelf has a fixed height and scrolls horizontally if milestones exceed the viewport. Optionally: a thin progress track runs behind all badges indicating the overall journey from $0 to nest egg.

```
  ┌────────────────────────────────────────────────────┐
  │                  YOUR ACHIEVEMENTS                  │
  │                                                     │
  │   ★★★★      ★★★★      ░░░░      ░░░░      ░░░░   │
  │  ╔══════╗  ╔══════╗  ╔══════╗  ╔══════╗  ╔══════╗ │
  │  ║  ★   ║  ║  ★   ║  ║  🔒  ║  ║  🔒  ║  ║  🔒  ║ │
  │  ╚══════╝  ╚══════╝  ╚══════╝  ╚══════╝  ╚══════╝ │
  │  Half-Mil  First M.  Fat FIRE  DoubleM.  Nest Egg  │
  │   ✓ Done   ✓ Done   62% done  — — —     — — —     │
  └────────────────────────────────────────────────────┘
         hover/focus badge → popover with detail
```

**Strengths:**
- Highly engaging — the "achievement unlocked" mental model creates emotional satisfaction for completed milestones
- At a glance: achieved (colored) vs future (ghosted) is instantly clear
- Compact horizontal layout — takes less vertical space than card grid
- Works well for users who have set many milestones (scrolls rather than stacking)
- Gamification increases motivation to keep contributing — aligns with behavioral finance goals

**Weaknesses:**
- Detail (projected date, exact percentage) requires hover/focus — not immediately visible, fails on touch without interaction
- Horizontal scroll is awkward on desktop with a mouse (requires shift-scroll or drag)
- Badge iconography needs design decisions for each milestone state — medium design effort
- The "62% done" label inside a small badge is cramped at 375px
- Accessibility: popover pattern requires careful ARIA (role="tooltip" or role="dialog") and keyboard trigger

**Effort:** Medium — badge rendering is simple; popover pattern requires careful implementation and accessibility work

**Mobile (375px):** Horizontal scroll row still works but shift-to-vertical on mobile is more accessible. Two badges per row with labels below them is a viable mobile fallback.

---

## Concept 6 — "Runway to Liftoff" Staircase Progress

**Name:** Runway to Liftoff — Stepped Progress Staircase

**Description:**
A horizontal staircase graphic where each step represents a milestone, ascending left-to-right. The steps are sized proportionally to the dollar gap between each milestone (or normalized if gaps are too extreme). The current investable capital fills the stairs from the bottom-left like rising water — green for achieved steps, cobalt for the current partially-filled step. Each step is labeled with the milestone name and amount above it. The "nest egg" is the final step with a small plane/rocket icon at the top right. The percentage completion of the current step is shown as a fill level within that step.

```
                                          ✈ Nest Egg
                             ┌────────────┐  $3.2M
                             │            │
                  ┌──────────┘ ← current │
                  │  61%        step fill │
       ┌──────────┘                       │
       │ ████████████████████████████████ │ ← achieved (green fill)
  ─────┘                                  └──────
  $0    $500K    $1M       $2M         $3.2M
  ▓▓▓▓▓ Half-Mil First M.   Fat FIRE    Nest Egg
```

**Strengths:**
- Journey metaphor is clear — you can see how far you've climbed
- Proportional step widths communicate that some milestones are farther apart than others
- The "rising water" fill metaphor is visually intuitive and satisfying
- Compact — the entire staircase fits in a fixed-height band (~160px)

**Weaknesses:**
- If milestone gaps are wildly disproportionate (e.g., $500K, $1M, $50M), the first steps look tiny compared to the final step — proportional layout breaks down
- With many milestones (8+), step labels overlap — needs rotation or hover-only labels
- The fill metaphor is CSS-intensive — each step needs independent clip-path or width math
- Does not explicitly state projected dates — they'd need to be in a hover tooltip or separate label
- Visual metaphor may read as "bar chart" rather than staircase at a glance if steps are narrow

**Effort:** Medium — CSS geometry for staircase steps, fill-level math, proportional width calculation

**Mobile (375px):** Horizontal staircase becomes very cramped at 375px. Needs to collapse to a vertical card list or a simplified single progress bar with milestone markers on a horizontal track. Significant responsive engineering required.

---

## Concept 7 — "Twin Lines" Dual-Timeline Chart

**Name:** Twin Lines — History vs Projection Comparison Chart

**Description:**
A compact Recharts `LineChart` (no area fill, no stacking) showing two lines: the actual investable capital history (solid cobalt) and a projected future trajectory (dashed lighter cobalt or white). Milestone thresholds appear as horizontal reference bands — thin filled rectangles spanning the full width of the chart rather than a single pixel line, which avoids label collision by labeling the band at the left edge in a fixed-width column. The "today" line separates historical from projected. Achieved milestones have a green band; future have an amber band. The chart is intentionally narrow — 240px tall — so it doesn't crowd the page.

```
  ╔════════════════════════════════════════════╗
  ║ LABEL COL  │   chart area                 ║
  ║────────────┼──────────────────────────────║
  ║ Nest Egg   │··· ··· ··· ···               ║  ← amber band
  ║ $3.2M      │                     ·········║
  ║────────────┼──────────────────────────────║
  ║ Fat FIRE   │·· ·· · ·                     ║  ← amber band
  ║ $2.0M      │          ················   ║
  ║────────────┼──────────────────────────────║
  ║ First M.   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    ║  ← green band (achieved)
  ║ $1.0M      │                              ║
  ║────────────┼──────────────────────────────║
  ║ Half-Mil   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ║  ← green band (achieved)
  ║ $500K      │                              ║
  ╚════════════╧══════════════════════════════╝
               2020   2024 ↑ 2028   2031
                         today
```

**Strengths:**
- Reference bands (not lines) eliminate the label-collision problem entirely — labels live in a fixed sidebar column, not inside the SVG
- Shows both the historical trajectory and the forward projection on one chart
- The band approach makes milestone intersections visually obvious — the trajectory line crossing a band is a clear event
- Relatively compact at 240px height — does not dominate the page
- Projection-vs-history dual view directly answers "am I on pace?" — users see if the dashed line reaches the nest egg band before the retirement year marker

**Weaknesses:**
- The fixed label column approach requires a custom layout wrapper (CSS grid or flex) outside Recharts, since Recharts cannot render HTML in the SVG margin
- Multiple reference bands with different heights and colors inside a Recharts SVG require custom `<ReferenceArea>` components, which have their own documented quirks in v2.x
- Line chart without area fill may feel less visually rich than the stacked area chart already on the page
- Achieves sophisticated information density but requires medium Recharts expertise to implement cleanly

**Effort:** Medium-High — custom label column layout, ReferenceArea components, dual-series (history + projection) data merge

**Mobile (375px):** Label column collapses — milestone labels move to chart interior as small right-aligned tags, or convert to abbreviated codes. The chart narrows but Recharts ResponsiveContainer handles width automatically.

---

## Concept 8 — "Distance to Summit" Next-Only Focus Card

**Name:** Distance to Summit — Single Next-Milestone Hero Card

**Description:**
Rather than showing all milestones simultaneously, this concept focuses entirely on the single most important milestone: the next unachieved one. A large hero card with a prominent circular progress ring (pure CSS, no SVG path math), current dollar amount, target amount, percentage, and projected date. A horizontal strip below the ring shows completed milestones as small green pills and future milestones as ghost pills. Tapping/clicking the strip or a chevron button cycles which milestone is the "hero" — allowing the user to inspect any milestone by clicking through. The nest egg target is the final milestone in the strip.

```
  ┌────────────────────────────────────────────────────┐
  │                  NEXT MILESTONE                    │
  │                                                    │
  │             ╭───────────────╮                      │
  │           ╱   Fat FIRE        ╲                    │
  │          │                     │                   │
  │          │     $1.24M          │                   │
  │          │     of $2.0M        │                   │
  │          │      62%            │                   │
  │           ╲                   ╱                    │
  │             ╰───────────────╯                      │
  │         Projected: March 2029                      │
  │                                                    │
  │  ● Half-Mil  ● First M.  ○ Fat FIRE  ○ Nest Egg  │
  │     $500K      $1M      $2M (you are here) $3.2M  │
  └────────────────────────────────────────────────────┘
```

**Strengths:**
- Maximum focus — one milestone at a time means no label clutter, no cramped layout
- Large type for percentage and amounts is easy to read on mobile and desktop
- The strip at the bottom still shows all milestones and allows navigation
- Very mobile-friendly — the hero layout scales to any screen width
- The "next milestone" framing creates forward momentum — always points to the next target
- CSS-only progress ring (using `conic-gradient` or `stroke-dasharray` on a CSS circle) avoids any SVG path complexity

**Weaknesses:**
- Only one milestone visible at a time — users who want to compare all milestones must click through, which adds interaction cost
- "Next milestone" focus misses the "what have I passed?" question unless the strip is noticed
- The cycling interaction may be non-obvious to first-time users without an explicit affordance
- If the user has only 1 milestone, the strip is a single pill — the interaction pattern is pointless

**Effort:** Low-Medium — CSS conic-gradient ring, pill strip, click-to-cycle state (a single `focusedIndex` state variable)

**Mobile (375px):** Works excellently — the hero card fills the screen width, ring scales proportionally, pill strip scrolls horizontally if needed. Best mobile experience of all concepts.

---

## Summary Comparison

| Concept | Answers All 5 Qs | Mobile | Effort | Recharts | Unique Strength |
|---------|-----------------|--------|--------|----------|-----------------|
| 1. Stack of Flags (Cards) | Yes | Excellent | Low | No | Most direct, accessible |
| 2. Summit Climb (Timeline) | Mostly | Good | Medium | No | Journey metaphor, spatial |
| 3. Fuel Gauge (Arc) | Partially | Good | Medium | No | Visually bold, familiar |
| 4. Mountain Skyline (Chart) | Yes | Moderate | Medium-High | Yes | Historical trajectory |
| 5. Achievement Shelf (Badges) | Via hover | Moderate | Medium | No | Engagement, gamification |
| 6. Runway Staircase | Partially | Poor | Medium | No | Proportional distances |
| 7. Twin Lines (Dual Chart) | Yes | Moderate | Medium-High | Yes | Best information density |
| 8. Distance to Summit (Hero) | Yes | Excellent | Low-Medium | No | Focus, mobile-first |

---

## Designer Recommendation

Two concepts stand out as strongest candidates for the architect to evaluate:

**Concept 1 (Stack of Flags / Cards)** is the safest, most complete, and lowest-effort path. It answers every success criterion directly, integrates with the existing card-based design language, and handles all edge cases without special-casing. It is the right default recommendation.

**Concept 8 (Distance to Summit / Hero Card)** is the highest UX quality per line of code on mobile. The single-focus ring with a pill strip navigation is the most visually distinctive option and requires no Recharts. It slightly loses on "compare all milestones at once" but gains on focus and mobile readability.

**A hybrid of Concepts 1 and 8** — a hero card for the next milestone on top, then a compact strip of achieved milestones below, then future milestones as smaller cards — may capture the best of both. This is a deferred design decision for the architect.

Concepts 4 and 7 are compelling if the product direction is toward showing investment trajectory visually, but Recharts label management adds engineering risk and page length concern.

Concepts 3, 5, and 6 are higher-effort for lower coverage of the information requirements. Recommend deferring.
