# Phase 4: Forecasting Page — Design Specification

**Date:** 2026-03-09
**Author:** Frontend Designer Agent
**Inputs:** phase4-requirements.md, phase4-research.md, phase4-architecture.md

---

## Page Layout

### Desktop (>= 1024px)

```
┌─────────────────────────────────────────────────────────────┐
│  Page Header                                                 │
│  ┌─────────────────────────────────────────────┐  ┌───────┐ │
│  │ h1: Forecasting                             │  │Refresh│ │
│  └─────────────────────────────────────────────┘  └───────┘ │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ForecastingControls                                   │   │
│  │                                                        │   │
│  │ Monthly Contribution          Expected Annual Return   │   │
│  │ [$2,000 ] ════════════●═══    [7.0%  ] ═══●═══════    │   │
│  │                                                        │   │
│  │ [Reset to saved]  [Save as defaults]                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ForecastingChart                            [Range]   │   │
│  │                                                        │   │
│  │         ╱ · · · · · · · · · +10%                      │   │
│  │       ╱ - - - - - - - - - - Baseline                  │   │
│  │     ╱ · · · · · · · · · · · -10%                      │   │
│  │ ──╱                                                    │   │
│  │ Historical                   Projected                 │   │
│  │                                                        │   │
│  │ ■ Historical  --- Baseline  ··· +10%  ··· -10%        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ Current    │ │ Projected │ │ Nest Egg  │ │ Gap       │   │
│  │ Investable │ │ @ Age 65  │ │ Needed    │ │ Analysis  │   │
│  │ $425,000   │ │ $1,850,000│ │ $1,500,000│ │ $350K     │   │
│  │            │ │           │ │           │ │ ahead ✓   │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Tablet (768–1023px)

Same layout as desktop but summary cards wrap to 2x2 grid. Chart height reduced.

### Mobile (< 768px)

```
┌─────────────────────────────┐
│ h1: Forecasting     [Refresh]│
├─────────────────────────────┤
│ Monthly Contribution         │
│ [$2,000 ] ═══════●══════    │
│                              │
│ Expected Annual Return       │
│ [7.0%  ] ════●═══════       │
│                              │
│ [Reset]  [Save as defaults]  │
├─────────────────────────────┤
│                              │
│    Projection Chart          │
│    (220px height)            │
│    [Range selector]          │
│                              │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Current Investable      │ │
│ │ $425,000                │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Projected @ Age 65      │ │
│ │ $1,850,000              │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Nest Egg Needed         │ │
│ │ $1,500,000              │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ $350K ahead of target ✓ │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## Component Designs

### 1. ForecastingControls

**Container:** `--bg-card` background, `--radius-lg` corners, `--shadow-sm` elevation, `--sp-6` padding.

**Slider row (desktop):** Two sliders side by side in a CSS grid `grid-template-columns: 1fr 1fr` with `--sp-8` gap.

**Each slider group:**
```
Label (--text-secondary, 13px, font-weight 500)
┌─────────────────────────────────────────┐
│  [$2,000   ]  (number input, inline)    │
│  ═══════════════●═══════════════════    │  (range slider)
│  $0                          $50,000    │  (min/max labels, --text-muted, 11px)
└─────────────────────────────────────────┘
```

**Number input:** `--bg-inset` background, `--border` border, `--radius-sm` corners, `--text-primary` text, 14px. Width: 100px. Right-aligned text.

**Range slider (custom styling):**
- Track: 4px height, `--bg-raised` background, `--radius-pill` corners
- Filled portion: `--accent` (#4D9FFF)
- Thumb: 18px circle, `--accent` fill, `--shadow-sm` shadow, 2px white border
- Mobile: thumb 24px for touch targets

**Button row:** Right-aligned, `--sp-4` gap.
- "Reset to saved": ghost button — `--text-secondary` text, `--border` border, `--radius-sm`
- "Save as defaults": primary button — `--accent` background, `--text-primary` text, `--radius-sm`

**States:**
- Slider hover: thumb grows to 20px with `--ease-quick` transition
- Slider active/dragging: thumb has `--accent` glow ring (box-shadow)
- Save button loading: "Saving..." text, `opacity: 0.7`, `pointer-events: none`
- Save success: brief green flash on button text ("Saved!") for 2 seconds

---

### 2. ForecastingChart

**Container:** `--bg-card` background, `--radius-lg` corners, `--shadow-sm`.

**Header:** Chart title "Portfolio Projection" left-aligned + `RangeSelector` right-aligned. Match `TypeStackedChart` header pattern.

**Chart dimensions:**
- Desktop: 380px height
- Tablet: 300px height
- Mobile: 220px height
- Y-axis width: 72px (desktop), 52px (mobile)

**Line styles:**

| Line | Color | Style | Width | Legend Label |
|------|-------|-------|-------|-------------|
| Historical | `--accent` (#4D9FFF) | Solid | 2.5px | "Historical" |
| Baseline projection | `--accent` (#4D9FFF) | Dashed `strokeDasharray="8 4"` | 2px | "Projected" |
| +10% contributions | `--green` (#2ECC8A) | Dotted `strokeDasharray="3 3"` | 1.5px | "+10% contrib." |
| -10% contributions | `--amber` (#F5A623) | Dotted `strokeDasharray="3 3"` | 1.5px | "-10% contrib." |

**Transition point:** Where historical meets projection, draw a subtle vertical dashed line in `--text-muted` (#4A6080) with label "Today" at the top.

**Retirement age marker:** Vertical dashed line in `--amber` (#F5A623) at the target retirement year, label "Retire @ {age}".

**Nest egg reference line:** Horizontal dashed line at the nest egg amount in `--amber`, label with the dollar amount.

**Tooltip (CustomTooltip):**
```
┌──────────────────────────────┐
│ Mar 2045                      │  (--text-muted, 12px)
│ Historical:     $425,000      │  (COLOR_ACCENT)
│ Projected:      $1,200,000    │  (COLOR_ACCENT, if date > today)
│ +10% contrib:   $1,350,000    │  (COLOR_POSITIVE)
│ -10% contrib:   $1,080,000    │  (COLOR_AMBER)
└──────────────────────────────┘
```
Background: `TOOLTIP_STYLE` from chartUtils.

**Legend:** Below chart, `iconType="line"`, `--text-secondary` color, 12px font.

**Range selector options:** Use `COMMON_RANGES` plus additional long-range options:
- 5Y, 10Y, 20Y, All (where "All" = historical + full projection)

---

### 3. ForecastingSummary

**Container:** CSS grid, 4 columns on desktop, 2 on tablet, 1 on mobile.

**Each card:**
```
┌─────────────────────────┐
│ Label                    │  (--text-secondary, 12px, uppercase, letter-spacing 0.5px)
│ $1,850,000              │  (--text-primary, 24px, font-weight 700)
│ at age 65 (2056)        │  (--text-muted, 12px) — subtitle, optional
└─────────────────────────┘
```

Card styling: `--bg-card`, `--radius-md` corners, `--sp-5` padding, `--border` border.

**Gap analysis card (special treatment):**
- On track: `--green` left border (3px), green badge text
- Off track: `--red` left border (3px), red badge text
- Badge: pill-shaped (`--radius-pill`), 11px font, bold
  - On track: `--green` bg at 15% opacity, `--green` text → "$350K ahead"
  - Off track: `--red` bg at 15% opacity, `--red` text → "Need $200K more"

**Empty state (no retirement settings):**
```
┌──────────────────────────────────────────────────┐
│ ℹ  Configure retirement settings to see your      │
│    projected retirement readiness.                 │
│    [Set up on Net Worth page →]                    │
└──────────────────────────────────────────────────┘
```
Background: `--bg-info`, border: `--border`, text: `--text-secondary`.

---

### 4. ForecastingPage

**Page header:** Matches `NetWorthPage` pattern exactly:
- `h1` left, refresh button + "Updated at {time}" right
- Uses same CSS classes / module pattern

**Loading state:** "Loading..." centered, matches existing pattern.

**Error state:** Matches `NetWorthPage` error box pattern (API connection error + troubleshooting).

**Section ordering:**
1. ForecastingControls (sliders)
2. ForecastingChart (projection chart)
3. ForecastingSummary (summary cards)

**Section spacing:** `--sp-6` gap between sections.

---

## Responsive Behavior

| Breakpoint | Controls | Chart | Summary |
|-----------|----------|-------|---------|
| Desktop (>=1024px) | 2-col grid | 380px height, 72px Y-axis | 4-col grid |
| Tablet (768-1023px) | 2-col grid | 300px height, 62px Y-axis | 2-col grid |
| Mobile (<768px) | 1-col stack | 220px height, 52px Y-axis | 1-col stack |

**Slider mobile treatment:**
- Full-width sliders (no side-by-side)
- Number input above the slider, right-aligned
- Thumb: 24px diameter (touch-friendly)
- Track: 6px height (easier to hit)

**Buttons mobile:** Full-width, stacked vertically with `--sp-3` gap.

---

## Interaction States

### Slider Interaction
1. **Default:** Populated from retirement settings
2. **Dragging:** Chart updates in real-time (no debounce needed per architecture)
3. **Manual number entry:** Same real-time update
4. **Reset:** Animate slider back to saved position (use `--ease-smooth`)

### Save as Defaults
1. Click "Save as defaults"
2. Button shows "Saving..." (disabled)
3. POST to `/api/retirement` with merged settings
4. Success: Button briefly shows "Saved!" in green for 2s, then reverts
5. Error: Show error toast below buttons in `--bg-error` with `--red` text

### Loading
1. Page mount → show loading spinner/text
2. Parallel fetch: `/api/retirement` + `/api/networth/by-type`
3. Both resolve → render all sections
4. If retirement settings don't exist → show controls with defaults + empty state for summary

---

## Tokens Used

| Token | Usage |
|-------|-------|
| `--bg-card` | Card backgrounds (controls, chart, summary) |
| `--bg-inset` | Number input backgrounds |
| `--bg-raised` | Slider track background |
| `--bg-info` | Empty state info box |
| `--text-primary` | Values, headings |
| `--text-secondary` | Labels, legend |
| `--text-muted` | Subtitles, min/max labels |
| `--accent` | Slider fill, primary button, chart accent line |
| `--green` | On-track state, +10% line |
| `--red` | Off-track state |
| `--amber` | -10% line, retirement marker |
| `--border` | Card borders, input borders |
| `--radius-sm` through `--radius-lg` | Component corners |
| `--sp-3` through `--sp-8` | Spacing |
| `--shadow-sm` | Card elevation |
| `--ease-quick`, `--ease-smooth` | Transitions |

---

## Accessibility

- Sliders: `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-label`
- Number inputs: linked `<label>` elements
- Chart: `aria-label="Portfolio projection chart"`
- Summary cards: semantic `<dl>` (description list) or labeled `<div>`s
- Gap analysis badge: `aria-live="polite"` for screen reader updates when sliders change
- Color is not the only differentiator — line styles (solid/dashed/dotted) also distinguish series
- Minimum 4.5:1 contrast ratio on all text (verified against `--bg-card`)
