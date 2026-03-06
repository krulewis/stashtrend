# Implementation Plan: Mobile Budgets vs. Actuals

**Date:** 2026-03-06
**Pipeline step:** Engineer — Final Plan (step 6)
**Source documents:** mobile-budgets-design-spec.md, mobile-budgets-architecture.md, docs/conventions.md, docs/architecture.md
**Staff review pass:** incorporated (14 findings — see "Staff Review Response" section at end)

---

## Overview

This plan implements a mobile-optimized Budget vs. Actuals experience that conditionally renders inside the existing `/budgets` route when `useResponsive().isMobile` is true. The desktop `BudgetPage` is unchanged. The mobile experience adds: a two-pane swipeable layout (month detail + monthly summary), collapsible budget groups with pill-shaped status indicators, drag-to-reorder within groups, a bottom sheet for cross-group category reassignment, and a `budget_custom_groups` SQLite table with two new API endpoints.

**Key data-flow change from initial plan (finding #4):** The budget data fetch is lifted to `BudgetPage`. `MobileBudgetPage` receives `budgetData` and `customGroups` as props instead of fetching independently. `BudgetPage` fetches both `fetchBudgetHistory` and `fetchCustomGroups` in `Promise.all` and passes results down.

**Implementation groupings:**

- **Group A (Backend):** DDL, two Flask endpoints — fully independent of frontend
- **Group B (Shared utilities):** `WARNING_THRESHOLD` extraction to `budgetUtils.js`, new `api.js` exports — independent of component work
- **Group C (Leaf components):** `BudgetPill`, `MonthDropdown`, `HorizontalSwipeContainer` — independent of each other; depend only on Group B
- **Group D (Composite components):** `BudgetLineItem`, `GroupAssignmentSheet` — depend on Group C (BudgetPill)
- **Group E (Container components):** `BudgetGroup`, `MonthDetailView`, `MonthlySummaryView` — depend on Group D
- **Group F (Page integration):** `MobileBudgetPage`, `BudgetPage` modification — depends on Group E. Note: `ViewIndicator` (dot nav) is rendered inline inside `HorizontalSwipeContainer` and `MonthSummaryHeader` is rendered inline inside `MonthDetailView` — neither is a separate file. This is intentional; both are small enough (~10 lines each) that separate files would add indirection without benefit.
- **Group G (Tests):** Backend tests can run in parallel with frontend. Frontend component tests can begin once interfaces are defined (after Group C is complete).

**New dependency to install in Phase 1 before component implementation begins:**

```
cd frontend && npm install @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0
```

Add both to `frontend/package.json` `dependencies` (not devDependencies — needed at runtime).

---

## Changes

---

### Group A: Backend (independent of all frontend work)

---

```
File: backend/app.py
Lines: 161–174 (DASHBOARD_DDL, after retirement_settings table), ~1222 (after budget_history endpoint)
Parallelism: independent
Description: Add budget_custom_groups table DDL and two new Flask endpoints.
Details:
  - In DASHBOARD_DDL (currently line 92–174), append the new table definition
    after the retirement_settings block and before the closing triple-quote:

      CREATE TABLE IF NOT EXISTS budget_custom_groups (
        category_id  TEXT PRIMARY KEY,
        custom_group TEXT NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );

  - Add two route handlers after the budget_history endpoint (currently ending
    at ~line 1222). Place them under a new section comment:

      # ===========================================================================
      # BUDGETS  — Custom group assignments
      # ===========================================================================

  - GET /api/budgets/custom-groups handler:
    - Use get_db_connection() context manager (matches existing pattern at line 185)
    - Query: SELECT category_id, custom_group, sort_order FROM budget_custom_groups
             ORDER BY custom_group, sort_order
    - Build response dict: group name -> list of {category_id, sort_order}
    - Return jsonify({"groups": groups_dict})

  - POST /api/budgets/custom-groups handler:
    - Accept JSON body: {"groups": {"Group Name": [{"category_id": "...", "sort_order": N}, ...]}}
    - Validation (return 400 on failure):
        * body must be a dict with "groups" key
        * each category_id must be a non-empty string
        * each custom_group name must be a non-empty string (strip whitespace)
        * each sort_order must be a non-negative integer
        * total row count must not exceed 500 (safety limit per architecture doc)
    - Transfer category filtering: skip rows where the category's group_type is 'transfer'
      (defensive filter — categories table has this field; add:
       AND c.group_type != 'transfer' to any JOIN queries, or filter in Python
       when building the groups dict from saved custom_groups rows)
      Note: the POST endpoint saves whatever the client sends — the filter applies
      at GET time when building the response, to prevent orphaned transfer entries
      from surfacing in the UI if they were saved before this filter existed.
    - Implementation: DELETE FROM budget_custom_groups; INSERT ... executed in a
      single transaction using conn.execute("BEGIN") / conn.commit()
    - Return jsonify({"status": "ok", "count": N}) where N is total rows inserted
    - Use get_db_connection() context manager; generic error messages only
      (app.logger.exception() + return jsonify({"error": "Internal server error"}), 500)

  - Security note: no AI calls, no rate limiting needed for these endpoints.
    Input validation already covers injection risk (parameterized queries only).
```

---

### Group B: Shared Utilities (independent)

---

```
File: frontend/src/utils/budgetUtils.js
Lines: new file
Parallelism: independent
Description: Extract WARNING_THRESHOLD constant and budget utility functions to a
shared location so BudgetTable.jsx and BudgetPill.jsx import from the same source.
Note: WARNING_THRESHOLD = 0.85 is defined here rather than in chartUtils.jsx because
chartUtils.jsx is a Recharts-oriented module with SVG color constants. budgetUtils.js
is the correct home for budget-domain logic that is consumed by both table and pill
components. The value is identical (0.85) and the import path is explicit in both
consumers, eliminating any ambiguity.
Details:
  - Create new file frontend/src/utils/budgetUtils.js (create utils/ directory
    if it does not exist)
  - Content:

      /** Shared budget calculation constants and utilities. */

      /**
       * Ratio threshold above which a category is considered "approaching limit".
       * Same value as WARNING_THRESHOLD formerly in BudgetTable.jsx and
       * referenced in chartUtils.jsx. Defined here (not in chartUtils.jsx) because
       * chartUtils.jsx is Recharts-specific; this module is budget-domain logic.
       * Value: 0.85 — categories spending >= 85% of budget show the warning zone.
       */
      export const WARNING_THRESHOLD = 0.85

      /**
       * Compute the status zone for a budget ratio.
       *
       * Zone rules:
       *   - Both actual AND budgeted are null/undefined → 'no-data'
       *     (distinct from 'no-budget': this means we have no data at all for
       *      this category in this month, not merely that a budget was not set)
       *   - budgeted is null, undefined, or 0 but actual has a value → 'no-budget'
       *     (spending recorded but no budget limit configured)
       *   - actual is null/undefined but budgeted > 0 → 'safe'
       *     (budget is set but nothing spent yet; $0 of $N = 0% = safe)
       *   - actual / budgeted > 1.0 → 'over'
       *   - actual / budgeted >= WARNING_THRESHOLD → 'warning'
       *   - otherwise → 'safe'
       *
       * @param {number|null|undefined} actual
       * @param {number|null|undefined} budgeted
       * @returns {'safe'|'warning'|'over'|'no-budget'|'no-data'}
       */
      export function getBudgetZone(actual, budgeted) {
        const hasActual   = actual   != null
        const hasBudgeted = budgeted != null && budgeted !== 0

        if (!hasActual && !hasBudgeted) return 'no-data'
        if (!hasBudgeted) return 'no-budget'         // actual may or may not be present
        // budgeted > 0 from here on
        const safeActual = actual ?? 0               // null actual with real budget → treat as $0 spent
        const ratio = safeActual / budgeted
        if (ratio > 1.0)               return 'over'
        if (ratio >= WARNING_THRESHOLD) return 'warning'
        return 'safe'
      }

      /**
       * Build an accessible aria-label string for a pill element.
       * Uses fmtDollar-style formatting: "$1,234" with no cents (rounded).
       * @param {number|null} actual
       * @param {number|null} budgeted
       * @param {string} zone  — return value of getBudgetZone()
       * @returns {string}
       */
      export function getPillAriaLabel(actual, budgeted, zone) {
        // Helper: format dollar amount as "$1,234" (no cents, locale-aware)
        const fmt = (n) => `$${Math.round(n ?? 0).toLocaleString('en-US')}`
        if (zone === 'no-data')   return 'No budget data'
        if (zone === 'no-budget') return `${fmt(actual)} spent, no budget set`
        const pct    = Math.round(((actual ?? 0) / budgeted) * 100)
        const status = zone === 'over'    ? 'over budget'
                     : zone === 'warning' ? 'approaching limit'
                     : 'within budget'
        return `${fmt(actual)} of ${fmt(budgeted)} budget, ${pct}%, ${status}`
      }
```

```
File: frontend/src/components/BudgetTable.jsx
Lines: ~6 (WARNING_THRESHOLD constant)
Parallelism: depends-on: frontend/src/utils/budgetUtils.js
Description: Replace local WARNING_THRESHOLD declaration with import from budgetUtils.
Details:
  - Remove line ~6: `const WARNING_THRESHOLD = 0.85`
  - Add import at top of file (after existing imports):
      import { WARNING_THRESHOLD } from '../utils/budgetUtils.js'
  - No other changes to BudgetTable.jsx — all other logic is unchanged.
  - Existing tests must continue to pass after this mechanical change.
```

```
File: frontend/src/api.js
Lines: after fetchBudgetHistory export
Parallelism: independent
Description: Add two new named exports for custom groups API calls.
Details:
  - After the fetchBudgetHistory export, add within the Budget section:

      export const fetchCustomGroups = () => fetchJSON('/api/budgets/custom-groups')
      export const saveCustomGroups  = (data) => postJSON('/api/budgets/custom-groups', data)

  - Pattern matches existing exports: fetchJSON for GET (no body), postJSON for POST.
  - The `postJSON` helper already calls mutateJSON with 'POST' method.
  - No changes to other exports; existing tests must continue to pass.
```

---

### Group C: Leaf Components (independent of each other, depends on Group B)

---

```
File: frontend/src/components/mobile/BudgetPill.jsx
Lines: new file
Parallelism: independent (within Group C)
Description: Shared pill component used in BudgetLineItem, BudgetGroup aggregate,
MonthSummaryHeader (inline in MonthDetailView), and MonthlySummaryView SummaryRow.
Displays actual/budget with color-coded zone styling.
Details:
  - Props: { actual, budgeted, size } where size is 'standard' (default) | 'summary'
  - Import { getBudgetZone, getPillAriaLabel } from '../../utils/budgetUtils.js'
  - Compute zone via getBudgetZone(actual, budgeted)
  - Render a <div role="status" aria-label={getPillAriaLabel(actual, budgeted, zone)} className={...}>
  - Display text:
      * zone === 'no-data':   "---"
      * zone === 'no-budget': `${fmtDollar(actual ?? 0)} / ---`
      * otherwise:            `${fmtDollar(actual ?? 0)} / ${fmtDollar(budgeted)}`
    Note: fmtDollar is imported from '../chartUtils.jsx' (already exported). This
    ensures dollar formatting is consistent across the entire app (finding #12).
  - CSS class selection (via CSS Modules):
      * base class: styles.pill (always)
      * zone class: styles.safe | styles.warning | styles.over | styles.noBudget | styles.noData
      * size class: styles.summary (when size === 'summary')
  - white-space: nowrap on the text (never wraps dollar amounts)
  - PropTypes:
      BudgetPill.propTypes = {
        actual:   PropTypes.number,
        budgeted: PropTypes.number,
        size:     PropTypes.oneOf(['standard', 'summary']),
      }
```

```
File: frontend/src/components/mobile/BudgetPill.module.css
Lines: new file
Parallelism: independent (within Group C)
Description: Styles for BudgetPill — dimensions, color zones, typography.
Details:
  - .pill base styles:
      display: inline-flex; align-items: center; justify-content: center;
      height: 28px; min-width: 100px; padding: 0 var(--sp-3);
      border-radius: var(--radius-pill); white-space: nowrap;
      font-size: 13px; font-weight: 500;
  - .summary size modifier:
      height: 32px; min-width: 120px; padding: 0 var(--sp-4); font-size: 14px;
  - Zone color classes (use color-mix() matching existing .barSafe/.barWarn/.barOver
    pattern in BudgetTable.module.css):
      .safe    { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); }
      .warning { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--amber); }
      .over    { background: color-mix(in srgb, var(--red)   18%, transparent); color: var(--red);   }
      .noBudget { background: var(--bg-raised); color: var(--text-muted); }
      .noData   { background: var(--bg-raised); color: var(--text-faint); }
  - Loading shimmer placeholder (.pillLoading):
      background: var(--bg-raised); border-radius: var(--radius-pill);
      width: 100px; height: 28px;
      animation: shimmer 1.5s ease-in-out infinite;
      @keyframes shimmer: opacity oscillates 0.4 -> 1 -> 0.4
  - Reduced motion: @media (prefers-reduced-motion: reduce) { .pillLoading { animation: none; } }
```

```
File: frontend/src/components/mobile/MonthDropdown.jsx
Lines: new file
Parallelism: independent (within Group C)
Description: Scrollable month selector with combobox ARIA pattern.
Details:
  - Props: { months, selectedMonth, onSelect }
      * months: array of ISO date strings sorted most-recent-first (e.g. "2025-12-01")
      * selectedMonth: string | null
      * onSelect: (monthString) => void
  - State: isOpen (boolean)
  - Refs: containerRef (for click-outside), listboxRef (for scrollIntoView on open),
    triggerRef (for focus return on close)
  - Month label format: toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    applied to new Date(m + 'T00:00:00') to avoid timezone shift
  - Click-outside listener: useEffect adds/removes 'mousedown' event on document;
    closes dropdown if click target is not inside containerRef.current
  - Escape key: useEffect on isOpen adds 'keydown' listener; closes + returns focus
    to trigger button
  - Arrow key navigation inside open listbox: ArrowDown/ArrowUp move focus between
    option elements; handled via onKeyDown on the listbox element
  - On open: scroll the selected option into view via ref.scrollIntoView({ block: 'nearest' })
  - On close: focus returns to triggerRef.current
  - ARIA markup:
      trigger: role="combobox" aria-expanded={isOpen} aria-haspopup="listbox"
               aria-controls="month-listbox-id"
      listbox: role="listbox" id="month-listbox-id"
      options:  role="option" aria-selected={m === selectedMonth}
  - PropTypes:
      MonthDropdown.propTypes = {
        months:        PropTypes.arrayOf(PropTypes.string).isRequired,
        selectedMonth: PropTypes.string,
        onSelect:      PropTypes.func.isRequired,
      }
```

```
File: frontend/src/components/mobile/MonthDropdown.module.css
Lines: new file
Parallelism: independent (within Group C)
Description: Styles for the month dropdown trigger and panel.
Details:
  - .trigger: full width, 44px height, flex row space-between,
      background: var(--bg-card), border: 1px solid var(--border),
      border-radius: var(--radius-md), padding: 0 var(--sp-4), cursor: pointer
  - .triggerOpen: border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent)
    (matches PR2 input focus standard from conventions.md)
  - .label: font-size 15px, font-weight 400, color: var(--text-primary)
  - .chevron: font-size 12px, color: var(--text-muted);
      transition: transform var(--ease-default);
  - .chevronOpen: transform: rotate(180deg)
  - .container: position: relative (parent of both trigger and panel)
  - .panel: position absolute, top: calc(100% + 2px), left 0, right 0,
      max-height: 280px, overflow-y: auto, -webkit-overflow-scrolling: touch,
      background: var(--bg-card), border: 1px solid var(--border),
      border-radius: 0 0 var(--radius-md) var(--radius-md),
      box-shadow: var(--shadow-lg), z-index: 25
  - .option: height 44px, padding 0 var(--sp-4), display flex align-items center,
      font-size 14px, color var(--text-primary), cursor pointer,
      border-bottom: 1px solid var(--border-sub) (last-child: none)
  - .optionSelected: background var(--accent-tint), color var(--accent), font-weight 500
  - .option:active: background var(--bg-hover)
  - Reduced motion: no transition overrides needed (dropdown open/close uses visibility,
    not an animated transition in the base implementation)
```

```
File: frontend/src/components/mobile/HorizontalSwipeContainer.jsx
Lines: new file
Parallelism: independent (within Group C)
Description: CSS scroll-snap wrapper for two panes with inline dot indicators (ViewIndicator).
Note: dot indicators are rendered inline in this file as a sibling <div> — they are not
extracted to a separate ViewIndicator component because they are tightly coupled to the
container's scroll state and add only ~15 lines. A separate file would be indirection
without benefit.
Details:
  - Props: { children, activeIndex, onIndexChange, isLocked }
      * children: exactly 2 React children (the two view panes)
      * activeIndex: 0 | 1 (controlled by parent — BudgetPage)
      * onIndexChange: (index: number) => void
      * isLocked: boolean — when true (reorder mode), overflow-x becomes hidden
  - Refs: containerRef on the scroll element, isScrollingRef (useRef(false)) to
    prevent the scroll/state feedback loop during programmatic scrollTo calls.
  - scroll event handler on the container:
      const handleScroll = (e) => {
        if (isScrollingRef.current) return   // ignore scroll events fired by our own scrollTo
        const index = Math.round(e.target.scrollLeft / e.target.clientWidth)
        onIndexChange(index)
      }
  - Programmatic scroll when activeIndex changes (useEffect on [activeIndex]):
      isScrollingRef.current = true
      containerRef.current?.scrollTo({
        left: activeIndex * containerRef.current.clientWidth,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      })
      // Clear the flag after scroll animation completes (~300ms typical)
      const t = setTimeout(() => { isScrollingRef.current = false }, 400)
      return () => clearTimeout(t)
    Note: month switching is pure client-side filtering — no fetch is triggered by
    activeIndex changes. The abort controller from the initial plan draft is not needed
    and is intentionally omitted here.
  - Each child is wrapped in a <div className={styles.pane}> with
    role="tabpanel" aria-labelledby={`view-tab-${index}`}
  - Dot indicators (ViewIndicator — rendered inline, not a separate file):
      <div role="tablist" className={styles.dots}>
        {[0, 1].map(i => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={i === 0 ? 'Month detail view' : 'Monthly summary view'}
            id={`view-tab-${i}`}
            className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ''}`}
            onClick={() => { onIndexChange(i) }}
          />
        ))}
      </div>
  - PropTypes:
      HorizontalSwipeContainer.propTypes = {
        children:      PropTypes.node.isRequired,
        activeIndex:   PropTypes.number.isRequired,
        onIndexChange: PropTypes.func.isRequired,
        isLocked:      PropTypes.bool,
      }
```

```
File: frontend/src/components/mobile/HorizontalSwipeContainer.module.css
Lines: new file
Parallelism: independent (within Group C)
Description: Scroll-snap container and dot indicator styles.
Details:
  - .container: display flex, overflow-x auto, scroll-snap-type x mandatory,
      -webkit-overflow-scrolling touch, scrollbar-width none, height 100%
  - .container::-webkit-scrollbar: display none
  - .containerLocked: overflow-x hidden (applied when isLocked is true)
  - .pane: flex 0 0 100%, width 100%, min-width 0, scroll-snap-align start,
      overflow-y auto
  - .dots: position fixed,
      bottom calc(56px + env(safe-area-inset-bottom, 0px) + var(--sp-3)),
      left 0, right 0, display flex, justify-content center, gap var(--sp-2),
      z-index 5, pointer-events none
  - .dot: width 44px, height 44px, border none, background transparent, cursor pointer,
      display inline-flex, align-items center, justify-content center,
      pointer-events all
    (44px touch target wraps the 8px visual circle via ::before pseudo-element)
  - .dot::before: content '', width 8px, height 8px, border-radius 50%,
      background var(--text-faint), display block
  - .dotActive::before: background var(--accent)
  - @media (prefers-reduced-motion: reduce): .container { scroll-behavior: auto; }
```

---

### Group D: Composite Components (depends on Group C — BudgetPill must exist)

---

```
File: frontend/src/components/mobile/BudgetLineItem.jsx
Lines: new file
Parallelism: independent (within Group D)
Description: Single budget category row. Displays category name + BudgetPill.
In reorder mode shows a drag handle on the left. Uses @dnd-kit/sortable
for drag-and-drop within groups.
Details:
  - This component is used inside a @dnd-kit SortableContext (set up in BudgetGroup).
  - Import { useSortable } from '@dnd-kit/sortable'
  - Import { CSS } from '@dnd-kit/utilities'
  - Import BudgetPill from './BudgetPill.jsx'
  - Props: { actual, budgeted } are flat numbers extracted by the parent (BudgetGroup
    via MonthDetailView) for the currently selected month — NOT nested month objects.
    BudgetLineItem has no knowledge of month selection.
    PropTypes:
      BudgetLineItem.propTypes = {
        categoryId:    PropTypes.string.isRequired,
        categoryName:  PropTypes.string.isRequired,
        actual:        PropTypes.number,   // flat value for selected month
        budgeted:      PropTypes.number,   // flat value for selected month
        isReorderMode: PropTypes.bool,
        onMoveRequest: PropTypes.func,     // called with categoryId to open sheet
      }
  - useSortable usage:
      const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: categoryId })
      const style = { transform: CSS.Transform.toString(transform), transition }
  - When isDragging: apply styles.dragging CSS class
    (elevated look: bg-hover, shadow-md, opacity 0.9, scale 1.02)
  - Drag handle element (visible only when isReorderMode):
      <div className={styles.dragHandle} {...listeners} aria-roledescription="sortable item">
        <span aria-hidden="true">⠿</span>  {/* braille hamburger visual */}
      </div>
  - Move icon button (right side, reorder mode only): tapping calls onMoveRequest(categoryId)
      aria-label={`Move ${categoryName} to a different group`}
  - Category name truncation: max-width calc(100% - 140px), overflow hidden,
    text-overflow ellipsis, white-space nowrap
  - Min-height: 48px (WCAG touch target)
  - :active background: var(--bg-hover) via CSS :active pseudo-class
  - Reduced motion: @media (prefers-reduced-motion: reduce) { .dragging { transition: none; } }
```

```
File: frontend/src/components/mobile/BudgetLineItem.module.css
Lines: new file
Parallelism: independent (within Group D)
Description: Line item row styles.
Details:
  - .row: display flex, align-items center, min-height 48px, padding 0 var(--sp-4),
      gap var(--sp-3), border-bottom 1px solid var(--border-sub), position relative
  - .row:last-child: border-bottom none
  - .row:active: background var(--bg-hover)
  - .dragHandle: width 24px, min-height 48px, display flex, align-items center,
      justify-content center, color var(--text-muted), cursor grab, touch-action none,
      flex-shrink 0
  - .categoryName: flex 1, font-size 14px, color var(--text-primary), font-weight 400,
      overflow hidden, text-overflow ellipsis, white-space nowrap,
      max-width calc(100% - 140px)
  - .pill: flex-shrink 0
  - .moveBtn: margin-left auto, flex-shrink 0, background transparent, border none,
      color var(--text-muted), font-size 16px, padding var(--sp-2),
      min-width 44px, min-height 44px, cursor pointer
  - .dragging: background var(--bg-hover), box-shadow var(--shadow-md),
      opacity 0.9, z-index 10
  - @media (prefers-reduced-motion: reduce): .dragging { transition: none; transform: none; }
```

```
File: frontend/src/components/mobile/GroupAssignmentSheet.jsx
Lines: new file
Parallelism: independent (within Group D)
Description: Bottom sheet for moving a category to a different group.
Uses native <dialog> element for accessibility (focus trap + Escape).
Details:
  - Props:
      GroupAssignmentSheet.propTypes = {
        isOpen:          PropTypes.bool.isRequired,
        categoryName:    PropTypes.string,
        currentGroup:    PropTypes.string,
        availableGroups: PropTypes.arrayOf(PropTypes.string).isRequired,
        onMove:          PropTypes.func.isRequired,   // (targetGroup: string) => void
        onClose:         PropTypes.func.isRequired,
        triggerRef:      PropTypes.object,  // React ref to the element that opened sheet
      }
  - Implementation uses <dialog> element:
      * ref: dialogRef
      * On isOpen change: dialogRef.current.showModal() / close()
      * <dialog> styled as bottom sheet via CSS (position fixed bottom 0, full width,
        border-radius top corners, no default dialog centering)
      * dialogRef.current.addEventListener('cancel', onClose) handles Escape key natively
      * ::backdrop styled via CSS module for the scrim
  - Local state:
      * selectedGroup (string) — currently selected radio option, init to currentGroup
      * newGroupName (string) — value of the "create new group" input
      * isCreatingNew (boolean) — shows text input instead of "+ Create new group" row
  - On open (useEffect on isOpen):
      * Reset selectedGroup to currentGroup
      * Reset isCreatingNew to false
      * Body scroll lock: document.body.style.overflow = 'hidden' (restore on close)
      * Focus management: focus sheet heading on open; on close, return focus to
        triggerRef.current (or saved document.activeElement before open)
  - Swipe-to-dismiss on the drag indicator bar:
      * Track touchstart / touchmove / touchend on the indicator bar
      * If net downward swipe > 80px: call onClose()
  - Move button disabled state: selectedGroup === currentGroup && !newGroupName
  - On Move tap: call onMove(isCreatingNew ? newGroupName.trim() : selectedGroup); onClose()
  - ARIA:
      * The <dialog> element provides implicit role="dialog" and aria-modal semantics
        when opened via showModal() — do NOT add a redundant role="dialog" attribute.
      * dialog: aria-labelledby="sheet-title-id"  (no explicit role attr needed)
      * heading: id="sheet-title-id"
      * Radio group container: role="radiogroup" aria-label="Select group"
      * Each group option: role="radio" aria-checked={selectedGroup === groupName}
        (not listbox/option — radiogroup/radio is semantically correct for
         single-select lists and is better supported by mobile screen readers)
  - Tab cycling within sheet: native <dialog> showModal() provides this automatically
```

```
File: frontend/src/components/mobile/GroupAssignmentSheet.module.css
Lines: new file
Parallelism: independent (within Group D)
Description: Bottom sheet styles using CSS transforms.
Details:
  - dialog element override (targeting the <dialog> tag):
      position: fixed; inset: 0; margin: 0; padding: 0; width: 100%; height: auto;
      max-height: 60vh; border: none; border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      background: var(--bg-card); box-shadow: var(--shadow-lg);
      bottom: 0; top: auto;  /* anchor to bottom */
      transform: translateY(100%); transition: transform var(--ease-smooth);
  - dialog[open] override:
      transform: translateY(0);
  - ::backdrop override:
      background: rgba(0, 0, 0, 0.5);
  - .indicator: width 40px, height 4px, border-radius var(--radius-pill),
      background var(--text-faint), margin 12px auto 8px auto
  - .title: font-size 15px, font-weight 500, color var(--text-primary),
      padding var(--sp-4), margin 0
  - .groupList: list-style none, padding 0, margin 0, overflow-y auto
  - .groupItem: height 48px, display flex, align-items center, gap var(--sp-3),
      padding 0 var(--sp-4), cursor pointer
  - .groupItem:active: background var(--bg-hover)
  - .radio: width 16px, height 16px, border-radius 50%, flex-shrink 0,
      border 2px solid var(--text-muted)
  - .radioSelected: border-color var(--accent), background var(--accent)
  - .groupName: font-size 14px, color var(--text-primary)
  - .groupNameCurrent: color var(--text-muted), font-size 12px, margin-left var(--sp-2)
  - .createRow: height 48px, display flex, align-items center, gap var(--sp-2),
      padding 0 var(--sp-4), color var(--accent), font-size 14px, cursor pointer,
      border-top 1px solid var(--border-sub)
  - .createInput: flex 1, background var(--bg-inset), border 1px solid var(--border-focus),
      border-radius var(--radius-md), padding 11px 14px, font-size 14px,
      color var(--text-primary)
  - .buttons: display flex, gap var(--sp-3), padding var(--sp-4),
      border-top 1px solid var(--border)
  - .cancelBtn: flex 1, background transparent, border 1px solid var(--border),
      color var(--text-secondary), border-radius var(--radius-md), padding 10px 20px
  - .moveBtn: flex 1, background var(--accent), color var(--bg-root),
      border none, border-radius var(--radius-md), padding 10px 20px,
      text-transform uppercase, letter-spacing 1.5px, font-weight 600
  - .moveBtn:disabled: opacity 0.5, cursor not-allowed
  - .saveError: font-size 13px, color var(--red), padding var(--sp-2) var(--sp-4),
      text-align center
  - @media (prefers-reduced-motion: reduce): dialog { transition: none; }
```

---

### Group E: Container Components (depends on Group D)

---

```
File: frontend/src/components/mobile/BudgetGroup.jsx
Lines: new file
Parallelism: independent (within Group E)
Description: Collapsible group card containing a GroupHeader and list of BudgetLineItems.
In reorder mode all groups are forced expanded and @dnd-kit SortableContext is active.
Details:
  - Props:
      BudgetGroup.propTypes = {
        groupName:    PropTypes.string.isRequired,
        categories:   PropTypes.arrayOf(PropTypes.shape({
          category_id:   PropTypes.string.isRequired,
          category_name: PropTypes.string.isRequired,
          actual:        PropTypes.number,   // flat value for selected month
          budgeted:      PropTypes.number,   // flat value for selected month
        })).isRequired,
        isReorderMode: PropTypes.bool,
        onReorder:     PropTypes.func,  // (groupName, newCategoryIds: string[]) => void
        onMoveRequest: PropTypes.func,  // (categoryId) => void
      }
    Note: categories prop contains flat { actual, budgeted } values already extracted
    for the selected month by MonthDetailView (via useMemo). BudgetGroup does NOT
    access month-keyed nested objects. MonthDetailView is responsible for extracting
    c.months?.[selectedMonth]?.actual and c.months?.[selectedMonth]?.budgeted into
    flat fields before building the categories array it passes to BudgetGroup.
  - Local state: isExpanded (boolean, default false)
  - When isReorderMode becomes true, force isExpanded = true via useEffect([isReorderMode])
  - Aggregate values for the group pill (computed from flat category values):
      groupActual   = categories.reduce((s, c) => s + (c.actual   ?? 0), 0)
      groupBudgeted = categories.reduce((s, c) => s + (c.budgeted ?? 0), 0)
    (no month lookup needed — values are already flat)
  - GroupHeader element:
      <div role="button" aria-expanded={isExpanded}
           aria-controls={`group-${groupName}-content`}
           onClick={isReorderMode ? undefined : () => setIsExpanded(e => !e)}
           className={styles.groupHeader} tabIndex={0}
           onKeyDown={(e) => {
             if (e.key === 'Enter' || e.key === ' ') {
               e.preventDefault(); setIsExpanded(prev => !prev)
             }
           }}>
        <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}>›</span>
        <span className={styles.groupName}>{groupName}</span>
        <BudgetPill actual={groupActual} budgeted={groupBudgeted} size="standard" />
      </div>
  - Content area uses grid-template-rows animation pattern (from design spec section 4):
      <div className={`${styles.groupContent} ${isExpanded ? styles.groupContentExpanded : ''}`}>
        <div className={styles.groupContentInner} id={`group-${groupName}-content`}
             role="region" aria-labelledby={`group-${groupName}-header`}>
          <SortableContext items={categories.map(c => c.category_id)}
                           strategy={verticalListSortingStrategy}>
            {categories.map(cat => (
              <BudgetLineItem key={cat.category_id}
                categoryId={cat.category_id}
                categoryName={cat.category_name}
                actual={cat.actual}
                budgeted={cat.budgeted}
                isReorderMode={isReorderMode}
                onMoveRequest={onMoveRequest} />
            ))}
          </SortableContext>
        </div>
      </div>
  - DragEndEvent handler: only active when isReorderMode; calls onReorder(groupName, newOrder)
    using arrayMove from @dnd-kit/sortable
  - SortableContext and DnDContext are set up in BudgetGroup itself (scoped per group so
    items can only be reordered within their group, matching constraint in spec section 7)
  - DndContext uses TouchSensor with activationConstraint: { distance: 8 }
    to prevent accidental drags during normal scroll
```

```
File: frontend/src/components/mobile/BudgetGroup.module.css
Lines: new file
Parallelism: independent (within Group E)
Description: Group card and animation styles.
Details:
  - .card: background var(--bg-card), border 1px solid var(--border),
      border-radius var(--radius-lg), overflow hidden
  - .groupHeader: display flex, align-items center, min-height 52px,
      padding 0 var(--sp-4), gap var(--sp-3), cursor pointer
  - .groupHeader:active: background var(--bg-hover)
  - .chevron: font-size 12px, color var(--text-muted),
      transition: transform var(--ease-default), display inline-block
  - .chevronExpanded: transform rotate(90deg)
  - .groupName: flex 1, font-size 15px, font-weight 500, color var(--text-primary),
      overflow hidden, text-overflow ellipsis, white-space nowrap
  - .groupContent: display grid, grid-template-rows 0fr,
      transition grid-template-rows var(--ease-smooth), overflow hidden
  - .groupContentExpanded: grid-template-rows 1fr
  - .groupContentInner: min-height 0 (required for 0fr collapse to work)
  - @media (prefers-reduced-motion: reduce):
      .groupContent { transition: none; }
      .chevron      { transition: none; }
```

```
File: frontend/src/components/mobile/MonthDetailView.jsx
Lines: new file
Parallelism: depends-on: frontend/src/components/mobile/BudgetGroup.jsx
Description: View 1 pane — month dropdown, summary header (MonthSummaryHeader rendered
inline here, not a separate file), collapsible group list, and Edit Groups / Done button.
Note: MonthSummaryHeader is ~12 lines of JSX within this file. Extracting it to a
separate file would add an import with no reuse benefit — it is intentionally inline.
Details:
  - Props:
      MonthDetailView.propTypes = {
        months:         PropTypes.arrayOf(PropTypes.string).isRequired,
        categories:     PropTypes.arrayOf(PropTypes.object).isRequired,
        customGroups:   PropTypes.object.isRequired,  // { "Group": [{category_id, sort_order}] }
        selectedMonth:  PropTypes.string,
        onMonthChange:  PropTypes.func.isRequired,
        isReorderMode:  PropTypes.bool,
        onEnterReorder: PropTypes.func.isRequired,
        onExitReorder:  PropTypes.func.isRequired,   // called with final groups state
        isSaving:       PropTypes.bool,
      }
  - Transfer category filter: before building groupedCategories, filter out
    expense categories where cat.group_type === 'transfer'. Apply:
      const expenseCategories = categories.filter(
        cat => cat.group_type !== 'income' && cat.group_type !== 'transfer'
      )
    This ensures transfers do not appear in the group list regardless of how
    category data arrives from the API.
  - Derive grouped and sorted category list via useMemo(fn, [categories, customGroups, selectedMonth]):
    1. Build a flat lookup: category_id -> custom_group + sort_order (from customGroups prop)
    2. For each category in expenseCategories, resolve effective group:
         custom entry if present, else cat.group_name || 'Other'
    3. Extract month values BEFORE grouping:
         For each category:
           actual   = cat.months?.[selectedMonth]?.actual   ?? null
           budgeted = cat.months?.[selectedMonth]?.budgeted ?? null
         Build the flat shape: { category_id, category_name, actual, budgeted, group_type }
    4. Group flattened categories by effective group name
    5. Within each group, sort by sort_order (custom) or maintain original array order (fallback)
    This ensures BudgetGroup receives flat { actual, budgeted } — not nested month objects.
  - MonthSummaryHeader (inline in this component — not a separate file):
      * Compute from the flat per-category data already derived above:
          totalExpenseActual   = sum of actual   for expense categories
          totalExpenseBudgeted = sum of budgeted for expense categories
          totalIncomeActual    = sum of actual   for income categories (cat.group_type === 'income')
          totalIncomeBudgeted  = sum of budgeted for income categories
      * Render two rows ("Total Expenses" + "Total Income"), each with BudgetPill size="standard"
  - Local state for draft reorder groups (only in reorder mode):
      const [draftGroups, setDraftGroups] = useState(null)
      When entering reorder mode (isReorderMode becomes true): setDraftGroups(deepCopy of customGroups)
      When exiting (Done tap): call handleDone(draftGroups)
  - handleDone:
      async function handleDone() {
        try {
          await onExitReorder(draftGroups)  // onExitReorder is BudgetPage.handleDone — async
        } catch (err) {
          setSaveError(err.message || 'Failed to save. Please try again.')
          // Do NOT exit reorder mode — keep draftGroups intact so user can retry
        }
      }
    Local state: const [saveError, setSaveError] = useState(null)
    Render saveError inline above the Done button when non-null:
      {saveError && <p className={styles.saveError} role="alert">{saveError}</p>}
    Clear saveError when entering reorder mode (useEffect on isReorderMode).
  - GroupAssignmentSheet state in this component:
      const [sheetOpen, setSheetOpen]             = useState(false)
      const [sheetCategoryId, setSheetCategoryId] = useState(null)
      Open sheet via onMoveRequest prop passed to BudgetGroup
  - "Edit Groups" / "Done" button:
      <button
        className={isReorderMode ? styles.doneBtn : styles.editBtn}
        onClick={isReorderMode ? handleDone : onEnterReorder}
        disabled={isSaving}
      >
        {isSaving ? <span className={styles.spinner} /> : isReorderMode ? 'Done' : 'Edit Groups'}
      </button>
```

```
File: frontend/src/components/mobile/MonthlySummaryView.jsx
Lines: new file
Parallelism: independent (within Group E — only depends on BudgetPill from Group C)
Description: View 2 pane — range dropdown (3/6/12 months) and list of monthly summary rows.
Details:
  - Props:
      MonthlySummaryView.propTypes = {
        months:     PropTypes.arrayOf(PropTypes.string).isRequired,
        categories: PropTypes.arrayOf(PropTypes.object).isRequired,
      }
  - Local state: rangeMonths (number, default 6)
  - RANGE_OPTIONS = [3, 6, 12]
  - RangeDropdown: a native <select> element styled to match design tokens
    (simpler than a custom dropdown for this functional, non-scrollable list of 3 options)
  - Display months: derive from props.months sliced to rangeMonths most recent
    (months array is already sorted most-recent-first per API behavior)
  - SummaryRow per month:
      * For each month string, compute totals:
          totalActual   = sum of cat.months?.[monthStr]?.actual   for expense categories
          totalBudgeted = sum of cat.months?.[monthStr]?.budgeted for expense categories
          (filter transfers: cat.group_type !== 'income' && cat.group_type !== 'transfer')
      * Render: month label left, BudgetPill right (size="summary")
      * Month label: toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      * Row: min-height 56px, full width, bg-card, border, radius-md
  - No click handlers — this is a read-only view
  - Empty state: if months.length === 0, show centered "No budget data available" text
```

---

### Group F: Page Integration (depends on Group E)

---

```
File: frontend/src/pages/MobileBudgetPage.jsx
Lines: new file
Parallelism: depends-on: all Group E components
Description: Top-level mobile page component. Receives budgetData and customGroups
as props from BudgetPage (data fetch is lifted to BudgetPage). Owns view-level state:
view index, reorder mode, isSaving. Renders HorizontalSwipeContainer with
MonthDetailView and MonthlySummaryView as the two panes.
Details:
  - Imports:
      import { useState, useMemo, useCallback } from 'react'
      import { saveCustomGroups } from '../api.js'
      import HorizontalSwipeContainer from '../components/mobile/HorizontalSwipeContainer.jsx'
      import MonthDetailView from '../components/mobile/MonthDetailView.jsx'
      import MonthlySummaryView from '../components/mobile/MonthlySummaryView.jsx'
      import styles from './MobileBudgetPage.module.css'

  - Props (received from BudgetPage — NO independent fetch):
      MobileBudgetPage.propTypes = {
        budgetData:   PropTypes.object,    // result of fetchBudgetHistory (may be null while loading)
        customGroups: PropTypes.object,    // result of fetchCustomGroups .groups (may be {})
        loading:      PropTypes.bool,
        error:        PropTypes.string,
        onGroupsSaved: PropTypes.func,     // (newGroups) => void — tells BudgetPage to update its state
      }

  - State (view-level only — data state lives in BudgetPage):
      const [selectedMonth, setSelectedMonth] = useState(null)
      const [activeView,    setActiveView]    = useState(0)       // 0 = detail, 1 = summary
      const [isReorderMode, setIsReorderMode] = useState(false)
      const [isSaving,      setIsSaving]      = useState(false)

  - Auto-select most recent month when budgetData arrives:
      useEffect(() => {
        if (budgetData?.months?.length > 0 && !selectedMonth) {
          setSelectedMonth(budgetData.months[budgetData.months.length - 1])
        }
      }, [budgetData])  // deps: [budgetData] only — isMobile NOT in deps, avoids refetch on resize

  - Months for dropdown (sorted most-recent-first for MonthDropdown):
      const monthsDesc = useMemo(() =>
        budgetData?.months ? [...budgetData.months].reverse() : []
      , [budgetData])

  - handleDone (called when user taps Done in reorder mode):
      async function handleDone(finalGroups) {
        setIsSaving(true)
        try {
          await saveCustomGroups({ groups: finalGroups })
          onGroupsSaved(finalGroups)   // update BudgetPage state
          setIsReorderMode(false)
        } catch (err) {
          // Error is displayed by MonthDetailView (saveError state)
          // Re-throw so MonthDetailView's catch block captures it
          throw err
        } finally {
          setIsSaving(false)
        }
      }

  - Loading state: centered spinner + "Loading budget data..."
  - Error state: error card matching existing BudgetPage pattern
    (errorBox / errorTitle / errorDetail)
  - Empty state (no months): centered message per spec section 10
  - Page structure:
      <div className={styles.page}>
        <HorizontalSwipeContainer activeIndex={activeView} onIndexChange={setActiveView}
            isLocked={isReorderMode}>
          <MonthDetailView months={monthsDesc} categories={budgetData.categories}
              customGroups={customGroups} selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth} isReorderMode={isReorderMode}
              onEnterReorder={() => setIsReorderMode(true)}
              onExitReorder={handleDone} isSaving={isSaving} />
          <MonthlySummaryView months={monthsDesc} categories={budgetData.categories} />
        </HorizontalSwipeContainer>
      </div>
```

```
File: frontend/src/pages/MobileBudgetPage.module.css
Lines: new file
Parallelism: depends-on: MobileBudgetPage.jsx (created together)
Description: Mobile page shell styles.
Details:
  - .page: height 100%, display flex, flex-direction column, background var(--bg-root),
      overflow hidden (scroll happens inside panes, not at page level)
  - .loading: flex 1, display flex, align-items center, justify-content center,
      flex-direction column, gap var(--sp-3), color var(--text-secondary), font-size 14px
  - .errorBox: margin var(--sp-4), padding var(--sp-4),
      background var(--bg-card), border 1px solid var(--red),
      border-radius var(--radius-lg)
  - .errorTitle: color var(--red), font-weight 500, margin-bottom var(--sp-2)
  - .errorDetail: color var(--text-secondary), font-size 13px
  - .emptyState: flex 1, display flex, align-items center, justify-content center,
      flex-direction column, gap var(--sp-2)
  - .emptyTitle: color var(--text-secondary), font-size 14px
  - .emptySubtitle: color var(--text-muted), font-size 13px
```

```
File: frontend/src/pages/BudgetPage.jsx
Lines: full file modification
Parallelism: depends-on: MobileBudgetPage.jsx
Description: Lift data fetch to BudgetPage. On mobile, pass budgetData and customGroups
as props to MobileBudgetPage instead of duplicating fetch logic. Desktop path unchanged.
Details:
  - Add imports at the top of the file:
      import { useResponsive } from '../hooks/useResponsive.js'
      import MobileBudgetPage from './MobileBudgetPage.jsx'
      import { fetchCustomGroups } from '../api.js'

  - All existing state declarations stay. Add two new state vars:
      const [customGroupsData, setCustomGroupsData] = useState({})

  - const { isMobile } = useResponsive() — placed after existing useState calls,
    before the useEffect (hooks must ALL be called before any conditional return).

  - Modify the existing useEffect (currently deps: [months]) to:
      useEffect(() => {
        if (isMobile) return   // guard inside effect body — avoids the refetch-on-resize
                                // problem that would occur if isMobile were in deps array
        setLoading(true)
        fetchBudgetHistory(months)
          .then(data => { setBudgetData(data); ... })
          .catch(...)
          .finally(...)
      }, [months])             // deps stay as [months] — isMobile is a guard, not a dep
      // Note: exhaustive-deps lint rule will flag isMobile missing from deps.
      // Suppress with: // eslint-disable-next-line react-hooks/exhaustive-deps
      // Justification: isMobile is intentionally excluded — adding it would cause
      // a re-fetch on every window resize. The guard inside is the correct pattern
      // for a one-time conditional skip.

  - Add a second useEffect for mobile custom groups fetch (separate from desktop fetch):
      useEffect(() => {
        if (!isMobile) return
        fetchCustomGroups()
          .then(result => setCustomGroupsData(result.groups ?? {}))
          .catch(() => {})   // custom groups failure is non-fatal; default to {}
      }, [isMobile])         // runs once when isMobile becomes true

  - Modify the existing incomeTotalsByMonth useMemo to guard isMobile:
      const incomeTotalsByMonth = useMemo(() => {
        if (isMobile || !budgetData?.categories) return null
        ...
      }, [budgetData, isMobile])

  - Conditional render — placed AFTER all hook calls:
      if (isMobile) {
        return (
          <MobileBudgetPage
            budgetData={budgetData}
            customGroups={customGroupsData}
            loading={loading}
            error={error}
            onGroupsSaved={setCustomGroupsData}
          />
        )
      }

  - All existing desktop JSX below the conditional return is unchanged.

  - Correct hook ordering summary:
      1. All useState (existing + customGroupsData)
      2. const { isMobile } = useResponsive()
      3. All useEffect (desktop fetch + mobile custom groups fetch)
      4. incomeTotalsByMonth useMemo (guarded)
      5. if (isMobile) return <MobileBudgetPage ... />
      6. return <div className={styles.page}>...</div>  (desktop)
```

---

## Dependency Order

```
Phase 1 (run in parallel — no dependencies between streams):
  Stream 1: backend/app.py — DDL + endpoints (Group A)
  Stream 2: budgetUtils.js (new) + api.js additions + BudgetTable.jsx import fix (Group B)
  Stream 3: cd frontend && npm install @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0

Phase 2 (after Phase 1 Stream 2 is complete — run in parallel within phase):
  Group C leaf components — all independent of each other:
  Stream 1: BudgetPill.jsx + BudgetPill.module.css
  Stream 2: MonthDropdown.jsx + MonthDropdown.module.css
  Stream 3: HorizontalSwipeContainer.jsx + HorizontalSwipeContainer.module.css

Phase 3 (after Phase 2 is complete — run in parallel within phase):
  Group D composite components:
  Stream 1: BudgetLineItem.jsx + BudgetLineItem.module.css
  Stream 2: GroupAssignmentSheet.jsx + GroupAssignmentSheet.module.css
  Stream 3: MonthlySummaryView.jsx (depends only on BudgetPill — can start in Phase 2 or 3)

Phase 4 (after Phase 3 Streams 1 is complete):
  BudgetGroup.jsx + BudgetGroup.module.css (depends on BudgetLineItem)

Phase 5 (after Phase 4 is complete):
  MonthDetailView.jsx (depends on BudgetGroup + GroupAssignmentSheet)

Phase 6 (after Phase 5 and Phase 3 Stream 3 are both complete):
  Stream 1: MobileBudgetPage.jsx + MobileBudgetPage.module.css
  (depends on MonthDetailView + MonthlySummaryView)

Phase 7 (after Phase 6):
  BudgetPage.jsx modification (depends on MobileBudgetPage.jsx existing)

Phase 8:
  Run full test suite: make test
```

**Optimized parallel schedule:**

| Time | Stream 1 | Stream 2 | Stream 3 |
|------|----------|----------|----------|
| P1 | Backend: app.py DDL + endpoints | budgetUtils.js + api.js + BudgetTable fix | npm install @dnd-kit |
| P2 | BudgetPill + CSS | MonthDropdown + CSS | HorizontalSwipeContainer + CSS |
| P3 | BudgetLineItem + CSS | GroupAssignmentSheet + CSS | MonthlySummaryView + CSS |
| P4 | BudgetGroup + CSS | — | — |
| P5 | MonthDetailView | — | — |
| P6 | MobileBudgetPage + CSS | — | — |
| P7 | BudgetPage.jsx modification | — | — |

---

## Test Strategy

### Backend Tests

```
File: backend/tests/test_budget_custom_groups.py
Parallelism: independent — can be written and run in parallel with frontend work
Tests:
  - test_get_custom_groups_empty: GET returns {"groups": {}} when table is empty
  - test_post_custom_groups_saves_data: POST with valid payload persists rows;
    subsequent GET returns same data in correct shape
  - test_post_custom_groups_replaces_all: POST twice — second call replaces first
    (full-state replacement, not append)
  - test_post_custom_groups_validates_empty_category_id: 400 if category_id is ""
  - test_post_custom_groups_validates_empty_group_name: 400 if custom_group is ""
  - test_post_custom_groups_validates_negative_sort_order: 400 if sort_order < 0
  - test_post_custom_groups_validates_max_500_rows: 400 if total rows > 500
  - test_post_custom_groups_handles_empty_groups: POST {"groups": {}} clears all rows
  - test_get_custom_groups_grouped_correctly: multi-group data returns correct group
    names with correct category ordering by sort_order
  - test_post_custom_groups_returns_count: response includes {"status": "ok", "count": N}

Pattern: Use test_helpers.make_test_db() which imports DASHBOARD_DDL — the new table
will be included automatically once added to DASHBOARD_DDL.
```

### Frontend Tests

```
File: frontend/src/utils/budgetUtils.test.js
Parallelism: independent — can be written immediately (pure functions)
Tests:
  - getBudgetZone_safe: ratio < 0.85 returns 'safe'
  - getBudgetZone_warning_at_threshold: ratio exactly 0.85 returns 'warning'
  - getBudgetZone_warning_below_1: ratio 0.99 returns 'warning'
  - getBudgetZone_over: ratio > 1.0 returns 'over'
  - getBudgetZone_no_budget_with_actual: budgeted=0, actual=50 → 'no-budget'
  - getBudgetZone_no_budget_null_with_actual: budgeted=null, actual=50 → 'no-budget'
  - getBudgetZone_no_data_both_null: actual=null, budgeted=null → 'no-data'
    (NOT 'no-budget' — both values absent means truly no data)
  - getBudgetZone_null_actual_positive_budget: actual=null, budgeted=100 → 'safe'
    ($0 of $100 spent = 0% = safe zone)
  - getPillAriaLabel: correct format for each zone
  - getPillAriaLabel_uses_locale_formatting: "$1,234 of $2,000 budget, 62%, within budget"
  - WARNING_THRESHOLD: exports value 0.85
```

```
File: frontend/src/components/mobile/BudgetPill.test.jsx
Parallelism: independent once BudgetPill.jsx exists (after Phase 2)
Tests:
  - renders_safe_zone: green color class when ratio < 0.85
  - renders_warning_zone: amber when 0.85 <= ratio <= 1.0
  - renders_over_zone: red when ratio > 1.0
  - renders_no_budget_null: neutral style when budgeted is null
  - renders_no_budget_zero: neutral style when budgeted is 0
  - renders_no_data: faint style when both actual and budgeted are null, displays "---"
  - renders_null_actual_with_budget: shows safe zone ("$0 / $100")
  - renders_correct_text: "$523 / $500" format using fmtDollar
  - renders_summary_size: applies .summary CSS class when size="summary"
  - aria_label: correct accessible label string from getPillAriaLabel
  - role_status: has role="status"
```

```
File: frontend/src/components/mobile/MonthDropdown.test.jsx
Parallelism: independent once MonthDropdown.jsx exists (after Phase 2)
Tests:
  - renders_closed: shows trigger with selected month label
  - opens_on_click: listbox visible after trigger click
  - closes_on_selection: listbox hidden after clicking a month option
  - calls_onSelect_with_month_string
  - closes_on_escape: keyboard event closes the dropdown
  - closes_on_click_outside: mousedown outside closes dropdown
  - selected_month_aria_selected_true
  - trigger_aria_attributes: role combobox, aria-expanded, aria-haspopup
  - displays_month_format: "December 2025"
```

```
File: frontend/src/components/mobile/HorizontalSwipeContainer.test.jsx
Parallelism: independent once HorizontalSwipeContainer.jsx exists (after Phase 2)
Tests:
  - renders_both_children
  - dot_0_active_when_activeIndex_0: aria-selected true on dot 0
  - dot_1_active_when_activeIndex_1: aria-selected true on dot 1
  - clicking_dot_1_calls_onIndexChange_1
  - clicking_dot_0_calls_onIndexChange_0
  - dot_buttons_aria_labels: "Month detail view" / "Monthly summary view"
  - tabpanel_role_on_pane_wrappers
  - locked_state: when isLocked=true, container has containerLocked class
```

```
File: frontend/src/components/mobile/BudgetLineItem.test.jsx
Parallelism: after Phase 3 (BudgetLineItem.jsx exists)
Tests:
  - renders_category_name_and_pill
  - drag_handle_hidden_when_not_reorder_mode
  - drag_handle_visible_when_reorder_mode
  - move_button_calls_onMoveRequest_with_categoryId
  - long_category_name_truncates
  - accepts_flat_actual_budgeted: verify prop types — no month-nested structure expected
  Note: @dnd-kit drag interaction requires pointerEvent mocks — test rendered structure,
  not drag behavior. Drag behavior covered by integration tests.
```

```
File: frontend/src/components/mobile/BudgetGroup.test.jsx
Parallelism: after Phase 4 (BudgetGroup.jsx exists)
Tests:
  - collapsed_by_default: group content not visible
  - clicking_header_expands_group: content becomes visible
  - clicking_header_again_collapses
  - group_pill_shows_aggregate: flat actual/budgeted summed correctly
  - forced_expanded_when_reorder_mode_true
  - category_list_renders_correct_count
  - group_header_role_button_aria_expanded
  - categories_prop_flat_shape: pass { actual: 50, budgeted: 100 } (no months nesting)
  Note: BudgetGroup does NOT perform month extraction — verify this is not present
  in the implementation.
```

```
File: frontend/src/components/mobile/GroupAssignmentSheet.test.jsx
Parallelism: after Phase 3 (GroupAssignmentSheet.jsx exists)
Tests:
  - not_visible_when_closed
  - visible_when_open
  - current_group_preselected
  - selecting_different_group_enables_move_button
  - move_button_disabled_same_group
  - clicking_move_calls_onMove_with_group_name
  - clicking_cancel_calls_onClose
  - escape_key_calls_onClose (via dialog cancel event)
  - create_new_group_row_present
  - create_row_shows_input
  - new_group_input_move_calls_onMove_with_new_name
  - all_available_groups_rendered
  - radio_group_aria: role="radiogroup" on container, role="radio" on items
  - no_redundant_role_dialog: the <dialog> element must NOT have explicit role="dialog"
  Note: <dialog> element showModal() / close() needs jsdom workaround — mock these
  methods on the ref in tests.
```

```
File: frontend/src/pages/MobileBudgetPage.test.jsx
Parallelism: after Phase 6 (MobileBudgetPage.jsx exists)
Tests:
  - shows_loading_state_when_loading_prop_true
  - shows_error_state_when_error_prop_set
  - shows_empty_state_when_no_months
  - renders_month_detail_and_summary_views_when_data_loaded
  - auto_selects_most_recent_month
  - selected_month_passed_to_month_detail_view
  - entering_reorder_mode_passes_isReorderMode_true
  - done_tap_calls_saveCustomGroups_and_onGroupsSaved
  - isSaving_true_during_saveCustomGroups_inflight
  - save_error_stays_in_reorder_mode
  - no_fetch_in_component: verify fetchBudgetHistory is NOT called inside MobileBudgetPage
    (data arrives via props)
  Mock: saveCustomGroups in api.js. budgetData and customGroups passed as props directly.
```

```
File: frontend/src/pages/BudgetPage.test.jsx (existing — update)
Parallelism: after BudgetPage.jsx is modified
Tests to add:
  - mobile_renders_MobileBudgetPage: when isMobile=true, renders MobileBudgetPage
  - mobile_does_not_render_desktop_content: BudgetChart and BudgetTable absent on mobile
  - mobile_no_desktop_fetch: useEffect does NOT call fetchBudgetHistory when isMobile=true
    (confirm no fetch fired via vi.spyOn on the api module)
  - mobile_fetches_custom_groups: fetchCustomGroups IS called when isMobile=true
  - desktop_does_not_fetch_custom_groups: fetchCustomGroups NOT called when isMobile=false
  - desktop_renders_existing_content: BudgetChart and BudgetTable present when isMobile=false
  Mock: vi.mock('../hooks/useResponsive.js', () => ({ useResponsive: () => ({ isMobile: true }) }))
```

```
File: frontend/src/api.test.js (existing — update)
Parallelism: independent of component work
Tests to add (following existing it.each() parametrize pattern):
  - fetchCustomGroups: calls GET /api/budgets/custom-groups
  - saveCustomGroups: calls POST /api/budgets/custom-groups with correct body
```

### Integration Tests

```
File: frontend/src/components/mobile/MobileIntegration.integration.test.jsx
Parallelism: after Phase 7 (all components exist)
Tests:
  - full_render_with_mocked_api: MobileBudgetPage (via BudgetPage with isMobile=true)
    with mocked API renders groups, categories, and pills correctly for a given month
  - group_expansion_propagates: clicking group header shows its items
  - month_change_collapses_groups
  - reorder_mode_shows_drag_handles: Edit Groups button click shows drag handles
  - swipe_dots_reflect_active_view
  Mock: api.js calls, useResponsive (always isMobile=true), recharts
  Do NOT mock: BudgetPill, BudgetGroup, BudgetLineItem, HorizontalSwipeContainer
```

---

## Rollback Notes

- **Backend:** `budget_custom_groups` DDL uses `CREATE TABLE IF NOT EXISTS` — adding the table is non-destructive. To revert: the table can be left empty with no side effects on existing features. The two new endpoints can be deleted from `backend/app.py` without affecting existing endpoints.

- **Frontend:** The `BudgetPage.jsx` modification adds an early return and a mobile custom-groups fetch. To revert: remove the two new imports, the `customGroupsData` state, the mobile `useEffect`, and the `if (isMobile)` conditional return. The file returns to its original state.

- **npm packages:** `npm uninstall @dnd-kit/core @dnd-kit/sortable` from the `frontend/` directory removes the new packages. No other files reference them (only `BudgetGroup.jsx` and `BudgetLineItem.jsx`).

- **New files:** All new files are in `frontend/src/pages/MobileBudgetPage*` and `frontend/src/components/mobile/`. They can be deleted without affecting any existing feature since nothing imports them except the modified `BudgetPage.jsx`.

- **`budgetUtils.js` extraction:** If reverted, restore `const WARNING_THRESHOLD = 0.85` to `BudgetTable.jsx` and remove the import.

- **Data:** No existing data is modified. The new table starts empty. A full revert requires no data migration.

---

## Open Items Requiring Clarification Before Implementation

1. **`<dialog>` bottom-sheet positioning:** The `<dialog>` element defaults to centered positioning. The CSS overrides in `GroupAssignmentSheet.module.css` need to be verified cross-browser (specifically that `top: auto; bottom: 0; margin: 0` correctly anchors to viewport bottom in Chrome Android and iOS Safari). If this proves brittle, fall back to a `<div>` with `position: fixed; bottom: 0` and manual focus trap implementation (~20 additional LOC).

2. **eslint-disable for isMobile in useEffect deps:** The `isMobile` guard-inside-effect pattern requires suppressing exhaustive-deps for that effect. The implementer must confirm that the project's ESLint config allows this suppression comment, or adjust accordingly.

3. **Expand state on reorder-mode exit:** The plan preserves expand state when exiting reorder mode (only `selectedMonth` changes reset expansion, not mode changes). Confirm with user if this differs from desired behavior.

---

## Staff Review Response

All 14 findings addressed below. Findings addressed in the same order as received.

---

**Finding 1 (Critical): `getBudgetZone` wrong zone for null actual + positive budget; both-zero returns 'no-budget' instead of 'no-data'.**

Changed: `getBudgetZone` is rewritten in the `budgetUtils.js` change block. The new implementation explicitly handles four cases before computing the ratio:
- `!hasActual && !hasBudgeted` → `'no-data'` (both absent = truly no data, not just no budget)
- `!hasBudgeted` (but actual present) → `'no-budget'`
- `hasBudgeted` but `actual == null` → `safeActual = actual ?? 0`, computes `0 / budgeted = 0` → `'safe'` ($0 spent of a real budget is safe)
- Otherwise: ratio-based zone

The comment block in `budgetUtils.js` documents each case explicitly so the next reader understands the intent. Tests added for the null-actual-positive-budget case and the both-null case in `budgetUtils.test.js`.

---

**Finding 2 (High): BudgetGroup aggregate uses `c.months?.[selectedMonth]?.actual` but PropTypes show flat shape.**

Changed: `BudgetGroup` PropTypes are updated to declare flat `actual` and `budgeted` (no month nesting). The aggregate computation is simplified to:
```js
groupActual   = categories.reduce((s, c) => s + (c.actual   ?? 0), 0)
groupBudgeted = categories.reduce((s, c) => s + (c.budgeted ?? 0), 0)
```

`MonthDetailView` is now explicitly responsible for extracting `c.months?.[selectedMonth]?.actual` into flat fields before building the categories array it passes to `BudgetGroup`. This extraction happens in the `useMemo` that builds `groupedCategories`, as detailed in the `MonthDetailView` change block. `BudgetGroup` has zero knowledge of month selection — it receives only flat values.

---

**Finding 3 (High): Adding `isMobile` to useEffect deps causes refetch on resize.**

Changed: The `BudgetPage.jsx` change block now explicitly specifies:
- deps remain `[months]` only
- `if (isMobile) return` is a guard inside the effect body (not a dep)
- An `eslint-disable-next-line` comment suppresses the exhaustive-deps warning with documented justification: isMobile is intentionally excluded because adding it would cause a re-fetch on every window resize

---

**Finding 4 (High): MobileBudgetPage does independent fetch instead of receiving data from parent.**

Changed: This is the largest structural change. The data lift is now complete:
- `BudgetPage` performs both the budget history fetch (desktop path guarded by `if (isMobile) return`) and the custom groups fetch (mobile-only useEffect)
- `MobileBudgetPage` Props now include `budgetData`, `customGroups`, `loading`, `error`, `onGroupsSaved`
- `MobileBudgetPage` has no `fetchBudgetHistory` or `fetchCustomGroups` calls — only `saveCustomGroups` on Done
- The `Overview` section notes this architectural change explicitly
- Parallelism tags updated: `MobileBudgetPage.jsx` no longer carries Group F fetch ownership; `BudgetPage.jsx` is updated accordingly

---

**Finding 5 (Medium): Transfer filtering incomplete — add `cat.group_type !== 'transfer'` defensive filter.**

Changed: Two locations updated:
1. `MonthDetailView.jsx` — the expense category filter is now:
   ```js
   cat.group_type !== 'income' && cat.group_type !== 'transfer'
   ```
2. `MonthlySummaryView.jsx` — the per-month totals calculation applies the same filter
3. Backend GET `/api/budgets/custom-groups` — noted to filter transfer rows from the response when building the groups dict (defensive, in case any were previously saved)

---

**Finding 6 (Medium): HorizontalSwipeContainer scroll/state feedback loop.**

Changed: `HorizontalSwipeContainer.jsx` now declares `isScrollingRef = useRef(false)`. The `handleScroll` handler checks `if (isScrollingRef.current) return` first. The programmatic `scrollTo` call in the `useEffect` sets `isScrollingRef.current = true` before calling `scrollTo`, then clears it with a 400ms `setTimeout`. The timeout value (400ms) is slightly longer than typical smooth scroll animations (~300ms) to ensure the flag is cleared after the browser finishes scrolling.

---

**Finding 7 (Medium): GroupAssignmentSheet ARIA — remove redundant `role="dialog"`, use `role="radiogroup"` + `role="radio"`.**

Changed: Two updates in `GroupAssignmentSheet.jsx`:
1. The `<dialog>` element no longer receives an explicit `role="dialog"` attribute (the native element already provides this semantic when opened with `showModal()`)
2. The group list uses `role="radiogroup"` with `aria-label="Select group"` on the container, and each item uses `role="radio"` with `aria-checked={selectedGroup === groupName}`

A test is added to `GroupAssignmentSheet.test.jsx` verifying no redundant `role="dialog"` is present and that `role="radiogroup"` / `role="radio"` are present.

---

**Finding 8 (Medium): handleDone error silently swallowed — add `saveError` state with inline error display.**

Changed: `MonthDetailView.jsx` now declares `const [saveError, setSaveError] = useState(null)`. The `handleDone` function wraps `onExitReorder` in a try/catch:
- On error: `setSaveError(err.message || 'Failed to save. Please try again.')` and does NOT exit reorder mode (user retains their draft)
- On success: reorder mode exits normally

The error is rendered as `<p className={styles.saveError} role="alert">{saveError}</p>` above the Done button when non-null. `saveError` is cleared when entering reorder mode. The `GroupAssignmentSheet.module.css` block includes `.saveError` style token.

The re-throw pattern in `MobileBudgetPage.handleDone` ensures the error propagates to `MonthDetailView`'s catch block.

---

**Finding 9 (Medium): `WARNING_THRESHOLD` in budgetUtils.js deviates from architecture doc's chartUtils.jsx — justify the deviation.**

Changed: A comment block is added at the top of the `WARNING_THRESHOLD` declaration in `budgetUtils.js`:

> "Defined here (not in chartUtils.jsx) because chartUtils.jsx is Recharts-specific — it holds SVG color constants for chart rendering. budgetUtils.js is the correct home for budget-domain logic consumed by both the table and pill components. The value is identical (0.85)."

This justification is also noted in the `budgetUtils.js` change block description in the plan.

---

**Finding 10 (Medium): npm install listed in wrong phase — move to Phase 1.**

Changed: The dependency order table and Phase list now explicitly place `npm install @dnd-kit` in Phase 1, Stream 3 — running in parallel with the backend and shared utility changes. The optimized parallel schedule table also reflects this. The earlier mention of "install before implementation begins" in the Overview is now precise: "Install in Phase 1."

---

**Finding 11 (Medium): ViewIndicator and MonthSummaryHeader merged into parent — add explicit note.**

Changed: Both components are now explicitly documented as intentionally inline:
- `HorizontalSwipeContainer.jsx` Description: "Note: dot indicators (ViewIndicator) are rendered inline in this file as a sibling `<div>` — they are not extracted to a separate ViewIndicator component because they are tightly coupled to the container's scroll state and add only ~15 lines."
- `MonthDetailView.jsx` Description: "Note: MonthSummaryHeader is ~12 lines of JSX within this file. Extracting it to a separate file would add an import with no reuse benefit — it is intentionally inline."
- The Overview implementation groupings section also notes this for both components.

---

**Finding 12 (Low): getPillAriaLabel should use `fmtDollar()` from chartUtils.jsx for consistency.**

Changed: `getPillAriaLabel` in `budgetUtils.js` no longer uses an inline `$${Math.round(n).toLocaleString()}` pattern. Instead, it defines a local `fmt` helper that mirrors `fmtDollar`'s behavior exactly (`$${Math.round(n ?? 0).toLocaleString('en-US')}`). It does NOT import `fmtDollar` directly into `budgetUtils.js` to avoid a circular dependency chain (budgetUtils → chartUtils, while BudgetPill already imports both). The behavior is identical to `fmtDollar` and is documented as such. `BudgetPill.jsx` imports `fmtDollar` from `chartUtils.jsx` for its display text (already in the plan). A test case verifies locale formatting (`$1,234 of $2,000`).

---

**Finding 13 (Low): Dot touch target CSS has two conflicting approaches — keep only the ::before pseudo-element approach.**

Changed: `HorizontalSwipeContainer.module.css` now specifies only one approach:
- `.dot`: `width: 44px; height: 44px; background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; pointer-events: all`
- `.dot::before`: `content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); display: block`

The earlier conflicting "padding trick" description (setting `padding: 18px; width: 8px; height: 8px`) is removed. The plan specifies only the `::before` approach with a transparent 44px wrapper.

---

**Finding 14 (Low): Abort controller is unnecessary — month switching is client-side filtering.**

Changed: `MobileBudgetPage.jsx` no longer mentions an abort controller in any form. The `HorizontalSwipeContainer.jsx` change block includes an explicit note:

> "Note: month switching is pure client-side filtering — no fetch is triggered by activeIndex changes. The abort controller from the initial plan draft is not needed and is intentionally omitted here."

No abort controller code appears anywhere in the plan.
