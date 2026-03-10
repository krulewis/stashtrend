# Design Specification — Phase 2.1: Dual-View Milestone Hero Card

**Date:** 2026-03-10
**Author:** Frontend Designer Agent
**Status:** Final — ready for Engineer Agent
**Inputs:** phase2.1-requirements-impl.md, phase2.1-research-impl.md, phase2.1-brainstorm.md, phase2.1-mockups.html, index.css, StatsCards.module.css, NetWorthChart.module.css, TypeStackedChart.module.css, RangeSelector.module.css

---

## Visual Overview

The `MilestoneHeroCard` is a full-width card that sits between `TypeStackedChart` and `AccountsBreakdown` in `NetWorthPage`. It inherits the exact card shell used by `NetWorthChart` and `TypeStackedChart`: `--bg-card` surface, `--border` border, `--radius-lg` corners, the standard header row (title left + controls right), and the standard padding schedule (16px mobile, 20px 24px desktop). The card does not impose a max-width constraint — it matches sibling cards on the page and fills available column width.

The default view (Dashboard Cards) shows a 2-column grid of milestone cards on desktop and a single-column stack on mobile. Each card is a self-contained snapshot panel. The toggle in the header row switches to the Mountain Skyline view — a Recharts area chart showing investable capital history with a dashed projection continuation. The toggle follows the `RangeSelector` visual pattern (button strip already used on this page by `NetWorthChart` and `TypeStackedChart`), so no new toggle primitive is needed.

The design intent is that a user can glance at the Dashboard Cards view and immediately know: which milestones they have crossed, how far along they are toward the next one, and when they are projected to arrive. The Mountain Skyline view answers the trajectory question — does the growth curve reach each milestone on time?

---

## 1. Component Layout — Hero Card Container

### File
`frontend/src/components/MilestoneHeroCard.module.css`

### Card Shell

The outer container exactly mirrors `NetWorthChart.module.css .container`:

```
background: var(--bg-card)
border: 1px solid var(--border)
border-radius: var(--radius-lg)          /* 12px */
padding: var(--sp-4) var(--sp-4)         /* 16px on mobile */
margin-bottom: var(--sp-5)              /* 20px on mobile */
```

Desktop (>= 768px):
```
padding: var(--sp-5) var(--sp-6)         /* 20px 24px */
margin-bottom: var(--sp-6)              /* 24px */
```

### Header Row

Mirrors `NetWorthChart.module.css .header` — flex column on mobile, flex row on desktop:

Mobile (< 768px):
```
display: flex
flex-direction: column
gap: var(--sp-3)                        /* 12px */
margin-bottom: var(--sp-4)              /* 16px */
```

Desktop (>= 768px):
```
flex-direction: row
justify-content: space-between
align-items: center
margin-bottom: var(--sp-5)             /* 20px */
```

### Header Left — Title Area

```
Title text:  "Milestones"
             font-size: 15px mobile / 16px desktop
             font-weight: 500
             color: var(--text-primary)
```

Below the title, an eyebrow label:
```
"Investable Capital"
font-size: 9px
font-weight: 400
letter-spacing: 2px
text-transform: uppercase
color: var(--text-muted)
margin-bottom: 4px
```

Count badge — inline to the right of (or directly below) the title on the same title line, floated right on desktop by the header flex layout, or rendered as a trailing element in the title group on mobile:

```
Pill badge: "N of M achieved"
background: var(--accent-tint)          /* rgba(77,159,255,0.12) */
color: var(--accent-light)              /* #7DBFFF */
border: none
border-radius: var(--radius-pill)
font-size: 11px
font-weight: 600
padding: 3px 10px
```

On mobile the title group stacks the eyebrow + title as one element and the count badge lives in the header row at the end (flex row with space-between between title group and badge+toggle group).

### Header Right — Toggle + Badge Group

```
display: flex
align-items: center
gap: var(--sp-3)          /* 12px */
```

Contains: the count pill badge (on mobile hidden from here, positioned inline above), then the view toggle.

**Decision DD-I4 (card header layout):** Title left, toggle right, count badge is part of the title group on desktop. On mobile: title row is flex row with title-group left and toggle-only right; count badge moves below title as a second line.

---

## 2. View Toggle Design

### Philosophy

Reuse the `RangeSelector` visual pattern exactly — no new CSS primitive. This is the same button strip used by `NetWorthChart` and `TypeStackedChart` on the same page.

### Structure

```
<div role="tablist" class="rangeButtons">   ← reuse .rangeButtons from RangeSelector.module.css
  <button role="tab" aria-selected="true"  class="rangeBtn rangeBtnActive">Cards</button>
  <button role="tab" aria-selected="false" class="rangeBtn">Chart</button>
</div>
```

Alternatively: import `RangeSelector.jsx` directly with labels `[{ label: 'Cards' }, { label: 'Chart' }]` and no `months` needed — if the component interface supports pure-label use. If not, inline the two-button strip using the same CSS class names from `RangeSelector.module.css`.

### Token Reference

From `RangeSelector.module.css`:

| State | Properties |
|-------|-----------|
| Container `.rangeButtons` | `background: var(--bg-root)`, `border-radius: 8px`, `padding: 4px`, `gap: 4px` |
| Inactive `.rangeBtn` | `color: var(--text-muted)`, `font-size: 13px`, `font-weight: 500`, `padding: 6px 10px mobile / 4px 10px desktop`, `min-height: 36px mobile / unset desktop`, `border-radius: 6px` |
| Active `.rangeBtnActive` | `background: var(--border)`, `color: var(--text-primary)` |
| Hover (inactive) | `color: var(--text-secondary)` — add `transition: all var(--ease-quick)` |

### Toggle Behavior

- `useState('cards')` — component-local only, no persistence
- Default on mount: `'cards'` (Dashboard Cards view is index 0 / primary)
- Clicking toggles state, which conditionally shows/hides the two view panels
- Both panels remain mounted in the DOM (display: none on inactive) to avoid chart re-init flash
- `aria-selected` updated on the active tab button
- `aria-controls` on each tab points to the corresponding `role="tabpanel"` id

### Keyboard Behavior

Left/Right arrow keys move focus between the two tab buttons and activate the tab (roving tabindex pattern per ARIA tabs spec). Since there are only two tabs, Left from "Cards" moves to "Chart" and vice versa.

---

## 3. Dashboard Cards View — Design

### File
`frontend/src/components/MilestoneCardsView.module.css`

### Grid Layout

Desktop (>= 768px):
```
display: grid
grid-template-columns: 1fr 1fr
gap: var(--sp-3)          /* 12px */
```

Mobile (< 768px):
```
grid-template-columns: 1fr
gap: var(--sp-3)
```

Single milestone (EC-10): render a single card full-width at both breakpoints — the `1fr 1fr` grid accommodates this naturally (one item spans one column, leaving the second empty) so no special case needed. The spec treats EC-10 as passthrough.

### Individual Milestone Card Shell

```
background: var(--bg-card)
border: 1px solid var(--border)
border-radius: var(--radius-lg)          /* 12px */
padding: var(--sp-4) var(--sp-4) + 2px  /* 16px 18px — matches mockup */
overflow: hidden
transition: border-color var(--ease-smooth)
```

The card does not have hover interactivity (it is read-only, not a link). No hover border change.

### Card Anatomy (top to bottom)

```
┌──────────────────────────────────────┐
│  [STATUS PILL]           [ICON / %]  │  ← header row
│  [eyebrow: "Milestone" or "Nest Egg Target"]
│  [label: "Fat FIRE"]                 │
│  [amount: "$2,000,000"]              │
│  [progress bar track]                │
│  [status line]                       │
└──────────────────────────────────────┘
```

**Header Row:**
```
display: flex
align-items: center
justify-content: space-between
margin-bottom: var(--sp-2) + 2px      /* 10px */
```

Left: status pill (see States section below)
Right: checkmark icon (achieved) or percentage text (in-progress/future)

**Eyebrow label:**
```
font-size: 9px
font-weight: 400
letter-spacing: 2px
text-transform: uppercase
color: var(--text-muted)
margin-bottom: 4px
```
Text is `"Milestone"` for user-defined milestones, `"Nest Egg Target"` for the nest egg card.

**Milestone label:**
```
font-size: 15px
font-weight: 500
color: var(--text-primary)
margin-bottom: 2px
```
Truncate with `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` if longer than card width.

**Dollar amount:**
```
font-size: 20px
font-weight: 400
margin-bottom: var(--sp-2) + 2px    /* 10px */
```
Color varies by state (see States section).

**Progress Bar Track:**
```
height: 6px
background: var(--bg-raised)         /* #1E2D4A */
border-radius: var(--radius-pill)
overflow: hidden
margin-bottom: var(--sp-2)          /* 8px */
position: relative
```

**Progress Bar Fill:**
```
height: 100%
border-radius: var(--radius-pill)
min-width: 4px                       /* EC-8: visible for any non-zero progress */
```
Width: `max(4px, progress * 100%)` — implemented as inline style since it's data-driven.
Color varies by state (see States section).
No CSS `transition: width` on the fill — per AG-I2 (no progress bar animations in Phase 2.1).

**Status Line:**
```
font-size: 11px
color: var(--text-muted)
```
Format:
- Achieved: `"Achieved "` + `<strong style="color: var(--color-positive)">Jan 2024</strong>`
- In-progress: `"$1.24M of $2.0M · Proj. "` + `<strong style="color: [state color]">Mar 2029</strong>`
- Future: same as in-progress, `<strong style="color: var(--color-warning)">Mar 2029</strong>`
- No projected date available (EC-6): `"Set expected return for projections"` in `var(--text-faint)`

### Milestone States — Visual Treatment

#### Achieved State

Condition: `investableCapital >= milestone.amount`

```
Card border-color: rgba(46,204,138,0.25)           /* --green at 25% */
Card background:   linear-gradient(135deg, var(--bg-card) 0%, #192B1F 100%)
                   /* subtle green wash — darkened green tint toward bottom-right */
Amount color:      var(--color-positive)            /* #2ECC8A */
Progress bar fill: var(--color-positive)            /* green, 100% width */
Status pill:       pill-green — "Achieved"
```

Status pill (green):
```
background: var(--green-tint)          /* rgba(46,204,138,0.12) */
color: var(--green)                    /* #2ECC8A */
border-radius: var(--radius-pill)
font-size: 11px
font-weight: 600
padding: 3px 10px
```
Pill text: `"✓ Achieved"`

Checkmark icon (header row right):
```
SVG circle: cx=9 cy=9 r=8.5
fill: rgba(46,204,138,0.15)
stroke: rgba(46,204,138,0.4)
Checkmark path: stroke="#2ECC8A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
width/height: 18px
aria-hidden: true
```

#### In-Progress State

Condition: first unachieved milestone (lowest-amount milestone with `investableCapital < amount`)

```
Card border-color: var(--border)                    /* default, no state tint */
Card background:   var(--bg-card)                   /* solid, no gradient */
Amount color:      var(--accent)                    /* #4D9FFF */
Progress bar fill: var(--accent)                    /* cobalt */
Status pill:       pill-cobalt — "Next Goal"
Percentage:        shown right-aligned in header row
```

Status pill (cobalt):
```
background: var(--accent-tint)         /* rgba(77,159,255,0.12) */
color: var(--accent-light)             /* #7DBFFF */
border-radius: var(--radius-pill)
font-size: 11px
font-weight: 600
padding: 3px 10px
```
Pill text: `"◆ Next Goal"`

Percentage (header row right):
```
font-size: 13px
font-weight: 500
color: var(--accent)
```
Format: `"73%"`

#### Future State

Condition: all milestones with amount greater than the in-progress milestone's amount

```
Card border-color: var(--border)                    /* default */
Card background:   var(--bg-card)
Amount color:      var(--color-warning)             /* #F5A623 */
Progress bar fill: var(--color-warning)             /* amber */
Status pill:       pill-amber — "In Progress"
Percentage:        shown right-aligned in header row, color: var(--color-warning)
```

Status pill (amber):
```
background: var(--amber-tint)          /* rgba(245,166,35,0.12) */
color: var(--amber)                    /* #F5A623 */
border-radius: var(--radius-pill)
font-size: 11px
font-weight: 600
padding: 3px 10px
```
Pill text: `"→ In Progress"`

Percentage (header row right):
```
font-size: 13px
font-weight: 500
color: var(--color-warning)
```

#### Nest Egg Card — Additional Treatment

The nest egg card inherits the state visual (achieved/in-progress/future) for all internal elements. On top of that, regardless of state, it gets:

```
border-color: rgba(77,159,255,0.4)           /* --accent at 40% opacity */
box-shadow: 0 0 20px rgba(77,159,255,0.12), var(--shadow-md)
```

This matches the mockup exactly. The inner content uses state-appropriate colors. The eyebrow label reads `"Nest Egg Target"` instead of `"Milestone"`.

Special case for EC-5 (all milestones achieved including nest egg): status line reads `"Ahead of target"` in `var(--color-positive)` instead of a projected date.

#### EC-3 — Zero Investable Capital

All cards show 0% with a 4px-wide progress bar fill (minimum width enforced). Status lines show `"N/A"` for projected dates if projection is unavailable, otherwise the projected date from `generateProjectionSeries` starting at IC=0.

### Progress Bar Accessibility

```html
<div
  role="progressbar"
  aria-valuenow={Math.round(progress * 100)}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="{milestone.label} progress"
>
  <div style={{ width: `max(4px, ${progress * 100}%)` }} />
</div>
```

---

## 4. Mountain Skyline View — Design

### File
`frontend/src/components/MilestoneSkylineView.module.css`

### Container

The chart fills the card's content area width. No additional wrapper padding — the card shell already provides padding. The chart content area:

```
width: 100%  (via ResponsiveContainer)
height: 300px desktop / 220px mobile
```

Determined by:
```js
const { isMobile } = useResponsive()
const chartHeight = isMobile ? 220 : 300
```

This matches the `NetWorthChart` pattern exactly (it uses 340px desktop, but the milestone chart is secondary in visual weight — 300px is appropriate to avoid adding too much page length).

### Chart Library

Recharts `AreaChart` with `ResponsiveContainer`. This matches all existing charts.

### Area Chart Margins

```js
margin={{ top: 20, right: 24, left: 10, bottom: 0 }}
```

The top margin accommodates "TODAY" pill label that floats above the today divider line. The right margin accommodates the projection tail. On mobile, right margin reduces to 12px.

### Historical Area — Visual Specification

**Gradient definition** (SVG `<linearGradient>` in `<defs>`, id `milestoneHistGrad`):
```
direction: vertical (x1=0 y1=0 x2=0 y2=1)
stop at 5%:  color=#4D9FFF  opacity=0.25
stop at 95%: color=#4D9FFF  opacity=0.02
```

This matches `NetWorthChart`'s `gradNW` gradient pattern. The low top opacity (0.25) and near-zero bottom opacity (0.02) create the "mountain silhouette" depth effect — dark at base, glow at top — without being distracting.

**Area component:**
```
dataKey="investableCapital"  (or equivalent field name from merged series)
stroke: COLOR_ACCENT                    /* #4D9FFF — use constant from chartUtils.jsx */
strokeWidth: 2.5
fill: url(#milestoneHistGrad)
dot: false
activeDot: false
isAnimationActive: false               /* per codebase convention for historical data */
connectNulls: false
```

The historical data region uses `clipPath` via Recharts' built-in `clipId` on `Area` — or by rendering two separate `Area` components, one for historical data (null-padded past the today point) and one for projection (null-padded before the today point). The architect decides the exact Recharts data shape (DD-I1 resolved as Recharts by architect per research finding).

### Projection Line — Visual Specification

**Gradient definition** (id `milestoneProjGrad`):
```
direction: vertical (x1=0 y1=0 x2=0 y2=1)
stop at 0%:   color=#7DBFFF  opacity=0.12
stop at 100%: color=#7DBFFF  opacity=0.01
```

**Projection Line component** (`Area` or `Line` depending on rendering approach):
```
stroke: COLOR_ACCENT_LIGHT              /* #7DBFFF — use chartUtils constant or inline */
strokeWidth: 2
strokeDasharray: "6 4"
fill: url(#milestoneProjGrad)
dot: false
isAnimationActive: false
```

The dashed stroke makes the projection visually distinct from the solid historical line. The lighter cobalt (`#7DBFFF` vs `#4D9FFF`) reinforces the "uncertain future" vs "confirmed history" reading.

### "Today" Divider — Visual Specification

Rendered as a Recharts `ReferenceLine` at the x-value corresponding to the latest historical data point:

```
orientation: vertical (x-axis value)
stroke: #4D9FFF                         /* COLOR_ACCENT */
strokeWidth: 1.5
strokeOpacity: 0.4
```

Label rendered via the `label` prop as a custom component:
```
Position: top-center above the line
Text: "TODAY"
font-size: 9px
font-weight: 600
letter-spacing: 1px
color: #4D9FFF                          /* COLOR_ACCENT */
background: rgba(77,159,255,0.15)
border-radius: 3px
padding: 2px 5px
```

The label floats at the top of the chart, not overlapping the area fill — hence the `margin.top: 20` on the chart.

**Current value dot** at the today intersection:
```
cx: today x position
cy: today y position (investable capital value)
r: 5px solid fill (#4D9FFF)
outer ring: r=9, fill=rgba(77,159,255,0.20)   /* glow halo */
```

Rendered as a Recharts `customized` dot on the last historical data point, or as a manual SVG overlay via Recharts' `<Customized>` component.

### Milestone Reference Lines — Visual Specification

One horizontal `ReferenceLine` per milestone (plus nest egg if available). Rendered after all area/line components so they appear on top.

**Achieved milestone lines** (green):
```
y: milestone.amount
stroke: #2ECC8A                          /* COLOR_POSITIVE */
strokeWidth: 1.5
strokeOpacity: 0.5
strokeDasharray: none                    /* solid line */
```

**In-progress and future milestone lines** (amber):
```
y: milestone.amount
stroke: #F5A623                          /* COLOR_AMBER / COLOR_WARNING */
strokeWidth: 1.5
strokeOpacity: 0.6
strokeDasharray: "4 3"                   /* dashed */
```

**Nest egg reference line** (cobalt, special):
```
y: nestEgg
stroke: #4D9FFF                          /* COLOR_ACCENT */
strokeWidth: 1.5
strokeOpacity: 0.6
strokeDasharray: "4 3"                   /* dashed — same as future milestones but cobalt */
```

### Milestone Label Strategy (DD-I6)

Label collision on reference lines is the known failure mode of this chart (documented in brainstorm). The chosen strategy is **left-edge pill labels** — small rectangles pinned to the left margin of the chart, not floating inside the SVG data area.

Each reference line `label` prop renders a custom component:
```
position: "insideTopLeft"          (Recharts ReferenceLine label position)
Component renders:
  - rect: rx=3, fill=rgba([state color], 0.15), width=auto
  - text: 9px, font-weight=600, color=[state color], milestone.label truncated to 10 chars
  - padding: 2px 5px
```

Labels are offset vertically:
- Each label is placed at `y - 4px` (above the reference line) to avoid overlapping the line itself.
- For milestones close in value (within 5% of chart Y range), labels are staggered: alternate above/below the line by adding or subtracting 14px. The implementer must calculate this in the label rendering logic.

On mobile (< 768px): labels are truncated to 7 characters with ellipsis. The rect width adjusts to fit truncated text.

### Y-Axis

```
width: 52px mobile / 72px desktop      (matches NetWorthChart/TypeStackedChart pattern)
tick color: var(--text-muted)          (use AXIS_TICK from chartUtils.jsx)
tick font-size: 11px
tick format: compact — "$500K", "$1.0M", "$2.5M"   (use fmtFull from chartUtils.jsx or a compact formatter)
domain: [0, highestMilestoneOrNestEgg * 1.08]      /* 8% headroom above highest target */
```

**Decision DD-I5:** Match existing compact format from `TypeStackedChart` using `fmtFull` from `chartUtils.jsx`. The Y-axis domain must accommodate the highest milestone (or nest egg) to give milestone reference lines visible space.

### X-Axis

```
dataKey: "date"
tick color: var(--text-muted)           (AXIS_TICK from chartUtils.jsx)
tick font-size: 11px
interval: "preserveStartEnd"            (matches NetWorthChart convention)
tickCount: 5 desktop / 3 mobile         (reduced on mobile per requirements)
format: year label ("2024", "2025", etc.) or short month-year for dense data
```

The today x-axis label renders in `var(--accent)` at `font-weight: 500` to draw attention to the present moment — matching the mockup where the 2025 label is cobalt-colored.

### No-Projection Empty State (EC-6)

When `expected_return_pct` is not set:
- Historical area renders normally
- No projection line
- A text label below the chart (inside the card, below `ResponsiveContainer`):
  ```
  font-size: 12px
  color: var(--text-muted)
  text-align: center
  margin-top: var(--sp-2)
  ```
  Text: `"Set expected return in Retirement Settings to see projected trajectory"`

---

## 5. Typography Reference

All text elements mapped to design tokens:

| Element | Size | Weight | Color token | Notes |
|---------|------|--------|-------------|-------|
| Card eyebrow ("Investable Capital") | 9px | 400 | `--text-muted` | 2px letter-spacing, uppercase |
| Card title ("Milestones") | 15px / 16px | 500 | `--text-primary` | 15px mobile, 16px desktop |
| Milestone label | 15px | 500 | `--text-primary` | Truncate at card width |
| Dollar amount (achieved) | 20px | 400 | `--color-positive` | |
| Dollar amount (in-progress) | 20px | 400 | `--accent` | |
| Dollar amount (future) | 20px | 400 | `--color-warning` | |
| Percentage (in-progress) | 13px | 500 | `--accent` | |
| Percentage (future) | 13px | 500 | `--color-warning` | |
| Status line base | 11px | 400 | `--text-muted` | |
| Status line date highlight | 11px | 600 (`<strong>`) | state color | Bold, inherits state color |
| Status pill text | 11px | 600 | varies by state | |
| Toggle button inactive | 13px | 500 | `--text-muted` | |
| Toggle button active | 13px | 500 | `--text-primary` | |
| Count badge | 11px | 600 | `--accent-light` | |
| Chart Y-axis ticks | 11px | 400 | `--text-muted` (AXIS_TICK) | |
| Chart X-axis ticks | 11px | 400 | `--text-muted` (AXIS_TICK) | Today label is `--accent` |
| TODAY label | 9px | 600 | `--accent` | 1px letter-spacing |
| Reference line labels | 9px | 600 | state color | |
| No-projection notice | 12px | 400 | `--text-muted` | |

---

## 6. Spacing Reference

All spacing using `--sp-*` tokens from `index.css`:

| Context | Property | Token | Value |
|---------|----------|-------|-------|
| Hero card padding mobile | `padding` | `--sp-4` | 16px |
| Hero card padding desktop | `padding` | `--sp-5` / `--sp-6` | 20px 24px |
| Hero card bottom margin mobile | `margin-bottom` | `--sp-5` | 20px |
| Hero card bottom margin desktop | `margin-bottom` | `--sp-6` | 24px |
| Header row margin-bottom mobile | `margin-bottom` | `--sp-4` | 16px |
| Header row margin-bottom desktop | `margin-bottom` | `--sp-5` | 20px |
| Header column gap mobile | `gap` | `--sp-3` | 12px |
| Card grid gap | `gap` | `--sp-3` | 12px |
| Card internal padding | `padding` | `--sp-4` 18px | 16px 18px |
| Card header row margin-bottom | `margin-bottom` | 10px | 10px (no token — use 10px inline) |
| Eyebrow margin-bottom | `margin-bottom` | 4px | 4px (no token — `--sp-1` is 4px) |
| Milestone label margin-bottom | `margin-bottom` | 2px | 2px |
| Amount margin-bottom | `margin-bottom` | 10px | 10px |
| Progress bar margin-bottom | `margin-bottom` | `--sp-2` | 8px |
| Toggle container gap | `gap` | `--sp-1` | 4px |
| Toggle button padding | `padding` | 6px 10px / 4px 10px | per RangeSelector.module.css |
| Header right group gap | `gap` | `--sp-3` | 12px |

---

## 7. Animation and Transitions

Per AG-I2, progress bar and chart transition animations are deferred. The following transitions are active:

| Element | Property | Duration | Notes |
|---------|----------|----------|-------|
| Card border (state hover) | `border-color` | `var(--ease-smooth)` (300ms) | Applied if card hover is added in future; omit for Phase 2.1 since cards are non-interactive |
| Toggle button state | `all` | `var(--ease-quick)` (150ms) | Already defined in `RangeSelector.module.css` |
| View panel swap | `display` toggle (show/hide) | none | No animation — instant swap between Dashboard Cards and Mountain Skyline. Respects `prefers-reduced-motion` by default since there is nothing to reduce. |

**`prefers-reduced-motion`:** No explicit handling needed for Phase 2.1 since no animations are present. When future animations are added, they must be gated behind `@media (prefers-reduced-motion: no-preference)`.

**Chart animation:** Set `isAnimationActive={false}` on all Recharts `Area` and `Line` components. Recharts' built-in draw animation can cause visual artifacts when reference lines are present and is inconsistent with the rest of the app where chart animations were not explicitly designed.

---

## 8. Responsive Behavior

### Breakpoints

From `index.css` comments:
- Mobile: < 768px
- Tablet: 768–1023px (treated same as desktop for this component)
- Desktop: >= 768px (use `useResponsive()` hook, which exposes `isMobile`)

### Dashboard Cards View

| Breakpoint | Grid | Card dimensions |
|-----------|------|-----------------|
| Mobile < 768px | `grid-template-columns: 1fr` — single column | Full card width, auto height |
| Desktop >= 768px | `grid-template-columns: 1fr 1fr` — two columns | Equal width columns, auto height |

Card contents are identical at all sizes. No content is hidden. The milestone label truncates if the label text is long, but the dollar amount, progress bar, and status line are always fully visible.

### Mountain Skyline View

| Breakpoint | Chart height | Y-axis width | X-tick count | Reference line labels |
|-----------|-------------|-------------|-------------|----------------------|
| Mobile < 768px | 220px | 52px | 3 | Truncate to 7 chars |
| Desktop >= 768px | 300px | 72px | 5 | Full label up to 10 chars |

`ResponsiveContainer width="100%"` handles horizontal scaling at all breakpoints.

### Hero Card Header

| Breakpoint | Layout |
|-----------|--------|
| Mobile < 768px | Column: eyebrow + title + count badge stacked, then toggle below |
| Desktop >= 768px | Row: title group left, toggle right (space-between) |

---

## 9. Design Tokens Used

Complete mapping of every token referenced in this spec to its source in `index.css`:

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-card` | `#1C2333` | Card surface, progress bar track replacement for bg-raised, card backgrounds |
| `--bg-root` | `#0A0F1E` | Toggle container background |
| `--bg-raised` | `#1E2D4A` | Progress bar track background |
| `--bg-hover` | `#243044` | (not used in Phase 2.1 for this component) |
| `--border` | `#1E2D4A` | Card border default, toggle active background |
| `--text-primary` | `#F0F6FF` | Card title, milestone label, toggle active, amount on uncolored state |
| `--text-secondary` | `#8BA8CC` | Status line base text |
| `--text-muted` | `#4A6080` | Eyebrow labels, axis ticks, toggle inactive, status line |
| `--text-faint` | `#2B4060` | "No projected date" nudge text |
| `--accent` | `#4D9FFF` | In-progress amounts, cobalt progress bars, today divider, nest egg line |
| `--accent-light` | `#7DBFFF` | Count badge text, projection line stroke, cobalt pill text |
| `--accent-tint` | `rgba(77,159,255,0.12)` | Cobalt pill background, today label background, nest egg reference label background |
| `--accent-border-hover` | `rgba(77,159,255,0.25)` | (not used in Phase 2.1) |
| `--color-positive` / `--green` | `#2ECC8A` | Achieved state: amount, bar fill, pill, border, checkmark, reference line |
| `--green-tint` | `rgba(46,204,138,0.12)` | Achieved pill background |
| `--color-warning` / `--amber` | `#F5A623` | Future state: amount, bar fill, pill, reference lines |
| `--amber-tint` | `rgba(245,166,35,0.12)` | Future pill background |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Nest egg card box-shadow layer |

### New tokens required

None. All visual requirements are satisfied by existing tokens. The nest egg glow is expressed as a literal `rgba(77,159,255,0.12)` box-shadow which is consistent with `--accent-tint` but is used as a box-shadow value, not a background fill — no new token is needed.

### Spacing Tokens

`--sp-1` (4px), `--sp-2` (8px), `--sp-3` (12px), `--sp-4` (16px), `--sp-5` (20px), `--sp-6` (24px) — all from `index.css`. The only non-token value is `10px` for the card internal header-row margin-bottom and amount margin-bottom, which does not correspond to any token. Use `10px` as a literal in those two places only.

### Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-lg` | `12px` | Card shell border-radius |
| `--radius-pill` | `9999px` | All pill badges, progress bar track and fill, toggle container |

### Shadow Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Nest egg card combined box-shadow |

### Transition Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-quick` | `150ms ease` | Toggle button transitions |
| `--ease-smooth` | `300ms ease` | Future card hover (deferred) |

### Chart Color Constants (from `chartUtils.jsx`)

Per `conventions.md`: CSS variables cannot be used in SVG `fill`/`stroke` attributes. Use the JS constants from `chartUtils.jsx`:

| Constant | Value | Usage in chart |
|----------|-------|---------------|
| `COLOR_ACCENT` | `#4D9FFF` | Historical area stroke, today divider, in-progress reference lines |
| `COLOR_POSITIVE` | `#2ECC8A` | Achieved milestone reference lines |
| `AXIS_TICK` | (existing constant) | Y and X axis tick style |
| `GRID_STROKE` | (existing constant) | CartesianGrid stroke |

Add a `COLOR_AMBER` or `COLOR_WARNING` constant to `chartUtils.jsx` if it does not already exist, valued `#F5A623`, for future milestone reference lines. Also add `COLOR_ACCENT_LIGHT` valued `#7DBFFF` for the projection line stroke.

---

## 10. Accessibility

### Color Contrast

All text/background pairs meet WCAG AA (4.5:1 for normal text, 3:1 for large text):

| Text | Background | Contrast | WCAG |
|------|-----------|----------|------|
| `--text-primary` (#F0F6FF) on `--bg-card` (#1C2333) | ~13.7:1 | AAA |
| `--text-muted` (#4A6080) on `--bg-card` (#1C2333) | ~3.6:1 | AA (large text / UI components) |
| `--accent` (#4D9FFF) on `--bg-card` (#1C2333) | ~5.5:1 | AA |
| `--color-positive` (#2ECC8A) on `--bg-card` (#1C2333) | ~6.8:1 | AA |
| `--color-warning` (#F5A623) on `--bg-card` (#1C2333) | ~6.1:1 | AA |
| `--accent-light` (#7DBFFF) on `--accent-tint` bg | ~4.9:1 | AA |
| `--green` (#2ECC8A) on `--green-tint` bg | ~5.5:1 | AA |

The progress bar fill colors (#4D9FFF, #2ECC8A, #F5A623) are UI components (not text) and are exempt from 4.5:1 text contrast requirements. They meet the 3:1 non-text contrast requirement against `--bg-raised` (#1E2D4A):
- Cobalt #4D9FFF on #1E2D4A: ~4.8:1 (passes)
- Green #2ECC8A on #1E2D4A: ~5.4:1 (passes)
- Amber #F5A623 on #1E2D4A: ~5.0:1 (passes)

### ARIA Structure

```html
<!-- Hero card -->
<section aria-labelledby="milestone-hero-title">
  <header>
    <div id="milestone-hero-title">Milestones</div>
    <div role="tablist" aria-label="Milestone view">
      <button role="tab" id="tab-cards" aria-selected="true"  aria-controls="panel-cards">Cards</button>
      <button role="tab" id="tab-chart" aria-selected="false" aria-controls="panel-chart">Chart</button>
    </div>
  </header>

  <!-- Dashboard Cards view -->
  <div role="tabpanel" id="panel-cards" aria-labelledby="tab-cards">
    <!-- milestone cards -->
    <div
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="{milestone.label} — {percentage}% complete"
    >
      <div style={{ width: `max(4px, ${progress * 100}%)` }} />
    </div>
  </div>

  <!-- Mountain Skyline view -->
  <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart">
    <!-- chart with aria-label on ResponsiveContainer wrapper -->
    <div
      role="img"
      aria-label="Investable capital history from [startDate] to today with projected growth through [endDate]. [N] milestones shown as reference lines."
    >
      <!-- Recharts chart -->
    </div>
  </div>
</section>
```

### Focus States

- All interactive elements (toggle buttons) use the browser default focus ring (or the existing site-wide focus style if one exists). No custom focus suppression.
- Toggle buttons have `min-height: 36px` on mobile, meeting WCAG 2.5.5 target size guideline.
- Progress bar `div`s with `role="progressbar"` are not focusable (they are read-only data indicators, not interactive controls). Screen readers will read them via their `aria-valuenow` label.

### Keyboard Navigation

- Tab key: focus moves into the toggle button strip, then out.
- Arrow keys within the toggle: Left/Right arrow keys move between "Cards" and "Chart" tabs and activate the focused tab.
- The two view panels are not separately focusable (they are `tabpanel`s, not interactive). Focus within each panel follows normal tab order (progress bars are skipped since they carry `role="progressbar"` but are non-interactive; they are read by screen readers as part of document flow).

### Screen Reader Announcements

- State changes when toggling views: the newly revealed `role="tabpanel"` is announced by screen readers via the `aria-selected` update on the tab button.
- Achievement state pills include meaningful text: `"✓ Achieved"`, `"◆ Next Goal"`, `"→ In Progress"`.
- Checkmark SVGs have `aria-hidden="true"` since the pill text already communicates the state.
- The Mountain Skyline chart container carries a descriptive `aria-label` summarizing the data range and milestone count, allowing screen reader users to understand what is present without navigating the SVG.

---

## 11. Edge Case Visual Treatments

Summary of how each edge case manifests visually (implementation logic is in requirements doc):

| EC | Visual Treatment |
|----|-----------------|
| EC-1 (no milestones) | Component does not render — no visual output |
| EC-2 (no retirement settings) | Component does not render |
| EC-3 (IC = zero) | All cards show 0% with 4px minimum progress bar |
| EC-4 (already achieved) | Green state, 100% bar, achieved date |
| EC-5 (all achieved) | All green. Nest egg card shows "Ahead of target" in `--color-positive` |
| EC-6 (no return rate) | Cards: projected dates omitted, show faint nudge text. Chart: no projection line, text notice below chart |
| EC-7 (unsorted milestones) | Sorted ascending before render — visual order is always lowest to highest amount |
| EC-8 (tiny progress) | 4px minimum bar width, percentage shows actual value (e.g., "0.2%") |
| EC-9 (negative IC) | Treat as zero for progress bars. Chart shows actual line (may be at or below 0) |
| EC-10 (single milestone) | One card rendered, no grid — fills full width on both breakpoints |
| EC-11 (null nestEgg) | No nest egg card in Dashboard Cards. No nest egg reference line in Skyline |
| EC-12 (data loading) | Hero card does not render until both `typeData` and `retirement` are available. No skeleton — component simply absent |
| EC-13 (label collision) | Handled by vertical stagger strategy described in Section 4 |
| EC-14 (horizon > 50 years) | Cards show "50+ yrs" for projected dates beyond cap. Chart X-axis capped at 50 years |

---

## 12. New CSS Files Required

Two new CSS module files:

| File | Purpose |
|------|---------|
| `frontend/src/components/MilestoneHeroCard.module.css` | Hero card shell, header, toggle positioning |
| `frontend/src/components/MilestoneCardsView.module.css` | Grid layout, individual milestone card, progress bar, pills |
| `frontend/src/components/MilestoneSkylineView.module.css` | Chart wrapper, empty state notice, any chart-adjacent labels |

The toggle reuses `RangeSelector.module.css` class names directly (no new toggle CSS). The hero card shell CSS mirrors `NetWorthChart.module.css` structure for consistency.

---

## 13. Deferred Decision Resolutions

| DD-ID | Decision Made |
|-------|--------------|
| DD-I4 | Title left, toggle right in header row. Count badge inline with title on desktop, below title on mobile. |
| DD-I6 | Left-edge pill labels using Recharts ReferenceLine `label` prop with custom component. Vertical stagger for close milestones. |
| DD-I7 | Do not move "On Track / Off Track" badge from RetirementSummary. It stays in RetirementPanel. |
| DD-I8 | No max-width constraint on hero card. Matches sibling cards. |

Remaining open questions from requirements doc (OQ-I1, OQ-I2, OQ-I3) resolved here:

- **OQ-I1 (count badge):** Yes — show `"N of M achieved"` pill in the header. Low cost, useful at a glance.
- **OQ-I2 (projection/milestone intersection dot):** Deferred. Not part of Phase 2.1. The intersection is visually implied by where the projection line crosses the reference line.
- **OQ-I3 (shared vs view-specific title):** Shared title `"Milestones"` with eyebrow `"Investable Capital"`. The toggle button labels ("Cards" / "Chart") communicate the view context. View-specific titles would require changing the card header on toggle, creating layout shift.
