# UI Update PR 2 — Navigation + Interactive Elements: Implementation Plan

**Date:** 2026-03-05
**PR scope:** P1-1 through P1-6 — Sidebar restyle, BottomTabBar frosted glass, button standardization (12 selectors), input standardization, card hover, letter-spacing system, plus A4 hardcoded transition migration (16 values across 8 files)
**Architecture source:** `docs/plans/ui-update-architecture.md` (A2, A3, A4, A6)
**Research source:** `docs/plans/ui-update-research.md` (R2, R3, R4, R6)
**Prerequisites:** PR 1 merged. All files have been read with verified line numbers.

---

## Summary

| Metric | Count |
|--------|-------|
| Total files changed | 22 |
| Group E — Sidebar (P1-1) | 1 file |
| Group F — BottomTabBar (P1-2) | 1 file |
| Group G — Button color + letter-spacing + text-transform (P1-3, A2) | 9 files |
| Group H — Input standardization + label updates (P1-4, A3) | 8 files |
| Group I — Card hover (P1-5) | 1 file |
| Group J — Page title letter-spacing + headline tracking (P1-6) | 3 files |
| Group K — Hardcoded transition migration (A4) | 8 files |
| Total property-level changes | ~95 |

Multi-group files: `SetupPage.module.css` (G+H+K), `GroupManager.module.css` (G+H+K), `BuilderProfileForm.module.css` (G+H), `BuilderRegionalData.module.css` (G+H), `AIAnalysisPanel.module.css` (G+H), `RetirementPanel.module.css` (G+H), `BuilderResultsTable.module.css` (G), `BudgetBuilderPage.module.css` (G+H+K), `BudgetPage.module.css` (G+J), `GroupsTimeChart.module.css` (K), `GroupSnapshotControls.module.css` (G+K), `SyncControl.module.css` (K), `SyncHistory.module.css` (K), `RangeSelector.module.css` (K), `BudgetTable.module.css` (K), `NetWorthPage.module.css` (J), `App.module.css` (J).

All changes depend on PR 1 having merged (tokens available). Within PR 2, all 22 files are independent of each other and can be implemented in parallel.

---

## Dependency Graph

```
PR 1 merged (index.css tokens available)
    |
    +-- All PR 2 groups (fully parallel within group AND across groups):
          Group E:  Sidebar.module.css
          Group F:  BottomTabBar.module.css
          Group G:  BudgetBuilderPage*, BuilderRegionalData*, BuilderProfileForm*,
                    RetirementPanel*, BuilderResultsTable, AIAnalysisPanel*,
                    SetupPage*, GroupManager*, BudgetPage*, GroupSnapshotControls*
          Group H:  (same 8 files as G that have inputs, plus AutoSyncSettings)
          Group I:  StatsCards.module.css
          Group J:  NetWorthPage.module.css, BudgetPage*, App.module.css
          Group K:  GroupManager*, GroupsTimeChart, GroupSnapshotControls*, SyncControl,
                    SyncHistory, RangeSelector, BudgetTable, SetupPage*, BudgetBuilderPage*

* = file appears in multiple groups; assign all its changes to one implementer
```

---

## Changes

### Group E: Sidebar Restyle (P1-1, A6)

---

### `frontend/src/components/Sidebar.module.css`
**Groups:** E | **Parallelism:** independent

| Line(s) | Selector | Property | Before | After |
|---------|----------|----------|--------|-------|
| 23 | `.navItem` | `padding` | `var(--sp-3) var(--sp-5)` | `7px 10px 7px 7px` |
| 26 | `.navItem` | `font-size` | `14px` | `11px` |
| 27 | `.navItem` | `font-weight` | `500` | `400` |
| 28 (new) | `.navItem` | `letter-spacing` | _(absent)_ | `0.3px` |
| 28 (new) | `.navItem` | `border-radius` | _(absent)_ | `6px` |
| 34 | `.navItem:hover` | `background` | `var(--bg-hover)` | `var(--bg-surface)` |
| 38 | `.navItemActive` | `color` | `var(--accent-light)` | `var(--accent)` |
| 40 | `.navItemActive` | `background` | `var(--bg-hover)` | `var(--bg-card)` |
| 51 | `.navLabel` | `font-size` | `14px` | `11px` |

**Notes:**
- The `transition` on line 29 already uses `var(--ease-quick)` (applied in PR 1 Group D) — no change needed.
- The `border-left: 3px solid transparent` on line 28 is already present — no change needed.
- `letter-spacing` and `border-radius` are additions within the `.navItem` block; insert before `transition` (line 29).
- Exact final `.navItem` block per A6: `padding: 7px 10px 7px 7px; border-left: 3px solid transparent; border-radius: 6px; font-size: 11px; font-weight: 400; letter-spacing: 0.3px; color: var(--text-muted); transition: color var(--ease-quick), background var(--ease-quick), border-color var(--ease-quick);`

---

### Group F: BottomTabBar Frosted Glass (P1-2, D4)

---

### `frontend/src/components/BottomTabBar.module.css`
**Groups:** F | **Parallelism:** independent

| Line(s) | Selector | Property | Before | After |
|---------|----------|----------|--------|-------|
| 11 | `.bottomBar` | `background` | `var(--bg-card)` | `rgba(10,15,30,0.9)` |
| 11 (new) | `.bottomBar` | `backdrop-filter` | _(absent)_ | `blur(16px)` |
| 11 (new) | `.bottomBar` | `-webkit-backdrop-filter` | _(absent)_ | `blur(16px)` |
| 47 | `.tabItemActive` | `color` | `var(--accent-light)` | `var(--accent)` |

**Notes:**
- Add `backdrop-filter` and `-webkit-backdrop-filter` after the `background` property inside `.bottomBar` (after line 11, before line 12).
- `.tabItem` inactive color (`var(--text-muted)`) is already correct — no change.
- `.tabItem` transition already uses `var(--ease-quick)` (PR 1 Group D) — no change.

---

### Group G: Button Standardization (P1-3, A2)

All 12 selectors change `color: var(--white)` or `color: white` to `color: var(--bg-root)`. Additionally: add `letter-spacing: 1.5px`, `text-transform: uppercase` to each primary button block. Fix `SetupPage .btn:hover` background. Update radius from `6px` to `var(--radius-md)` or `var(--radius-btn-lg)` as appropriate.

**Radius convention:**
- Small context buttons (`padding: 8px 16px`): `var(--radius-md)` (8px)
- Large buttons (`.btnNewLarge`, `.btnSave` with `10px 20px`, SetupPage `.btn`): `var(--radius-btn-lg)` (10px)

---

### `frontend/src/pages/BudgetBuilderPage.module.css`
**Groups:** G + H + K | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 76 | `.monthSelect` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 76 | `.monthSelect` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 76 | `.monthSelect` | `padding` | `7px 10px` | `11px 14px` | H |
| 83 | `.monthSelect:focus` | `outline` | `2px solid var(--accent)` | _(remove)_ | H |
| 83 | `.monthSelect:focus` | `outline-offset` | `2px` | _(remove)_ | H |
| 83 (new) | `.monthSelect:focus` | `border-color` | _(absent)_ | `var(--accent)` | H |
| 83 (new) | `.monthSelect:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 89 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| 90 (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| 90 (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 91 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

**Hardcoded transition (A4):**
| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| _(no hardcoded transitions in this file)_ | — | — | — | — | K |

**Note:** `BudgetBuilderPage` has no hardcoded transitions — the K assignment in the dependency graph was an error. Only assign G+H here.

---

### `frontend/src/components/BuilderRegionalData.module.css`
**Groups:** G + H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 32 | `.fieldLabel` | `font-size` | `12px` | `9px` | H |
| 33 | `.fieldLabel` | `font-weight` | `500` | `400` | H |
| 34 | `.fieldLabel` | `color` | `var(--text-secondary)` | `var(--text-muted)` | H |
| 34 (new) | `.fieldLabel` | `text-transform` | _(absent)_ | `uppercase` | H |
| 34 (new) | `.fieldLabel` | `letter-spacing` | _(absent)_ | `2px` | H |
| 38 | `.fieldInput` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 41 | `.fieldInput` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 42 | `.fieldInput` | `padding` | `7px 10px` | `11px 14px` | H |
| 48 | `.fieldInput:focus` | `outline` | `2px solid var(--accent)` | _(remove)_ | H |
| 48 | `.fieldInput:focus` | `outline-offset` | `2px` | _(remove)_ | H |
| 50 | `.fieldInput:focus` | `border-color: transparent` | `border-color: transparent` | _(remove)_ | H |
| 48 (new) | `.fieldInput:focus` | `border-color` | _(absent)_ | `var(--accent)` | H |
| 48 (new) | `.fieldInput:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 76 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| 77 (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| 77 (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 79 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

**Note on focus rule:** Replace the entire `.fieldInput:focus` block. The `border-color: transparent` on line 50 is part of the outline pattern (hides the border when outline shows). New pattern: `border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none;`

Add `@media (forced-colors: active)` block after `.fieldInput:focus` per A3:
```css
@media (forced-colors: active) {
  .fieldInput:focus { outline: 2px solid; }
}
```

---

### `frontend/src/components/BuilderProfileForm.module.css`
**Groups:** G + H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 22 | `.label` | `font-size` | `12px` | `9px` | H |
| 23 | `.label` | `font-weight` | `500` | `400` | H |
| 24 | `.label` | `color` | `var(--text-secondary)` | `var(--text-muted)` | H |
| 24 (new) | `.label` | `text-transform` | _(absent)_ | `uppercase` | H |
| 24 (new) | `.label` | `letter-spacing` | _(absent)_ | `2px` | H |
| 28 | `.input` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 30 | `.input` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 33 | `.input` | `padding` | `7px 10px` | `11px 14px` | H |
| 38 | `.input:focus` | `outline` | `2px solid var(--accent)` | _(remove; replace block)_ | H |
| 39 | `.input:focus` | `outline-offset` | `2px` | _(remove)_ | H |
| 41 | `.input:focus` | `border-color: transparent` | `border-color: transparent` | _(remove)_ | H |
| 38 (new) | `.input:focus` | `border-color` | _(absent)_ | `var(--accent)` | H |
| 38 (new) | `.input:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 38 (new) | `.input:focus` | `outline` | _(absent)_ | `none` | H |
| 79 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| 80 (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| 80 (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 81 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

Add forced-colors fallback after `.input:focus` block (same pattern as BuilderRegionalData).

**Note:** `.textarea` and `.inputSmall` use `composes: input` — they inherit the `.input` changes automatically.

---

### `frontend/src/components/RetirementPanel.module.css`
**Groups:** G + H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 32 | `.fieldLabel` | `font-size` | `12px` | `9px` | H |
| 33 | `.fieldLabel` | `font-weight` | `500` | `400` | H |
| 35 (new) | `.fieldLabel` | `color` | `var(--text-secondary)` (on line 36 of `.fieldLabel` rule) | `var(--text-muted)` | H |
| (new) | `.fieldLabel` | `text-transform` | _(absent)_ | `uppercase` | H |
| (new) | `.fieldLabel` | `letter-spacing` | _(absent)_ | `2px` | H |
| 40 | `.input` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 43 | `.input` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 45 | `.input` | `padding` | `7px 10px` | `11px 14px` | H |
| 51 | `.input:focus` | `outline` | `2px solid var(--accent)` | _(remove; replace block)_ | H |
| 52 | `.input:focus` | `outline-offset` | `2px` | _(remove)_ | H |
| 53 | `.input:focus` | `border-color: transparent` | `border-color: transparent` | _(remove)_ | H |
| 51 (new) | `.input:focus` | `border-color` | _(absent)_ | `var(--accent)` | H |
| 51 (new) | `.input:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 51 (new) | `.input:focus` | `outline` | _(absent)_ | `none` | H |
| 77 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 80 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

Add forced-colors fallback after `.input:focus`.

---

### `frontend/src/components/AIAnalysisPanel.module.css`
**Groups:** G + H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 120 | `.label` | `font-size` | `12px` | `9px` | H |
| 121 | `.label` | `font-weight` | `500` | `400` | H |
| 122 | `.label` | `color` | `var(--text-secondary)` | `var(--text-muted)` | H |
| (new) | `.label` | `text-transform` | _(absent)_ | `uppercase` | H |
| (new) | `.label` | `letter-spacing` | _(absent)_ | `2px` | H |
| 131 | `.input` | `background` | `var(--bg-root)` | `var(--bg-card)` | H |
| 133 | `.input` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 136 | `.input` | `padding` | `7px 10px` | `11px 14px` | H |
| 141 | `.input:focus` | `outline` | `2px solid var(--accent)` | _(remove; replace block)_ | H |
| 142 | `.input:focus` | `outline-offset` | `2px` | _(remove)_ | H |
| 144 | `.input:focus` | `border-color: transparent` | `border-color: transparent` | _(remove)_ | H |
| 141 (new) | `.input:focus` | `border-color` | _(absent)_ | `var(--accent)` | H |
| 141 (new) | `.input:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 141 (new) | `.input:focus` | `outline` | _(absent)_ | `none` | H |
| 155 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 158 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

Add forced-colors fallback after `.input:focus`.

---

### `frontend/src/pages/SetupPage.module.css`
**Groups:** G + H + K | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 74 | `.label` | `font-size` | `0.875rem` (~14px) | `9px` | H |
| 75 | `.label` | `font-weight` | `500` | `400` | H |
| 76 | `.label` | `color` | `var(--text-secondary)` | `var(--text-muted)` | H |
| (new) | `.label` | `text-transform` | _(absent)_ | `uppercase` | H |
| (new) | `.label` | `letter-spacing` | _(absent)_ | `2px` | H |
| 80 | `.input` | `background` | `var(--bg-inset)` | `var(--bg-card)` | H |
| 82 | `.input` | `padding` | `0.6rem 0.875rem` | `11px 14px` | H |
| 83 | `.input` | `font-size` | `0.9rem` | `13px` | H |
| 89 | `.input:focus` | `transition` | `border-color 0.15s` | `border-color var(--ease-default)` | K |
| 92 | `.input:focus` | `border-color` | `var(--accent)` (already correct) | `var(--accent)` (no change) | — |
| (new) | `.input:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| (new) | `.input:focus` | `outline` | _(absent, already `outline: none` in `.input`)_ | _(none needed)_ | — |
| 107 | `.btn` | `color` | `var(--white)` | `var(--bg-root)` | G |
| 108 | `.btn` | `border-radius` | `8px` | `var(--radius-btn-lg)` | G |
| 109 | `.btn` | `padding` | `0.65rem 1rem` | `13px 28px` | G |
| 111 | `.btn` | `font-size` | `0.9rem` | `13px` | G |
| (new) | `.btn` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btn` | `text-transform` | _(absent)_ | `uppercase` | G |
| 114 | `.btn` | `transition` | `background 0.15s, opacity 0.15s` | `background var(--ease-default), opacity var(--ease-default)` | K |
| 119 | `.btn:hover:not(:disabled)` | `background` | `var(--accent-hover)` | `var(--accent-light)` | G |

Add forced-colors fallback for `.input:focus`.
Add `@media (forced-colors: active) { .input:focus { outline: 2px solid; } }`.

**Note:** `.input` on line 88 already has `outline: none` — no change needed there. `.input:focus` currently has only `border-color: var(--accent)` (line 93) — add `box-shadow` to the existing rule rather than replacing.

---

### `frontend/src/components/GroupManager.module.css`
**Groups:** G + H + K | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 211 | `.label` | `font-size` | `12px` | `9px` | H |
| 213 | `.label` | `color` | `var(--text-secondary)` | `var(--text-muted)` | H |
| 232 | `.input` | `background` | `var(--bg-root)` | `var(--bg-card)` | H |
| 237 | `.input` | `padding` | `10px 12px` | `11px 14px` | H |
| 243 | `.input:focus` | `border-color` | `var(--accent)` (already correct) | `var(--accent)` (no change) | — |
| (new) | `.input:focus` | `box-shadow` | _(absent)_ | `0 0 0 1px var(--accent)` | H |
| 49 | `.btnNew` | `color` | `white` (bare) | `var(--bg-root)` | G |
| (new) | `.btnNew` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnNew` | `text-transform` | _(absent)_ | `uppercase` | G |
| 159 | `.btnNewLarge` | `color` | `white` (bare) | `var(--bg-root)` | G |
| 160 | `.btnNewLarge` | `border-radius` | `8px` | `var(--radius-btn-lg)` | G |
| (new) | `.btnNewLarge` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnNewLarge` | `text-transform` | _(absent)_ | `uppercase` | G |
| 368 | `.btnSave` | `color` | `white` (bare) | `var(--bg-root)` | G |
| 369 | `.btnSave` | `border-radius` | `8px` | `var(--radius-btn-lg)` | G |
| (new) | `.btnSave` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnSave` | `text-transform` | _(absent)_ | `uppercase` | G |
| 69 | `.groupCard` | `transition` | `border-color 0.15s` | `border-color var(--ease-quick)` | K |
| 259 | `.colorSwatch` | `transition` | `outline 0.1s` | `outline var(--ease-quick)` | K |
| 309 | `.accountRow` | `transition` | `background 0.1s` | `background var(--ease-quick)` | K |
| 374 | `.btnSave` | `transition` | `opacity 0.15s` | `opacity var(--ease-default)` | K |

Add forced-colors fallback for `.input:focus`.

**Note on `.label`:** Line 212 has `font-weight: 400` (already correct from PR1), line 214 has `text-transform: uppercase` (already correct), line 215 has `letter-spacing: 2px` (already correct). Only `font-size` (line 211) and `color` (line 213) need updating in PR2.

**Note on `.btnNew` radius:** Currently `8px`. Per guide, small buttons use `var(--radius-md)` = 8px, which is the same value — no change strictly needed, but tokenizing it to `var(--radius-md)` is cleaner. Include the tokenization.

---

### `frontend/src/components/BuilderResultsTable.module.css`
**Groups:** G | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 122 | `.btnPrimary` | `color` | `var(--white)` | `var(--bg-root)` | G |
| (new) | `.btnPrimary` | `letter-spacing` | _(absent)_ | `1.5px` | G |
| (new) | `.btnPrimary` | `text-transform` | _(absent)_ | `uppercase` | G |
| 124 | `.btnPrimary` | `border-radius` | `6px` | `var(--radius-md)` | G |

**Notes:** `.cellInput` (line 76-95) uses `border-color: var(--accent)` focus pattern already and is an inline table input — A3 exception applies, no `box-shadow` added. `.btnSuccess` already uses `var(--bg-root)` text — no change.

---

### `frontend/src/pages/BudgetPage.module.css`
**Groups:** G + J | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 22 | `.title` | `letter-spacing` | _(absent)_ | `-0.3px` | J |
| 58 | `.rangeBtnActive` | `color` | `var(--white)` | `var(--bg-root)` | G |

**Note:** `.rangeBtn` and `.rangeBtnActive` are toggle buttons (secondary pattern), not primary CTAs — they do not get `text-transform: uppercase` or `letter-spacing: 1.5px`. Only the `color` change applies to `.rangeBtnActive` per A2 (white on cobalt must become dark).

---

### `frontend/src/components/GroupSnapshotControls.module.css`
**Groups:** G + K | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 172 | `.saveConfirm` | `color` | `var(--white)` | `var(--bg-root)` | G |
| 28 | `.chip` | `transition` | `border-color 0.15s, color 0.15s, background 0.15s` | `border-color var(--ease-quick), color var(--ease-quick), background var(--ease-quick)` | K |
| 77 | `.configPill` | `transition` | `border-color 0.15s, color 0.15s` | `border-color var(--ease-quick), color var(--ease-quick)` | K |
| 111 | `.pillAction` | `transition` | `opacity 0.15s, color 0.15s` | `opacity var(--ease-quick), color var(--ease-quick)` | K |
| 132 | `.saveBtn` | `transition` | `border-color 0.15s, color 0.15s` | `border-color var(--ease-quick), color var(--ease-quick)` | K |

**Note:** `.saveConfirm` is a small pill-shaped confirm button (inline save action). It takes the A2 color change. It does not get `text-transform`/`letter-spacing` — it is not a primary CTA by design (it is `11px` inline-flow).

**Note on `.saveInput`:** Line 157-159 has `.saveInput:focus { border-color: var(--accent); }` — already correct. This is the inline-edit exception per A3, no `box-shadow` added.

---

### Group H: Input Standardization (continued — files with inputs only)

---

### `frontend/src/components/MilestoneEditor.module.css`
**Groups:** H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 62 | `.amountInput` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 64 | `.amountInput` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 72 | `.labelInput` | `background` | `var(--bg-deep)` | `var(--bg-card)` | H |
| 74 | `.labelInput` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 80–84 | `.amountInput:focus, .labelInput:focus` | Replace entire block | `outline: 2px solid var(--accent); outline-offset: 2px; border-color: transparent;` | `border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none;` | H |

Add forced-colors fallback:
```css
@media (forced-colors: active) {
  .amountInput:focus,
  .labelInput:focus { outline: 2px solid; }
}
```

**Note:** Padding on `.amountInput` (`6px 8px`) and `.labelInput` (`6px 8px`) stays — these are compact inline inputs within the milestone row, not standard form fields. The guide's `11px 14px` padding applies to standard form fields only. The background and radius changes still apply.

---

### `frontend/src/components/AutoSyncSettings.module.css`
**Groups:** H | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 37 | `.intervalSelect` | `background` | `var(--bg-root)` | `var(--bg-card)` | H |
| 40 | `.intervalSelect` | `border-radius` | `6px` | `var(--radius-md)` | H |
| 41 | `.intervalSelect` | `padding` | `6px 10px` | `11px 14px` | H |
| 51–53 | `.intervalSelect:focus` | Replace entire block | `outline: 2px solid var(--accent); outline-offset: 2px;` | `border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none;` | H |

Add forced-colors fallback after `.intervalSelect:focus`.

---

### Group I: Card Hover Border Glow (P1-5)

---

### `frontend/src/components/StatsCards.module.css`
**Groups:** I | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 22 (new) | `.card` | `transition` | _(absent)_ | `border-color var(--ease-smooth)` | I |
| (new) | `.card:hover` | `border-color` | _(absent)_ | `rgba(77,159,255,0.25)` | I |

**Details:** Add `transition: border-color var(--ease-smooth);` inside the existing `.card` rule (after line 23, before the closing brace). Add a new `.card:hover` rule after the `.card` block (after line 23 but before the `@media (min-width: 768px) .card` responsive rule at line 25).

Exact addition:
```css
/* add inside .card block, after border: 1px solid var(--border); */
transition: border-color var(--ease-smooth);

/* add new rule after .card block */
.card:hover {
  border-color: rgba(77,159,255,0.25);
}
```

---

### Group J: Letter-spacing — Headlines/Page Titles (P1-6)

---

### `frontend/src/pages/NetWorthPage.module.css`
**Groups:** J | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 13 (new) | `.pageTitle` | `letter-spacing` | _(absent)_ | `-0.3px` | J |

---

### `frontend/src/App.module.css`
**Groups:** J | **Parallelism:** independent

| Line | Selector | Property | Before | After | Group |
|------|----------|----------|--------|-------|-------|
| 56 (new) | `.appName` | `letter-spacing` | _(absent)_ | `-0.3px` | J |

---

### Group K: Hardcoded Transition Migration (A4)

Files not already covered above (GroupManager, GroupSnapshotControls, SetupPage covered in G/H sections):

---

### `frontend/src/components/GroupsTimeChart.module.css`
**Groups:** K | **Parallelism:** independent

| Line | Selector | Property | Before | After |
|------|----------|----------|--------|-------|
| 59 | `.chip` | `transition` | `all 0.15s` | `all var(--ease-quick)` |
| 70 | `.chipDot` | `transition` | `background 0.15s` | `background var(--ease-quick)` |

---

### `frontend/src/components/SyncControl.module.css`
**Groups:** K | **Parallelism:** independent

| Line | Selector | Property | Before | After |
|------|----------|----------|--------|-------|
| 129 | `.modeBtn` | `transition` | `background 0.15s` | `background var(--ease-quick)` |
| 148 | `.startBtn` | `transition` | `background 0.15s` | `background var(--ease-default)` |

**Note:** `.startBtn` maps to `--ease-default` (200ms) because it is the primary action CTA button for the sync operation. Per A4 table: "CTA buttons → `--ease-default`".

---

### `frontend/src/components/SyncHistory.module.css`
**Groups:** K | **Parallelism:** independent

| Line | Selector | Property | Before | After |
|------|----------|----------|--------|-------|
| 74 | `.td` | `transition` | `background 0.1s` | `background var(--ease-quick)` |

---

### `frontend/src/components/RangeSelector.module.css`
**Groups:** K | **Parallelism:** independent

| Line | Selector | Property | Before | After |
|------|----------|----------|--------|-------|
| 24 | `.rangeBtn` | `transition` | `all 0.15s` | `all var(--ease-quick)` |

---

### `frontend/src/components/BudgetTable.module.css`
**Groups:** K | **Parallelism:** independent

| Line | Selector | Property | Before | After |
|------|----------|----------|--------|-------|
| 155 | `.bar` | `transition` | `width 300ms ease` | `width var(--ease-smooth)` |

---

## Forced-Colors Accessibility Block (A3)

Each of the following files gets this block appended after their respective `:focus` rule. It is a one-time addition per file:

```css
@media (forced-colors: active) {
  .<inputSelector>:focus { outline: 2px solid; }
}
```

Files requiring this block:
- `BuilderRegionalData.module.css` — selector: `.fieldInput`
- `BuilderProfileForm.module.css` — selector: `.input`
- `RetirementPanel.module.css` — selector: `.input`
- `AIAnalysisPanel.module.css` — selector: `.input`
- `SetupPage.module.css` — selector: `.input`
- `GroupManager.module.css` — selector: `.input`
- `MilestoneEditor.module.css` — selectors: `.amountInput, .labelInput`
- `AutoSyncSettings.module.css` — selector: `.intervalSelect`
- `BudgetBuilderPage.module.css` — selector: `.monthSelect`

**Exceptions (no forced-colors block needed):**
- `GroupSnapshotControls.module.css` `.saveInput` — inline-edit exception per A3, no `box-shadow` added
- `BuilderResultsTable.module.css` `.cellInput` — inline table-cell exception per A3

---

## Dependency Order

```
Step 1 (prerequisite — must be merged before PR 2 starts):
  -> PR 1: index.css (all tokens including --ease-quick, --ease-default, --ease-smooth,
     --radius-md, --radius-btn-lg, --bg-card, --bg-root, --bg-surface already in place)

Step 2 (all 17 files fully parallel — no cross-file dependencies):
  -> Sidebar.module.css           (Group E)
  -> BottomTabBar.module.css      (Group F)
  -> BudgetBuilderPage.module.css (Group G+H+K)
  -> BuilderRegionalData.module.css (Group G+H)
  -> BuilderProfileForm.module.css (Group G+H)
  -> RetirementPanel.module.css   (Group G+H)
  -> AIAnalysisPanel.module.css   (Group G+H)
  -> SetupPage.module.css         (Group G+H+K)
  -> GroupManager.module.css      (Group G+H+K)
  -> BuilderResultsTable.module.css (Group G)
  -> BudgetPage.module.css        (Group G+J)
  -> GroupSnapshotControls.module.css (Group G+K)
  -> MilestoneEditor.module.css   (Group H)
  -> AutoSyncSettings.module.css  (Group H)
  -> StatsCards.module.css        (Group I)
  -> NetWorthPage.module.css      (Group J)
  -> App.module.css               (Group J)
```

Recommended parallelism for implementers: Spawn 3–4 agents, each taking a batch of files. No file appears in more than one batch.

**Suggested batches:**
- Batch 1 (navigation): Sidebar, BottomTabBar
- Batch 2 (buttons + inputs, form-heavy): BuilderRegionalData, BuilderProfileForm, RetirementPanel, AIAnalysisPanel, BuilderResultsTable
- Batch 3 (buttons + inputs, page-level): BudgetBuilderPage, SetupPage, GroupManager, BudgetPage, GroupSnapshotControls
- Batch 4 (card hover + letter-spacing + transitions): StatsCards, NetWorthPage, App, MilestoneEditor, AutoSyncSettings, GroupsTimeChart, SyncControl, SyncHistory, RangeSelector, BudgetTable

---

## Test Strategy

### Automated tests

```bash
make test
```

**Expected result:** All 454 existing tests pass. No new test failures.

**Why no breakage expected:** All changes are CSS-only. No JSX, no className changes, no DOM structure changes. `getByText` queries are unaffected because `text-transform: uppercase` in CSS does not modify DOM text content. The `color: var(--bg-root)` change on button text does not affect any test assertion.

**One exception to watch:** If any test uses `getComputedStyle` or inline style assertions, those could break. Search for this pattern before implementing:
```bash
grep -r "getComputedStyle\|toHaveStyle" frontend/src --include="*.test.*"
```

### Verification commands (post-implementation)

Confirm no remaining hardcoded transition values:
```bash
grep -rn "transition:.*0\.[0-9]s\|transition:.*[0-9]ms ease\b" frontend/src --include="*.module.css"
```
Expected: zero matches (only `var(--ease-*)` token references remain, and `.bar`'s `300ms ease` is now a token).

Confirm no remaining `color: white` (bare) in module files:
```bash
grep -rn "color: white\b" frontend/src --include="*.module.css"
```
Expected: zero matches.

Confirm no remaining `color: var(--white)` on button-type selectors:
```bash
grep -n "color: var(--white)" frontend/src/components/*.module.css frontend/src/pages/*.module.css
```
Expected: zero matches.

Confirm no remaining `outline: 2px solid var(--accent)` in standard inputs:
```bash
grep -rn "outline: 2px solid var(--accent)" frontend/src --include="*.module.css"
```
Expected: zero matches (only `@media (forced-colors: active)` blocks should have `outline: 2px solid` with no variable).

Confirm `backdrop-filter` added to BottomTabBar:
```bash
grep -n "backdrop-filter" frontend/src/components/BottomTabBar.module.css
```
Expected: 2 matches (the prefixed and unprefixed lines).

---

## Visual QA Checklist

After implementation, the `playwright-qa` agent should exercise these states:

### Navigation

- [ ] **Sidebar nav items** (desktop): Text is `11px`, visually smaller/lighter than current. Active item has cobalt `border-left` + `#1C2333` background + `#4D9FFF` text (not `#7DBFFF`). Hover state shows `#111827` background (slightly lighter than sidebar `#0E1423`).
- [ ] **Sidebar padding**: Active and inactive items have identical horizontal position (no layout shift on activation — the `border-left: 3px solid transparent` holds space).
- [ ] **BottomTabBar** (mobile / narrow viewport): Background shows frosted glass effect (blurred content visible beneath on supported browsers). Active tab icon/label is cobalt `#4D9FFF`, inactive is `#4A6080`.

### Buttons

- [ ] **All primary buttons**: Dark text (`#0A0F1E`) on cobalt background. Letters are uppercase. Letter-spacing creates airy feel.
- [ ] **Primary button hover**: Background becomes `#7DBFFF` (lighter cobalt), not `#2B7FE0` (darker). Verify on Setup page login button specifically (was using wrong hover).
- [ ] **`.rangeBtnActive`** on Budget page: Dark text on cobalt, not white.
- [ ] **`.saveConfirm`** on Groups page snapshot controls: Dark text on cobalt.

### Inputs

- [ ] **Focus state** (click into any text input): Cobalt `border-color` change visible + subtle `box-shadow` ring. No `outline` box artifact that ignores border-radius.
- [ ] **Input background**: All standard inputs show `#1C2333` (card color), not black/near-black.
- [ ] **Padding**: Inputs are taller (11px top/bottom vs old 7px) — forms look more spacious.
- [ ] **Labels above inputs**: `9px / uppercase / #4A6080` — noticeably small, muted eyebrow style.
- [ ] **Inline inputs** (`cellInput` in Budget Builder results table, `saveInput` in Groups snapshot): Unchanged — minimal, no box-shadow ring.
- [ ] **Windows High Contrast Mode** (if testable): Focus rings should appear as solid outlines.

### Cards

- [ ] **Stat cards** (Net Worth page): Subtle cobalt border glow on hover. Transition is smooth (`300ms`).

### Letter-spacing

- [ ] **Page titles** (Net Worth, Budgets, Budget Builder): Tight `-0.3px` tracking visible at larger font sizes.
- [ ] **Sidebar nav labels**: `0.3px` tracking — slightly airy.
- [ ] **Button text**: `1.5px` tracking — wide/spaced uppercase feel.

### Transitions (visual timing)

- [ ] **Nav/chip/row hover**: Snappy `150ms` response.
- [ ] **Button hover**: Slightly slower `200ms` fade.
- [ ] **Card border glow**: Smooth `300ms` fade-in on hover.
- [ ] **Budget progress bars**: Width animation is smooth `300ms` on data change.

---

## Rollback Notes

All changes are CSS-only. Rollback is `git revert <commit>` or `git checkout HEAD~1 -- frontend/src/components/*.module.css frontend/src/pages/*.module.css`. No data migrations. No backend changes. No test file changes.

If visual regressions are found in QA:
- **Sidebar padding looks unbalanced**: Adjust `padding-left` from `7px` to `8px` in `.navItem`. This is the risk noted in architecture (A6 mitigation).
- **Button uppercase text breaks layout**: Check for overflow or truncation. If a specific button's container is too narrow, that button may need `letter-spacing: 1px` instead of `1.5px`.
- **BottomTabBar frosted glass not visible**: Fallback `rgba(10,15,30,0.9)` is opaque enough — acceptable on browsers without `backdrop-filter` support.

---

## Corrections Log (Staff Review)

1. File count updated from 17 to 22 (multi-group files counted once; K-only files were missing from total).
2. Line number notes: Sidebar `.navLabel` ~line 50 (not 51), RetirementPanel `.btnPrimary` ~line 78 (not 77), AIAnalysisPanel `.btnPrimary` ~line 156 (not 155). Implementers should match by selector name, not line number alone.
3. AutoSyncSettings `.intervalSelect` background ~line 36, border-radius ~line 38. MilestoneEditor inputs off by 1 in several places.
4. SetupPage `.input` transition is a 17th hardcoded transition (A4 documented 16; this one was discovered during planning).
5. BudgetBuilderPage has no hardcoded transitions — K group assignment in dependency graph was an error (noted inline).
