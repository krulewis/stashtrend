# Phase 3: Investments Page — Design Specification

**Date:** 2026-03-09
**Author:** Frontend Designer Agent
**Status:** Complete — ready for engineering plan
**Depends on:** phase3-requirements.md, phase3-research.md, phase3-architecture.md

---

## Visual Overview

The Investments page extends the existing Dark Cobalt design system with two distinct views sharing a single page shell. The account dashboard (default at `/investments`) follows the established top-stats-cards + content-card stack pattern used on the Net Worth page. The holdings drill-down (`/investments/:accountId`) replaces that content with a full-bleed detail view: a compact account header, a two-column layout of a sortable table and a donut chart on desktop, collapsing to a stacked single-column on mobile.

The page should feel like a natural neighbor of the Net Worth page — same header pattern, same card surfaces, same font scale. The only new visual paradigm is the donut allocation chart (no existing component to reference), the sortable table column headers with sort indicators, and the stale-data warning system.

All color decisions use existing tokens. No new tokens are required. No hardcoded hex values appear in CSS Modules (recharts SVG attributes use constants from `chartUtils.jsx` per convention).

---

## Page Layout

### Desktop (≥ 768px)

Both views render inside the standard page wrapper (`<div>` with no wrapper class beyond what the page module provides). The sidebar is always visible at desktop width. Content area width is unrestricted by this spec — it fills available space as all existing pages do.

**Dashboard view column structure:**
```
[Page Header: "Investments" title + Updated At + Refresh button]
[Summary Stats Cards — 3-column grid]
[Performance Chart card — full width]
[Investment Accounts Table card — full width]
```

**Drill-down view column structure:**
```
[Account Detail Header — full width, back link left, metrics right]
[Two-column grid: Holdings Table (left, ~60%) | Allocation Donut (right, ~40%)]
[Holdings totals row — full width, inside table card]
```

### Mobile (< 768px)

**Dashboard view:**
```
[Page Header — title only; "Updated At" hidden (matches NetWorthPage pattern)]
[Summary Stats Cards — 1-column stack (3M+ breakpoint switches to 3-col)]
[Performance Chart card — full width, reduced chart height]
[Investment Accounts Table — full width, columns simplified]
```

**Drill-down view:**
```
[Account Detail Header — condensed, back link full row top]
[Allocation Donut — full width, placed ABOVE the table on mobile]
[Holdings Table — full width, scrollable horizontally for wide columns]
```

The mobile reorder (donut above table) is intentional: the donut gives instant visual context for what kind of account this is before the user reads the rows. On desktop, the side-by-side layout puts emphasis on the table.

### Breakpoints

| Breakpoint | Behavior |
|---|---|
| `< 480px` | Stats cards: 1-column stack |
| `480px+` | Stats cards: 3-column grid (matches StatsCards pattern) |
| `< 600px` | Performance chart header: title above range selector (stacked) |
| `600px+` | Performance chart header: title + range selector in a row |
| `< 768px` | Drill-down: single column, donut above table |
| `768px+` | Drill-down: two-column grid; page title grows to 20px |
| `< 1024px` | Accounts table: hide "Allocation Weight" and "CAGR" columns |
| `1024px+` | Accounts table: all columns visible |

---

## Component Designs

### 1. InvestmentsPage (page shell)

**File:** `frontend/src/pages/InvestmentsPage.jsx` + `InvestmentsPage.module.css`

**Layout:** Identical to `NetWorthPage` page shell. The component reads `useParams()` to determine view mode. All state (summary data, performance data, holdings data, chart range, account toggles) lives here.

**Page Header section:**
- Structure: `pageHeader` flex row, title left, actions right
- Title: "Investments" — 18px / weight 400 / `--text-primary` / `letter-spacing: -0.3px`
- At 768px+: title grows to 20px
- Actions: "Updated at [time]" hidden on mobile, visible at 768px+ — 12px / `--text-muted`
- Refresh button: identical to `NetWorthPage` `.refreshBtn` — `--bg-card` background, `--border` border, `--text-secondary` color, 8px radius, `min-height: 38px`
- Glow pseudo-element: `pageHeader::before` radial gradient using `--accent-tint`, same spec as `NetWorthPage.module.css` (bleed out `-40px -60px` with `pointer-events: none`)

**Stale data banner (page-level):**
- Appears between page header and stats cards when ANY account has `stale_days >= 7`
- Structure: full-width banner card
- Background: `--bg-error-subtle`
- Border: `1px solid var(--border-error)`
- Border radius: `--radius-lg` (12px)
- Padding: `--sp-3` (12px) `--sp-4` (16px)
- Text: "Investment data is [N] days old." + link "Sync now" pointing to `/sync`
- Text color: `--color-warning` (`--amber`)
- Icon: "⚠" prefix
- Font size: 13px / weight 500
- Dismiss: no dismiss — disappears when data is refreshed

**Loading state (full page):**
- Text: "Loading…" centered
- Color: `--text-muted`
- Font size: 14px
- Padding: `--sp-8` (32px) top/bottom
- Matches `NetWorthPage` `.loading` class

**Error state (full page):**
- Card with `--bg-card` background, `1px solid var(--red)` border, `--radius-lg`
- Title: "Failed to load investment data" — 16px / weight 500 / `--red`
- Message: "Please try again." — 14px / `--text-secondary`
- Retry button: same visual as Refresh button but labeled "Try Again"
- Centered layout

**States summary:**
| State | Rendered content |
|---|---|
| `loading: true` | Full-page loading text (skeleton cards render within sub-components) |
| `loading: false, error: string` | Full-page error card with retry |
| `loading: false, error: null, no accounts` | Empty state (see below) |
| `loading: false, error: null, has accounts` | Dashboard or drill-down view |

**Empty state (no investment accounts):**
- Shown when API returns `accounts: []`
- Centered in page content area
- Icon: "📊" at 48px (rendered as text, not img)
- Heading: "No investment accounts found" — 16px / weight 500 / `--text-primary`
- Body: "Sync your accounts to get started." — 14px / `--text-secondary`
- Link: "Go to Sync" → `/sync` — `--accent` color, underline on hover

---

### 2. InvestmentsSummaryCards (stats cards for investment totals)

**File:** Inline section within `InvestmentsPage.jsx`, styled via `InvestmentsPage.module.css`. Follows the `StatsCards` pattern exactly — do not reuse `StatsCards.jsx` since the data fields differ, but mirror its CSS structure.

**Layout:** Same `.row` grid as `StatsCards` — `1fr` mobile, `repeat(3, 1fr)` at 480px+, gap `12px` / `16px`, `margin-bottom: 20px` / `24px`.

**Three cards:**

**Card 1 — Total Portfolio Value**
- Label: "PORTFOLIO VALUE" — 10px / uppercase / letter-spacing 2px / `--text-muted`
- Value: `fmtFull(totals.current_value)` — 24px at mobile / 28px at 768px+ / weight 400 / `--text-primary`
- Sub-row: `fmtFull(totals.total_return_dollars)` + Arrow icon + `fmtPct(totals.total_return_pct)` — 13px / color driven by sign
- Sub-label: "total return" — 12px / `--text-muted`

**Card 2 — Total Return**
- Label: "TOTAL RETURN" — same label style
- Value: `fmtFull(totals.total_return_dollars)` — same value style, color `--color-positive` if positive, `--color-negative` if negative
- When null (all cost basis missing): value shows "N/A" in `--text-muted`
- Sub-row: Arrow + `fmtPct(totals.total_return_pct)` — color driven by sign

**Card 3 — Estimated CAGR**
- Label: "EST. CAGR" — same label style; tooltip trigger "?" icon inline with label
- Value: `fmtPct(totals.cagr_pct)` — same value style, color `--color-positive` / `--color-negative` by sign
- When null (insufficient history): value shows "—" in `--text-muted`
- Tooltip content (on "?" hover): "Balance-based estimate from earliest to latest account history. Inflated by contributions." — shown as a small card tooltip (see Tooltip spec below)

**All cards:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Padding: `16px 20px` mobile / `20px 24px` at 768px+
- Border: `1px solid var(--border)`
- Hover border: `var(--accent-border-hover)` — transition `var(--ease-smooth)`

**Skeleton state (while `summary === null`):**
- Three cards rendered as shimmer blocks
- Height: 100px (matching `.skeleton` in `StatsCards.module.css`)
- Background: `linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)`
- Background size: `800px 100%`
- Animation: `shimmer 1.5s infinite`

---

### 3. InvestmentAccountsTable

**File:** `frontend/src/components/InvestmentAccountsTable.jsx` + `InvestmentAccountsTable.module.css`

**Purpose:** The main account list on the dashboard view. A semantic `<table>` element with sortable column headers and clickable rows.

**Container:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px` mobile / `20px 24px` at 768px+
- Title "Investment Accounts": 15px / weight 500 / `--text-primary` / `margin-bottom: 16px`

**Table structure:**
- `<table>` element with `width: 100%`, `border-collapse: collapse`
- `<thead>` with `<tr>` of `<th scope="col">` elements
- `<tbody>` with `<tr>` per account (plus bucket group headers)
- `<tfoot>` with a totals row

**Column definitions:**

| Column | Mobile | Tablet (768px+) | Desktop (1024px+) | Alignment |
|---|---|---|---|---|
| Account Name + Institution | Visible | Visible | Visible | Left |
| Current Value | Visible | Visible | Visible | Right |
| Total Return ($) | Hidden | Visible | Visible | Right |
| Total Return (%) | Visible | Visible | Visible | Right |
| Est. CAGR | Hidden | Hidden | Visible | Right |
| Allocation Weight | Hidden | Hidden | Visible | Right |
| Holdings Count | Hidden | Visible | Visible | Right (center on desktop) |

**Column header styles:**
- Font: 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted`
- Padding: `8px 12px` first/last, `8px` inner columns
- `border-bottom: 1px solid var(--border)`
- Sortable columns: cursor pointer, hover color `--text-secondary`
- Sort icon: inline after label — up arrow (▲) for ascending, down arrow (▼) for descending, neutral double-arrow (⇅) for unsorted
- `aria-sort="ascending"` / `"descending"` / `"none"` on each sortable `<th>`

**Bucket group header rows:**
- Rendered as a `<tr>` spanning all columns above each bucket group (Retirement / Brokerage)
- Background: `--bg-root`
- Cell: `colspan` full width, padding `6px 12px`, font 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted`
- No border

**Account rows:**
- Background: transparent (inherits `--bg-card`)
- `border-bottom: 1px solid var(--border-sub)`
- Min height: 48px (enforced via `padding: 12px`)
- Hover: `background: var(--bg-hover)`, cursor: pointer
- Transition: `background var(--ease-quick)`
- Focus (keyboard): `outline: 2px solid var(--border-focus)`, `outline-offset: -2px`
- Clicking a row navigates to `/investments/:accountId`

**Account Name cell:**
- Primary line: account name — 14px / weight 500 / `--text-primary`
- Secondary line: institution name — 12px / weight 400 / `--text-muted`
- Stacked vertically with 2px gap
- Max width: truncate with `text-overflow: ellipsis` if wider than container

**Numeric cells:**
- Font size: 13px / weight 400
- Default color: `--text-primary`
- Current value: always `--text-primary`
- Return ($): `--color-positive` if positive, `--color-negative` if negative; prefix with "+" for positive — uses `fmtFull()` with sign logic
- Return (%): `--color-positive` / `--color-negative` — uses `fmtPct()`; Arrow component (▲/▼) prepended
- CAGR: `--text-secondary`, "N/A" in `--text-muted` when null, "Insufficient data" in `--text-muted` when < 30 days
- Allocation weight: `--text-secondary`, `fmtPct()` without sign prefix
- Holdings count: `--text-muted`, plain integer

**N/A and null display:**
- All null/unavailable numeric cells show "—" (em dash) in `--text-muted`
- "N/A" (explicit unavailability) in `--text-muted`

**Stale data badge (per row):**
- Appears in account name cell as a badge below the institution line
- Shown when `is_stale: true` (> 24 hours) and `stale_days < 7`
- Background: `--color-warning` at 15% opacity (`rgba(245, 166, 35, 0.15)`)
- Border: `1px solid rgba(245, 166, 35, 0.3)`
- Text: "Synced [N]d ago" — 10px / weight 500 / `--color-warning`
- Border radius: `--radius-pill`
- Padding: `2px 8px`
- When `stale_days >= 7`, the per-row badge is replaced by the page-level warning banner

**Totals row (tfoot):**
- Background: `--bg-raised` (slightly elevated)
- `border-top: 1px solid var(--border)`
- First cell: "Total" — 13px / weight 500 / `--text-secondary`
- Numeric cells: same color logic as body rows but weight 500

**Empty tbody:**
- Single row spanning all columns
- Content: "No investment accounts to display." — 14px / `--text-muted` / centered
- Height: 80px

**Skeleton state:**
- 4 shimmer rows in `<tbody>` while loading
- Each row: height 48px, `linear-gradient` shimmer on a `--bg-hover` base
- Column cells shimmer individually (not full-row) — use `<td>` with inner shimmer `<div>` at varying widths to avoid identical-looking rows

**Sorting behavior:**
- Default sort: current value descending
- Click column header to toggle asc/desc on that column
- Only one column sorted at a time
- Sort state is local to `InvestmentAccountsTable` (client-side, no API)

**Accessibility:**
- `<table>` with `aria-label="Investment accounts"`
- `<caption>` visually hidden: "Investment accounts sorted by [column] [direction]" — updates on sort change
- Sortable `<th>` elements: `role="columnheader"`, `tabIndex="0"`, `onKeyDown` for Enter/Space to activate sort
- Clickable rows: `<tr tabIndex="0" role="row" aria-label="[Account name], [value]. Click to view holdings."` — activated by Enter/Space key

---

### 4. InvestmentPerformanceChart

**File:** `frontend/src/components/InvestmentPerformanceChart.jsx` + `InvestmentPerformanceChart.module.css`

**Purpose:** Multi-account performance line chart with optional contribution bar overlay and a Y-axis toggle ($ vs. %).

**Container:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px` mobile / `20px 24px` at 768px+
- Margin-bottom: `--sp-5` (20px) between this card and the table card

**Header row:**
- Flex row at 600px+, stacked column below 600px
- Gap between elements: `--sp-3` (12px)
- Left: Section title "Performance" — 15px / weight 500 / `--text-primary`; at 768px+: 16px
- Right: `RangeSelector` component using ranges `['3M', '6M', '1Y', '3Y', '5Y', 'All']`
  - Note: the standard `COMMON_RANGES` has `2Y` not `3Y/5Y`. A custom ranges array is passed to `RangeSelector` for investments: `[{label:'3M',months:3}, {label:'6M',months:6}, {label:'1Y',months:12}, {label:'3Y',months:36}, {label:'5Y',months:60}, {label:'All',months:null}]`

**Y-axis mode toggle:**
- Placed between the header row and the chips row
- A simple two-button toggle: "$ Value" | "% Change"
- Active button: `background: var(--bg-raised)`, `color: var(--text-primary)`, `border-color: var(--border)`
- Inactive button: `background: transparent`, `color: var(--text-muted)`
- Button style: 13px / weight 500, `border: 1px solid var(--border)`, `--radius-md`, `padding: 4px 12px`
- When "% Change" active: data is transformed client-side. Y-axis formatter changes to `fmtPct`. Chart title gets "(% change from period start)" appended in `--text-muted` at 12px.

**Contribution toggle:**
- Single checkbox-style button: "Show contributions"
- Placed inline with Y-axis toggle group, right-aligned
- Default: shown if contributions data exists, hidden if no data
- Active: checkbox visually checked using `--accent` fill, text `--text-secondary`
- Inactive: unchecked, text `--text-muted`
- Font: 13px / weight 400

**Account toggle chips row:**
- Same pattern as `GroupsTimeChart` `.chipsRow`
- Flex row, wrapping, gap `--sp-2` (8px), `margin-bottom: --sp-4` (16px)
- First chip always: "All Combined" — represents the total series
  - Default: active (selected), shown in `--accent` color
  - Color dot: `COLOR_ACCENT` (`#4D9FFF`)
- Per-account chips: one per investment account, ordered by current value descending
  - Colors assigned from a fixed palette (see Token Updates section)
  - Inactive chip: `background: transparent`, `border-color: var(--border)` (= `GRID_STROKE` hex `#1E2D4A`), `color: --text-muted`
  - Active chip: `background: [color]22`, `border-color: [color]`, `color: --text-primary`
- Chip min-height: 36px (touch target)
- Chip border-radius: `--radius-pill`

**Chart area:**
- Recharts `ComposedChart` (not `LineChart`) to support mixed `Line` + `Bar`
- Height: 220px mobile / 340px desktop
- `ResponsiveContainer width="100%"`
- Chart margin: `{ top: 10, right: 16, left: 0, bottom: 0 }`

**Lines (performance):**
- "All Combined" line: `stroke: COLOR_ACCENT` (`#4D9FFF`), `strokeWidth: 2.5`, `dot: false`, `activeDot: { r: 5 }`
- Per-account lines: `strokeWidth: 1.5`, `dot: false`, `activeDot: { r: 4 }`, colors from account palette
- All lines: `type="monotone"`, `connectNulls`

**Contribution bars:**
- `<Bar>` elements on a secondary right Y-axis
- Color: `COLOR_AMBER` (`#F5A623`) at 40% opacity — use `fill` with `opacity` prop
- Bar radius: `[2, 2, 0, 0]` (rounded top corners)
- `yAxisId="contributions"` — right-side axis
- Right Y-axis formatter: `fmtCompact`, width 52px, tick color `AXIS_TICK`, hidden when contributions toggle is off
- When contributions toggle off: `Bar` components unmounted

**Y-axis (left — value):**
- Width: 52px mobile / 72px desktop (matches existing chart pattern)
- Formatter: `fmtCompact` in $ mode; `(n) => ${n.toFixed(1)}%` in % mode
- `tick={AXIS_TICK}`, `tickLine={false}`, `axisLine={false}`

**X-axis:**
- `dataKey="date"`, `tickFormatter={formatDateLabel}`, `tick={AXIS_TICK}`, `tickLine={false}`, `axisLine={false}`, `interval="preserveStartEnd"`

**Grid:** `<CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}>`

**Tooltip:**
- `const tooltipStyles = {...TOOLTIP_STYLE}` at module level
- Shows date, then sorted entries (highest value first)
- Each entry: color dot (8×8px, radius 2), series name, value formatted by current Y-axis mode
- Contribution section: if contributions shown, separate section below divider labeled "Est. Contributions"
- Separator: `border-top: 1px solid #1E2D4A`, padding 6px 0

**Loading state (chart skeleton):**
- Container rendered with correct dimensions
- Shimmer block fills chart area
- Height matches chart height (220px / 340px)
- No chips row during load — replaced by shimmer strip of 3 chips width

**Empty state (no performance data):**
- Height 160px / 200px flex center
- Text: "No performance data available for the selected range." — 14px / `--text-muted` / italic

**Empty contributions state:**
- Contribution toggle button disabled (`opacity: 0.4`, `cursor: not-allowed`)
- Tooltip on disabled toggle: "No contribution data detected for this account set"

**States summary:**
| State | Behavior |
|---|---|
| Loading | Shimmer chips + shimmer chart area |
| Data available | Full chart with chips |
| No data | Empty state message, no chart |
| Range changed | Re-fetch triggered, chart shows previous data faded (opacity 0.5) while loading |
| No contributions | Toggle button disabled, bars hidden |

---

### 5. AccountDetailHeader

**File:** `frontend/src/components/AccountDetailHeader.jsx` + `AccountDetailHeader.module.css`

**Purpose:** The top section of the holdings drill-down view. Provides back navigation, account identity, bucket badge, and key summary metrics.

**Container:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px` mobile / `20px 24px` at 768px+
- Margin-bottom: `--sp-5` (20px)

**Back link:**
- `<Link to="/investments">` — plain text link, no button chrome
- Text: "← Investments" — 13px / weight 500 / `--accent`
- Hover: `--accent-hover`, no underline by default, underline on hover
- `margin-bottom: --sp-3` (12px)
- `display: block` (full row on mobile)

**Account identity row:**
- Flex row, `align-items: flex-start`, gap `--sp-3`
- Left: account name — 18px / weight 400 / `--text-primary` at mobile; 20px at 768px+
- Below account name: institution name — 13px / `--text-muted`
- Right of institution: bucket badge — see badge spec below

**Bucket badge:**
- Inline badge adjacent to institution name
- "Retirement" or "Brokerage" text
- Background: `--accent-tint` (rgba(77,159,255,0.12))
- Border: `1px solid var(--accent-border-hover)`
- Color: `--accent-wash`
- Font: 10px / uppercase / letter-spacing 1.5px / weight 600
- Border radius: `--radius-pill`
- Padding: `2px 8px`

**Summary metrics row:**
- Flex row, flex-wrap, gap `--sp-5` (20px), `margin-top: --sp-4` (16px)
- `border-top: 1px solid var(--border-sub)`, `padding-top: --sp-4`
- 3 metrics visible on mobile, all 4 on desktop

**Metric items:**
- Label: 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted`
- Value: 16px / weight 400 / `--text-primary`
- Stacked vertically with 4px gap

**Metric 1 — Current Value:**
- Label: "CURRENT VALUE"
- Value: `fmtFull(account.current_value)`

**Metric 2 — Total Return:**
- Label: "TOTAL RETURN"
- Value: `fmtFull(totals.unrealized_gain_loss_dollars)` with sign prefix, color positive/negative
- Sub-value: `fmtPct(totals.unrealized_gain_loss_pct)` with Arrow — same color
- "N/A" in `--text-muted` when cost basis unavailable

**Metric 3 — Cost Basis:**
- Label: "COST BASIS"
- Value: `fmtFull(totals.total_cost_basis)`
- "N/A" in `--text-muted` when all basis null

**Metric 4 — Holdings Count (desktop only, hidden < 768px):**
- Label: "HOLDINGS"
- Value: integer count + " positions"

**Last synced:**
- Below metrics row, right-aligned
- "Last synced: [relative time]" — 11px / `--text-muted`
- Stale badge if applicable (same amber badge as table row)

---

### 6. HoldingsTable

**File:** `frontend/src/components/HoldingsTable.jsx` + `HoldingsTable.module.css`

**Purpose:** Sortable, filterable table of individual positions within an account.

**Container layout (drill-down two-column):**
- On desktop (768px+): the holdings table takes the left portion and the allocation donut takes the right. The parent in `InvestmentsPage` sets this via a CSS Grid: `grid-template-columns: 3fr 2fr`, gap `--sp-5`
- On mobile: stacking order is Donut → Table (implemented via `order` property in CSS or DOM order — Donut is DOM-first, `order: -1` on mobile)

**Table card container:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px` / `20px 24px`

**Filter and sort controls row:**
- Flex row, `align-items: center`, gap `--sp-3`, `margin-bottom: --sp-4`
- Left: section title "Holdings" — 15px / weight 500 / `--text-primary`
- Right: type filter `<select>` dropdown

**Type filter dropdown:**
- HTML `<select>` element (not a custom dropdown — keeps keyboard accessibility simple)
- Options: All / Stock / ETF / Mutual Fund / Bond / Cash / Other
- Background: `--bg-inset`
- Border: `1px solid var(--border)`
- Border radius: `--radius-md` (8px)
- Padding: `6px 10px`
- Color: `--text-secondary`
- Font size: 13px
- Focus: `border-color: var(--border-focus)`, `box-shadow: 0 0 0 1px var(--accent)`, `outline: none` (matches input focus standard)
- `aria-label="Filter by security type"`
- `min-height: 36px`

**Table structure:**
- `<table>` with `width: 100%`, `border-collapse: collapse`
- Horizontal scroll wrapper on mobile: `overflow-x: auto` on the container div wrapping the table

**Column definitions:**

| Column | Mobile | 768px+ | Alignment |
|---|---|---|---|
| Ticker | Visible | Visible | Left |
| Security Name | Hidden (shown as sub-line of Ticker) | Visible | Left |
| Type | Hidden | Visible | Left |
| Quantity | Hidden | Visible | Right |
| Cost Basis | Hidden | Visible | Right |
| Current Value | Visible | Visible | Right |
| Gain/Loss ($) | Hidden | Visible | Right |
| Gain/Loss (%) | Visible | Visible | Right |

**Mobile column consolidation:**
- Ticker cell shows ticker on primary line and security name on secondary line (12px / `--text-muted`)
- Current Value and Gain/Loss (%) shown as two stacked lines in a single right-aligned cell

**Column header styles:**
- Same as `InvestmentAccountsTable`: 10px / uppercase / letter-spacing 2px / weight 500 / `--text-muted`
- Border bottom: `1px solid var(--border)`
- Sortable: all columns sortable
- Sort icons: ▲ / ▼ / ⇅ as in accounts table
- `aria-sort` attribute on active sort column

**Table rows:**
- Padding: `10px 12px`
- Border bottom: `1px solid var(--border-sub)`
- Hover: `background: var(--bg-hover)`, transition `var(--ease-quick)`
- No click action — rows are not navigable

**Ticker cell:**
- Primary: ticker symbol — 14px / weight 500 / `--text-primary` — monospace-adjacent (use `font-family: 'Courier New', monospace` for ticker only)
- When `ticker` is null: "N/A" in `--text-muted`
- Secondary (mobile): security name, 12px / `--text-muted`

**Security Name cell (desktop):**
- 13px / weight 400 / `--text-secondary`
- Overflow: `text-overflow: ellipsis` with max width
- Null/empty: "Unknown Security" in `--text-muted`

**Type cell:**
- Badge-style pill per security type using a fixed color mapping (see Token Updates)
- Compact badge: 11px / weight 500, rounded pill, 2px 8px padding
- Colors: Stock → cobalt tint, ETF → green tint, Bond → amber tint, Mutual Fund → purple tint, Cash → gray tint, Other → border-only gray

**Numeric cells (quantity, value, basis):**
- 13px / weight 400 / `--text-primary`
- Null quantity: "--"
- Null basis: "--"

**Gain/Loss cells:**
- Same Arrow + color pattern as accounts table
- Null basis: "N/A" in `--text-muted`

**Is Manual indicator:**
- When `is_manual: 1`: small badge "Manual" adjacent to ticker
- Background: `--bg-raised`
- Border: `1px solid var(--border)`
- Color: `--text-muted`
- Font: 10px / weight 500 / uppercase

**Totals row (tfoot):**
- Background: `--bg-raised`
- Border top: `1px solid var(--border)` weight 2px
- "Total" label in first cell: 13px / weight 500 / `--text-secondary`
- Numeric totals: same weight as body but 500

**Empty state (no holdings):**
- Single `<tr>` spanning all columns
- Height: 100px
- Text: "No holdings data available for this account." — 14px / `--text-muted` / centered

**Filtered empty state:**
- When filter applied returns no results
- Text: "No [type] holdings in this account." — 14px / `--text-muted` / centered

**Loading state:**
- 5 shimmer rows

**Accessibility:**
- `<table aria-label="Holdings for [account name]">`
- `<caption>` visually hidden: "Holdings sorted by [column] [direction], filtered by [type]"
- Sortable headers: `tabIndex="0"`, keyboard-activatable
- Type filter: labeled with `aria-label`

---

### 7. AllocationChart

**File:** `frontend/src/components/AllocationChart.jsx` + `AllocationChart.module.css`

**Purpose:** Donut chart showing asset allocation by security type for the current account. This is the first use of `PieChart` in the codebase — it establishes the donut pattern.

**Container:**
- Background: `--bg-card`
- Border radius: `--radius-lg` (12px)
- Border: `1px solid var(--border)`
- Padding: `16px` / `20px 24px`
- Title "Asset Allocation": 15px / weight 500 / `--text-primary`, `margin-bottom: --sp-4`

**Chart layout:**
- On desktop: chart centered in the card, legend below the chart
- On mobile: chart above, legend below — full width card

**Recharts structure:**
```
PieChart (width auto via ResponsiveContainer, height 200px desktop / 180px mobile)
  Pie
    innerRadius: 60 (desktop) / 50 (mobile)
    outerRadius: 95 (desktop) / 80 (mobile)
    paddingAngle: 2
    dataKey: "value"
    data: allocation array
    Cell per slice (fill from type color map)
  Tooltip (custom)
  Legend (custom)
```

**Center label (donut hole content):**
- Not rendered via Recharts — use an absolutely-positioned `<div>` centered over the chart
- Shows total value: `fmtCompact(totals.current_value)`
- Font: 16px / weight 400 / `--text-primary`
- Sub-label: "total" — 11px / `--text-muted`

**Slice colors (security type palette — hardcoded hex, used in SVG):**
| Type | Color hex | Token equivalent |
|---|---|---|
| Stock | `#4D9FFF` | `COLOR_ACCENT` |
| ETF | `#2ECC8A` | `COLOR_POSITIVE` |
| Bond | `#F5A623` | `COLOR_AMBER` |
| Mutual Fund | `#9B7FE8` | (new — see Token Updates) |
| Cash | `#5EDDA8` | (near `--green-light`) |
| Other | `#4A6080` | (matches `AXIS_TICK.fill`) |

**Tooltip:**
- `const tooltipStyles = {...TOOLTIP_STYLE}` at module level
- Shows: type name, dollar value (`fmtFull(value)`), percentage (`fmtPct(pct)`)

**Legend (custom, below chart):**
- Flex column, gap `--sp-2` (8px)
- Each row: color dot (10×10px, `border-radius: 3px`) + type name (13px / `--text-secondary`) + value right-aligned (13px / `--text-primary`) + percentage (12px / `--text-muted`)
- Flex row, `justify-content: space-between`
- Dot left, text flex-grows, value + pct right group

**Single-type state:**
- When only one slice: chart renders a full ring in that slice's color
- Legend shows one row
- No visual issue — `paddingAngle: 2` ignored for single segment

**Empty state:**
- When `allocation` array is empty
- Height: 160px, flex-center
- Text: "No allocation data available." — 14px / `--text-muted` / italic

**Loading state:**
- Shimmer circle in chart area (200px height shimmer block with border-radius 50%)
- Shimmer legend rows below

**Accessibility:**
- `<figure aria-label="Asset allocation donut chart for [account name]">`
- Each `Cell`: `aria-label="[type]: [fmtFull(value)], [pct]%"`
- Legend list: `<ul role="list">` with `<li>` per type
- Chart is supplementary to the legend (which contains all data) — decorative from screen reader perspective

---

## Tooltip Design (Informational Tooltips)

These are non-chart tooltips for the "?" badges on CAGR labels.

**Trigger element:**
- "?" — inline after label text, margin-left 4px
- 14px / weight 500 / `--text-muted`
- Circle shape: `width: 16px; height: 16px; border-radius: 50%; background: var(--bg-raised); border: 1px solid var(--border); display: inline-flex; align-items: center; justify-content: center; font-size: 10px`
- Hover: `background: var(--bg-hover)`, cursor: help
- Focus: standard focus ring

**Tooltip popup:**
- Positioned: absolute, above trigger (with CSS or small JS position logic — keep simple)
- Background: `--bg-raised`
- Border: `1px solid var(--border)`
- Border radius: `--radius-md` (8px)
- Padding: `--sp-2` (8px) `--sp-3` (12px)
- Color: `--text-secondary`
- Font: 12px / weight 400
- Max width: 220px
- Box shadow: `--shadow-md`
- `role="tooltip"`, `aria-describedby` on trigger

---

## Interactive Elements

### Account Row Click (Dashboard → Drill-Down)

- Click target: entire `<tr>` row in accounts table
- Behavior: `navigate(`/investments/${account.id}`)` via React Router
- Visual feedback: immediate background change on mousedown (`--bg-raised`), then navigation
- No loading state during navigation — the drill-down renders its own loading skeleton
- Browser back button returns to `/investments` — no custom history management needed
- Active nav item stays highlighted as "Investments" on both routes (per architecture decision)

### Sort/Filter Controls (Holdings Table)

- Column header click: toggles sort direction for that column
- Sort animation: none (instant sort, data volume is small)
- Default sort: current value descending
- Type filter: `onChange` event on `<select>` — instant client-side filter, no debounce needed
- Combined behavior: sort and filter are independent; both applied simultaneously

### Range Selection (Performance Chart)

- `RangeSelector` buttons trigger a re-fetch of performance data from API
- While re-fetching: existing chart data fades (`opacity: 0.4`), a small spinner or shimmer appears in the chart area (not a full skeleton — too jarring)
- Spinner: a 20px × 20px `border: 2px solid var(--border)` / `border-top-color: var(--accent)` CSS spinner centered over the chart, `animation: spin 0.8s linear infinite`
- After fetch: new data replaces old, opacity restores to 1

### Account Toggle Chips (Performance Chart)

- Toggle chip: toggles the corresponding `<Line>` visibility in the chart
- "All Combined" chip: always represents the totals series
- When all individual account chips are deactivated: "All Combined" remains and the chart shows one line
- When "All Combined" is deactivated: if no individual accounts selected, show empty-chart hint: "Select an account above to view its performance."
- No API call triggered — just show/hide `<Line>` components from already-fetched data

### Y-Axis Mode Toggle (Performance Chart)

- Instant client-side transform — no API call
- "%" mode: transform each series value relative to its first data point in the current range
- Label in tooltip updates to show "%" instead of "$"
- Y-axis formatter switches to percent format

---

## Design Tokens

All tokens used are from the existing `index.css` token set. No new CSS custom properties are required in `index.css`.

### Token Usage Map

| Token | Used In |
|---|---|
| `--bg-root` | Page background, range selector background |
| `--bg-card` | All card containers |
| `--bg-hover` | Row hover states, chip hover |
| `--bg-raised` | Totals rows, tfoot, badge backgrounds, tooltip |
| `--bg-inset` | Filter select background |
| `--bg-error-subtle` | Stale data banner background |
| `--bg-table-active` | Selected/active row (not used in current design — reserved) |
| `--border` | All card and table borders |
| `--border-sub` | Table row dividers (`--border-sub` = `#162035`) |
| `--border-focus` | Focus states on interactive elements |
| `--border-error` | Stale data banner border |
| `--text-primary` | Account names, numeric values, chart heading |
| `--text-secondary` | Institution names, legend text, filter select |
| `--text-muted` | Labels, column headers, null values, back link sub |
| `--text-faint` | Not used in this feature |
| `--accent` | Back link color, focus borders, "All Combined" chip dot |
| `--accent-hover` | Back link hover |
| `--accent-tint` | Bucket badge background, page header glow |
| `--accent-border-hover` | Card hover border glow, bucket badge border |
| `--accent-wash` | Bucket badge text |
| `--color-positive` / `--green` | Positive returns (CSS only — Arrow component inline style uses `COLOR_POSITIVE` hex) |
| `--color-negative` / `--red` | Negative returns |
| `--color-warning` / `--amber` | Stale data badge and banner |
| `--shadow-md` | Tooltip popup shadow |
| `--radius-sm` | (Not primary — available) |
| `--radius-md` | Filter select, tooltip, Y-axis toggle buttons |
| `--radius-lg` | All main card containers |
| `--radius-pill` | Chips, stale badge, bucket badge |
| `--sp-1` through `--sp-6` | Gaps, padding, margins per component specs above |
| `--ease-quick` | Row hover transitions, chip transitions |
| `--ease-smooth` | Card border hover transitions |

### Chart Constants (hardcoded hex — SVG attributes)

These live in `chartUtils.jsx` or are new inline constants in the component files. Per convention, they are never in CSS modules.

| Constant | Value | Purpose |
|---|---|---|
| `COLOR_ACCENT` | `#4D9FFF` | "All Combined" line, Stock slice |
| `COLOR_POSITIVE` | `#2ECC8A` | ETF slice, Arrow component positive |
| `COLOR_NEGATIVE` | `#FF5A7A` | Arrow component negative |
| `COLOR_AMBER` | `#F5A623` | Bond slice, contribution bars |
| `AXIS_TICK` | `{ fill: '#4A6080', fontSize: 11 }` | All chart axes |
| `GRID_STROKE` | `#1E2D4A` | Grid lines, inactive chip borders |
| `TOOLTIP_STYLE` | bg `#1C2333`, border `#1E2D4A` | All tooltip wrappers |

**New chart color constants (add to `InvestmentPerformanceChart.jsx` and `AllocationChart.jsx` inline — do not add to `chartUtils.jsx` unless a third consumer appears):**

| Constant | Value | Purpose |
|---|---|---|
| `COLOR_MUTUAL_FUND` | `#9B7FE8` | Mutual Fund donut slice, account line color slot |
| `COLOR_CASH` | `#5EDDA8` | Cash donut slice |

**Account line color palette (for multi-account performance chart):**

A fixed palette assigned to accounts in order of `current_value` descending. Define as `ACCOUNT_COLORS` array in `InvestmentPerformanceChart.jsx`:

```
'#4D9FFF'  (cobalt — for account 1 / All Combined)
'#2ECC8A'  (green — account 2)
'#F5A623'  (amber — account 3)
'#9B7FE8'  (purple — account 4)
'#FF5A7A'  (red — account 5)
'#5EDDA8'  (mint — account 6)
'#7DBFFF'  (light cobalt — account 7)
'#F5D76E'  (yellow — account 8+, wraps)
```

"All Combined" always uses `COLOR_ACCENT` (`#4D9FFF`). Individual account colors start from index 1.

---

## Accessibility

### Color Contrast

All foreground/background pairings use tokens from the existing design system, which has been validated for contrast in prior PRs. Key pairs for new elements:

| Foreground token | Background token | Minimum ratio target |
|---|---|---|
| `--text-primary` (#F0F6FF) | `--bg-card` (#1C2333) | 4.5:1 (passes: ~10:1) |
| `--text-secondary` (#8BA8CC) | `--bg-card` (#1C2333) | 4.5:1 (passes: ~5.5:1) |
| `--text-muted` (#4A6080) | `--bg-card` (#1C2333) | 3:1 for large text / decorative only |
| `--color-warning` (#F5A623) | `--bg-error-subtle` | 3:1 minimum (warning banner) |
| `--color-positive` (#2ECC8A) | `--bg-card` (#1C2333) | 3:1 minimum (supplemented by icons) |
| `--color-negative` (#FF5A7A) | `--bg-card` (#1C2333) | 3:1 minimum (supplemented by icons) |

Color is never the sole indicator of positive/negative values. The Arrow component (▲/▼) and +/- prefix ensure redundancy.

### Focus States

All interactive elements must have visible focus states:
- Table rows (`<tr tabIndex="0">`): `outline: 2px solid var(--border-focus)`, `outline-offset: -2px`
- Column sort headers: same outline
- Chips: same outline
- Filter select: `border-color: var(--border-focus)`, `box-shadow: 0 0 0 1px var(--accent)`, `outline: none` (matches input focus standard from conventions.md)
- Range selector buttons: same as existing `RangeSelector` (no explicit focus style currently — add `outline: 2px solid var(--border-focus)` on `:focus-visible`)
- Back link: standard browser focus on `<a>` (no override needed)
- Y-axis toggle buttons: same as range selector buttons

High-contrast media: include `@media (forced-colors: active) { outline: 2px solid; }` on all custom focus styles.

### Keyboard Navigation

**Dashboard view:**
- Tab order: Page header actions → Stats cards (no interactive elements) → Performance chart controls (Y-axis toggle → Contribution toggle → Range selector buttons → Account chips) → Accounts table headers (sortable) → Account rows (Enter/Space to drill down)
- Arrow keys: not required for table rows (Tab-based navigation is sufficient given table density)

**Drill-down view:**
- Tab order: Back link → Account header (static) → Type filter → Holdings table headers (sortable) → Holdings rows (no action) → Allocation chart (decorative, skipped via `aria-hidden` or `tabIndex="-1"` on chart element)

### Screen Reader Considerations

**Live regions:**
- `<div aria-live="polite" aria-atomic="true">` wraps loading/error state areas so state changes are announced
- Chart loading transitions: announce "Performance chart loading" / "Performance chart updated"
- Sort changes: announce "[column name] sorted [ascending/descending]" via `aria-live` on a visually-hidden element

**Table semantics:**
- `<table>` used for all tabular data (not `<div>` grids)
- `<th scope="col">` for column headers
- `<th scope="row">` for row headers where applicable (totals row "Total" label)
- `<caption>` (visually hidden) on both tables describing contents and current sort state

**Chart descriptions:**
- Donut chart: `<figure aria-label="...">` with `<figcaption>` containing the legend (which already contains all the data text)
- Performance chart: `<figure aria-label="Investment performance chart">` with a visually-hidden `<figcaption>` summarizing the range and account selection

**Tooltip ARIA:**
- Informational "?" tooltips: trigger button has `aria-describedby="tooltip-id"`, tooltip div has `role="tooltip" id="tooltip-id"`

---

## Loading / Empty / Error States

### Skeleton Screens

Skeleton screens appear while data is pending. They match the layout of populated content to prevent layout shift when data arrives.

**Stats cards skeleton:** 3 shimmer blocks, 100px tall, matching card structure (no label/value visible).

**Performance chart skeleton:**
- Header row: shimmer strip 30px tall (title area) + shimmer strip for range selector
- Chips row: 3 shimmer chips
- Chart area: solid shimmer block at chart height

**Accounts table skeleton:**
- Table header rendered normally (column headers visible)
- 4 shimmer `<tr>` rows in tbody, each 48px tall
- Column cells individually shimmer at varying widths (60% / 40% / 30% to avoid identical rows)

**Holdings table skeleton:**
- Controls row rendered (filter visible but disabled)
- 5 shimmer rows

**Donut chart skeleton:**
- Shimmer circle (200×200px, `border-radius: 50%`) centered
- 3 shimmer legend rows below

### Empty States

| Location | Trigger | Message |
|---|---|---|
| Full page | `accounts: []` from API | "No investment accounts found. Sync your accounts to get started." + "Go to Sync" link |
| Holdings drill-down | `holdings: []` from API | "No holdings data available for this account." |
| Holdings table (filtered) | Filter returns 0 rows | "No [type] holdings in this account." |
| Performance chart | No series data | "No performance data available for the selected range." |
| Contribution toggle | No contributions detected | Toggle disabled with tooltip explaining |
| Allocation chart | `allocation: []` | "No allocation data available." |

Empty states follow a consistent visual pattern:
- Centered flex container
- Icon (emoji or SVG, 32px–48px) — optional, used only for full-page empty
- Heading: 15px / weight 500 / `--text-primary`
- Body: 14px / `--text-secondary`
- Action link if applicable: `--accent` color

### Error States

| Location | Trigger | Behavior |
|---|---|---|
| Full page (summary fetch fails) | 500 or network error on `/api/investments/summary` | Full-page error card with retry button |
| Performance chart | Fetch fails for performance endpoint | Error message within chart card: "Could not load performance data." with "Try Again" button |
| Holdings drill-down (holdings fetch fails) | 500 on `/api/investments/accounts/:id/holdings` | Error within drill-down content area only; does not affect back navigation or header |
| Account not found | 404 from holdings endpoint | "This account was not found. It may have been removed." with back link |

Error cards:
- Background: `--bg-card`
- Border: `1px solid var(--color-negative)` (`--red`)
- Border radius: `--radius-lg`
- Padding: `24px 20px` / `32px` at 768px+
- Title: error summary — 15px / weight 500 / `--color-negative`
- Body: brief explanation — 14px / `--text-secondary`
- Retry/action button: secondary style (same as Refresh button)

---

## Responsive Behavior Reference

### Breakpoint Summary

| Breakpoint | Key Changes |
|---|---|
| `< 480px` | Stats cards: 1-col. All tables: minimal columns. |
| `480px` | Stats cards: 3-col grid. |
| `600px` | Chart header: row layout (title + range inline). |
| `768px` | Page title: 20px. All card padding expands to 20px/24px. Table "Total Return $", "Holdings" columns appear. Chart height: 340px. Drill-down: two-column grid. "Updated at" timestamp appears. |
| `1024px` | Accounts table: CAGR, Allocation Weight columns appear. |

### Touch Targets

All interactive elements meet 44×44px minimum touch target:
- Account toggle chips: `min-height: 36px` + adequate horizontal padding — combined tap area ≥ 44px height via implicit padding in flex container
- Range selector buttons: `min-height: 36px` on mobile (existing pattern)
- Table rows: `min-height: 48px` enforced via padding — exceeds 44px requirement
- Back link: inline text — adequate at 13px with padding; augment with `display: inline-block; padding: 8px 0` on mobile
- Sort headers: `min-height: 44px` via `padding: 12px 8px`
- Filter select: `min-height: 36px` — browser-native so touch area is browser-managed

### Mobile-Specific Simplifications

1. **Accounts table:** 3 columns only (Name+Institution, Current Value, Return %). Removes cognitive load. "More" is accessible by rotating to landscape or using desktop.
2. **Holdings table:** Horizontal scroll enabled. Ticker + name merged into one cell. Only "Current Value" and "Gain/Loss %" visible without scrolling.
3. **Donut chart:** Moves above the holdings table in the DOM on mobile. Chart dimensions reduced (innerRadius 50, outerRadius 80).
4. **Performance chart height:** 220px vs. 340px on desktop.
5. **Account detail header:** Metrics row collapses to 3 of 4 metrics. Holdings count hidden.
6. **Y-axis mode toggle + Contribution toggle:** Stack below range selector on narrow screens — the controls row becomes a column.

---

## Component Spacing Reference

Vertical spacing between sections follows the existing page pattern. Use `margin-bottom` on each section card.

| Between sections | Spacing |
|---|---|
| Page header → Stats cards | Included in `.pageHeader { margin-bottom: var(--sp-5) }` |
| Stats cards → Performance chart | Stats cards `.row { margin-bottom: 20px/24px }` |
| Performance chart → Accounts table | Performance chart card `margin-bottom: var(--sp-5)` |
| Account detail header → Two-column grid | `margin-bottom: var(--sp-5)` |
| Within card: title → content | `margin-bottom: var(--sp-4)` (16px) |
| Within card: controls row → table | `margin-bottom: var(--sp-4)` (16px) |
| Stale data banner → Stats cards | `margin-bottom: var(--sp-4)` (16px) |

---

## Visual References

The existing Net Worth page at `/networth` is the closest visual reference. The Investments page inherits all of its visual patterns directly. The notable additions over the Net Worth page are:

1. **The accounts table:** A data table with sortable columns — more structured than the `AccountsBreakdown` accordion. Reference the `BuilderResultsTable` component for sortable column header patterns if one exists.
2. **The donut chart:** New chart type. The visual spec above (innerRadius/outerRadius sizes, paddingAngle, custom legend) is sufficient to implement without an existing reference.
3. **The stale data warning system:** The amber badge pattern should feel similar to how the app might show other state badges (status indicators in `SyncJobStatus`).

No external UI screenshots are required — the design system is self-documenting through the token reference and existing component CSS, which this spec has been built against directly.
