# Architecture Decision: Mobile Budgets vs. Actuals

**Date:** 2026-03-06
**Status:** Draft
**Author:** Architect Agent

---

## Decision Summary

We are building a mobile-optimized Budgets vs. Actuals experience as a conditional render within the existing `/budgets` route. The mobile view introduces a swipeable two-pane layout (month detail + monthly summary), collapsible budget groups with pill-shaped status indicators, custom group assignment with drag-to-reorder, and a bottom sheet for group reassignment. We will use `@dnd-kit` for drag-and-drop, build a minimal custom bottom sheet (no library), store custom groups in a single flat `budget_custom_groups` table, and add two new API endpoints while keeping the existing `/api/budgets/history` unchanged.

---

## Decision 1: Component Architecture

### Chosen Approach: Conditional render via `useResponsive().isMobile` inside `BudgetPage`

**Description:** `BudgetPage.jsx` checks `isMobile` and renders either the existing desktop content or `<MobileBudgetPage />` as a child component. The route in `App.jsx` stays as `<Route path="/budgets" element={<BudgetPage />} />`. `MobileBudgetPage` is a separate file under `pages/` but is not a separate route.

**Rationale:**
- The app already uses `useResponsive()` for responsive decisions throughout (chart heights, layout toggles). This follows the established pattern.
- A single route means bookmarked URLs, browser history, and the BottomTabBar `isActive` logic all work without any changes. Separate routes (`/budgets` vs. `/budgets/mobile`) would require updating `nav.js`, adding redirect logic, and handling the edge case where a user resizes their browser window.
- Data fetching can be lifted to `BudgetPage` and shared between desktop and mobile via props, avoiding duplicate fetch logic. Both views consume the same `fetchBudgetHistory` response.
- The design spec explicitly calls for this approach, and there is no technical reason to deviate.

**Alignment:** Matches design spec section 1 ("replaces BudgetPage when `useResponsive().isMobile` is true"). No routing changes needed.

### Rejected Alternatives

**Option A: Separate route (`/budgets/mobile`)**
- Why rejected: Requires `nav.js` changes, redirect logic based on viewport width (fragile), and creates a URL that is meaningless on desktop. The BottomTabBar active-tab detection would need special-casing. No benefit over conditional render since the data source is identical.

**Option B: CSS-only responsive design within existing BudgetPage**
- Why rejected: The mobile and desktop experiences are fundamentally different UIs (horizontal table vs. collapsible card list, bar chart vs. pill indicators, horizontal scroll vs. swipeable panes). Trying to make one component tree serve both layouts via CSS would result in excessive DOM duplication, complex conditional class logic, and poor maintainability. The two views share a data model but not a visual structure.

---

## Decision 2: Data Model for Custom Groups

### Chosen Approach: Single flat table `budget_custom_groups`

```sql
CREATE TABLE IF NOT EXISTS budget_custom_groups (
  category_id  TEXT PRIMARY KEY,
  custom_group TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
```

**Description:** One row per customized category. Categories absent from this table use their Monarch-inherited `group_name`. The `custom_group` column is a plain text string (the group name). The `sort_order` is an integer for ordering within a group.

**Rationale:**
- This is a single-user app with a modest number of budget categories (typically 20-50). There is no need for referential integrity between a `groups` table and a `members` table when the "group" is just a label string.
- The table is append-only in practice (upsert on save). No cascade deletions or orphan cleanup needed -- if all categories leave a group, the group simply stops appearing in the UI.
- Matches the existing pattern: `account_group_members` uses a junction table because groups have metadata (name, color, created_at). Budget custom groups have no metadata beyond the name itself -- no color, no icon, no description. Adding a separate `custom_groups` metadata table would be unnecessary indirection.
- The design spec proposes exactly this schema, and the requirements do not call for group-level metadata.

**Alignment:** Covers all design spec requirements: reorder within group (sort_order), move between groups (update custom_group), create new groups (insert with new custom_group value), auto-remove empty groups (no rows reference them).

### Rejected Alternatives

**Option A: Normalized two-table design (`budget_groups` + `budget_group_members`)**
- Why rejected: Adds a table, a foreign key, and cascade logic for zero benefit. Budget groups have no metadata (no color, no icon). The group "exists" if at least one category references it. Adding a groups table means we need to manage lifecycle (create group before assigning members, delete group when empty). The single-user, small-dataset context does not justify the relational overhead.

**Option B: JSON column on a singleton settings row**
- Why rejected: Loses queryability (cannot `SELECT ... WHERE custom_group = ?`), makes concurrent writes harder (read-modify-write vs. upsert), and diverges from the app's pattern of using proper tables for structured data. The `retirement_settings.milestones` JSON column is a reasonable precedent for nested arrays, but custom groups have a natural relational shape (category_id -> group assignment) that maps better to rows.

---

## Decision 3: API Design

### Chosen Approach: Two new endpoints; existing endpoint unchanged

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/budgets/custom-groups` | Returns all custom group assignments |
| `POST` | `/api/budgets/custom-groups` | Saves/replaces all custom group assignments |

**Description:**
- `GET /api/budgets/custom-groups` returns `{ "groups": { "Food & Drink": [{"category_id": "cat_123", "sort_order": 0}, ...], ... } }` -- grouped by custom_group name.
- `POST /api/budgets/custom-groups` accepts the full groups payload (same shape) and replaces all rows in `budget_custom_groups` via DELETE + INSERT within a transaction. This is a full-state replacement, not a patch.
- The existing `GET /api/budgets/history` is unchanged. The frontend merges custom group data with budget history client-side.

**Rationale:**
- **No `/api/budgets/months` endpoint:** The design spec suggested this as an optimization to avoid fetching full category data just to populate the month dropdown. However, the existing `/api/budgets/history?months=120` already returns a `months` array (just the month strings). The category data comes along for the ride, but the response size for 120 months of ~40 categories is roughly 50-80 KB -- well within acceptable limits for a local-network app. Adding a separate endpoint for month strings adds API surface area and a second fetch on mount for marginal benefit. If performance becomes an issue, this can be added later.
- **Full-state replacement on POST:** The custom groups feature is always saved as a batch ("Done" button in reorder mode). There is no incremental update use case. Full replacement is simpler to implement (no PATCH semantics, no conflict resolution) and matches the `saveGroupsConfigs` pattern used by account groups.
- **No separate reorder vs. assign endpoints:** Both operations produce the same data structure (category -> group + sort_order). Splitting them into separate endpoints would require the frontend to know which API to call based on what changed, adding complexity without benefit.
- **Not merged into `/api/budgets/history`:** Custom groups are user preferences, not budget data. They change infrequently (when the user edits) while budget history changes on every sync. Keeping them separate means the custom groups response can be cached aggressively and fetched once on mount, while budget history is re-fetched when the user changes the month range.

**Alignment:** Covers save/load of custom groups. Desktop BudgetPage is unaffected (does not call the new endpoints).

### Rejected Alternatives

**Option A: Merge custom groups into `/api/budgets/history` response**
- Why rejected: Couples two independent data lifecycles. Custom groups rarely change; budget data changes on sync. Merging means every budget history fetch also returns custom groups (wasted bytes), and saving custom groups would require a different endpoint anyway. The frontend merge is trivial (a single `useMemo`).

**Option B: Separate endpoints for reorder (`PUT /api/budgets/custom-groups/order`) and assign (`PUT /api/budgets/custom-groups/assign`)**
- Why rejected: Overengineered for the use case. Both operations produce the same data (category_id -> group + sort_order). The "Done" button saves everything at once. Two endpoints means two HTTP calls and two code paths for what is logically one save operation.

**Option C: Add a lightweight `/api/budgets/months` endpoint**
- Why rejected for now: The existing history endpoint already returns the months array. For a local app, the extra payload of category data is negligible. This adds API surface area for a marginal optimization. Can be revisited if the month dropdown needs to load faster than the full budget data.

---

## Decision 4: Drag-and-Drop Library

### Chosen Approach: `@dnd-kit/core` + `@dnd-kit/sortable`

**Description:** Install `@dnd-kit/core` and `@dnd-kit/sortable` as production dependencies. Use `@dnd-kit/sortable` for within-group reordering of budget line items in reorder mode.

**Rationale:**
- **Touch support is non-trivial to build correctly.** Native touch events require handling: touch start/move/end, scroll prevention during drag (but not for the rest of the page), calculating drop targets from touch coordinates, animating displaced items, handling edge cases like the user scrolling while dragging, and supporting reduced motion. `@dnd-kit` handles all of this out of the box.
- **Bundle size is acceptable.** `@dnd-kit/core` is ~12 KB gzipped, `@dnd-kit/sortable` adds ~4 KB. Total ~16 KB. The app currently ships ~45 KB of `recharts` (gzipped). Adding 16 KB for a core interactive feature is justified.
- **`@dnd-kit` is the standard React DnD library for touch.** It replaced `react-beautiful-dnd` (deprecated, archived by Atlassian). It has active maintenance, TypeScript support, and a stable API. The `@dnd-kit/sortable` preset handles the exact use case (sortable list within a container) with minimal configuration.
- **No existing DnD in the codebase.** There is no sunk cost in another approach. Adding a well-maintained library for a complex interaction pattern is better than building a fragile custom solution.

**Alignment:** The design spec recommends `@dnd-kit` explicitly. Touch interactions (drag handle, gap indicator, animated displacement) are well-supported by the sortable preset.

### Rejected Alternatives

**Option A: Native touch events (custom implementation)**
- Why rejected: Building reliable touch-based drag-and-drop requires handling at least 8 distinct concerns: touch identification, scroll locking, drop target calculation via `elementFromPoint`, animated displacement of siblings, keyboard accessibility fallback, reduced motion, iOS Safari quirks (300ms tap delay, overscroll bounce), and Android Chrome touch-action conflicts. This is easily 300+ lines of non-trivial code that would need extensive testing. The time investment is not justified when a 16 KB library solves all of these.

**Option B: `react-beautiful-dnd`**
- Why rejected: Archived by Atlassian in late 2024, no longer maintained. Known issues with React 18 strict mode. The successor project (`@hello-pangea/dnd`) is a community fork with uncertain long-term maintenance. `@dnd-kit` is the actively maintained standard.

---

## Decision 5: Bottom Sheet Implementation

### Chosen Approach: Custom minimal bottom sheet component

**Description:** Build `GroupAssignmentSheet.jsx` as a custom component using CSS transforms and transitions. No library dependency. The sheet slides up from viewport bottom, uses a backdrop scrim, and supports swipe-to-dismiss.

**Implementation sketch:**
- Fixed-position overlay (`position: fixed; inset: 0`) with backdrop (`background: rgba(0,0,0,0.5)`)
- Sheet container at bottom: `transform: translateY(100%)` (hidden) animating to `translateY(0)` (visible) via CSS transition
- Swipe-to-dismiss: track touch delta on the drag indicator bar; if swipe-down distance exceeds threshold (80px), close the sheet
- Focus trap: on open, focus the heading; on close, return focus to the trigger element
- Body scroll lock: set `document.body.style.overflow = 'hidden'` while sheet is open

**Rationale:**
- **The sheet's functionality is narrow and well-defined.** It shows a radio list of groups, a "create new group" input, and two buttons. There is no complex gesture handling (no partial-height stops, no snap points, no content scrolling inside the sheet that conflicts with swipe-to-dismiss). A library would be overhead for this simple case.
- **Bundle size zero.** `react-spring-bottom-sheet` pulls in `react-spring` (~25 KB gzipped) as a dependency. For a component that appears only in reorder mode of the mobile budget view, this is disproportionate.
- **Full control over styling.** The design spec has precise token mappings for the sheet (radius, shadows, spacing). A library's default styles would need extensive overriding. Building custom means the CSS is straightforward and uses design tokens directly.
- **The app has no spring-physics animations anywhere.** Introducing `react-spring` for a single bottom sheet creates an inconsistent animation approach (CSS transitions everywhere else, spring physics here).
- **Estimated implementation: ~100 lines of JSX + ~60 lines of CSS.** This is well within the complexity budget for a custom component.

**Alignment:** The design spec describes exact dimensions, animations, and behavior. A custom implementation maps 1:1 to the spec without fighting a library's abstractions.

### Rejected Alternatives

**Option A: `react-spring-bottom-sheet` library**
- Why rejected: Adds ~25 KB gzipped (react-spring dependency) for a single component. The sheet has no snap points, no multi-stop behavior, and no complex gesture physics that would justify a library. The library's default styling would need extensive overrides to match the design tokens. The app uses CSS transitions exclusively -- introducing spring physics for one component creates inconsistency.

**Option B: Use a modal dialog instead of a bottom sheet**
- Why rejected: The design spec explicitly calls for a bottom sheet UX pattern (slide up from bottom, drag indicator, swipe-to-dismiss). A centered modal would feel out of place on mobile and miss the affordance of the drag indicator. The bottom sheet pattern is standard for mobile "pick from a list" interactions. However, the internal implementation can use `<dialog>` element semantics for accessibility (native `showModal()` provides focus trapping and Escape handling), with the visual presentation styled as a bottom sheet.

---

## Decision 6: State Management for Custom Groups

### Chosen Approach: Local state in `MobileBudgetPage` + API sync on "Done"

**Description:**
- `MobileBudgetPage` fetches custom groups on mount via `fetchCustomGroups()` and stores them in local state (`useState`).
- The merged view (Monarch groups + custom overrides) is computed via `useMemo` on every render.
- In reorder mode, edits are made to a local draft copy of the groups state. Changes are not persisted until the user taps "Done".
- On "Done", the full groups state is POSTed to `/api/budgets/custom-groups`, and the local state is updated with the response.
- No Context provider, no global state library.

**Rationale:**
- **Custom groups are consumed by exactly one component tree.** Only `MobileBudgetPage` and its children use custom group data. Desktop `BudgetPage` does not display custom groups. There is no cross-page state sharing requirement, so Context or a global store would add indirection without benefit.
- **The app has no global state library.** Every page manages its own data via `useState` + `useEffect` + API calls. Introducing Context or a state library for one feature would be inconsistent with the established architecture.
- **Draft state pattern prevents data loss.** If the user is mid-reorder and accidentally navigates away, no partial state is saved to the backend. The user's existing groups are preserved. This is the safest default for a destructive operation (reordering).
- **Two fetches on mount (`fetchBudgetHistory` + `fetchCustomGroups`) run in `Promise.all`.** This matches the `NetWorthPage` pattern (fetches net worth stats, history, by-type, and retirement settings in parallel).

**Alignment:** The design spec shows custom groups persisting on "Done" tap, not on each drag operation. Local state + batch save matches this interaction model exactly.

### Rejected Alternatives

**Option A: React Context provider for custom groups**
- Why rejected: Only `MobileBudgetPage` consumes this data. Context is useful when multiple disconnected components need the same state (e.g., auth, theme). Here, the data flows top-down through a single component tree. Props suffice. Context would add a provider wrapper, a custom hook, and a separate file for state that is naturally local.

**Option B: Save on every drag operation (optimistic updates)**
- Why rejected: Drag operations happen rapidly during reordering. Saving on each drag would generate many POST requests, risk partial saves if the user is mid-rearrangement, and complicate error handling (what if request 3 of 8 fails?). Batch save on "Done" is simpler, more reliable, and matches user intent ("I'm done editing, save my changes").

---

## Decision 7: Horizontal Swipe Implementation

### Chosen Approach: CSS `scroll-snap` (as specified in design spec)

**Description:** Use native CSS `scroll-snap-type: x mandatory` on the swipe container. Each pane is `flex: 0 0 100%; scroll-snap-align: start`. Active view detection via scroll event + `Math.round(scrollLeft / clientWidth)`. Dot indicators reflect active view and are tappable for programmatic scrolling via `scrollTo({ behavior: 'smooth' })`.

**Rationale:**
- **Native CSS scroll-snap has excellent browser support.** Supported in all browsers since 2019 (Chrome 69+, Safari 11+, Firefox 68+). The mobile targets for this app (iOS Safari, Chrome Android) have had stable support for 5+ years.
- **Zero JavaScript for the swipe physics.** The browser handles inertia, bounce, and snap-to-position natively. This is smoother than any JS-based swipe library and requires no bundle size.
- **The design spec calls for exactly two panes.** There is no dynamic pane count, no nested swipe, and no partial-reveal of adjacent panes. CSS scroll-snap is ideal for this simple case.

**Edge cases and mitigations:**
- **Reorder mode conflict:** During reorder mode, set `overflow-x: hidden` on the swipe container to prevent accidental horizontal scrolling while dragging vertically. The design spec calls for this explicitly.
- **iOS Safari rubber-banding:** The `-webkit-overflow-scrolling: touch` property is included for smooth momentum scrolling. On iOS, the container may show a slight rubber-band effect at the edges. This is expected native behavior and not a bug.
- **Scroll event throttling:** The scroll handler uses `Math.round()` which produces a binary 0/1 result. No debounce needed -- the dot indicator update is a single `setState` call that React batches.
- **`scrollTo` smooth behavior:** All target browsers support `behavior: 'smooth'` on `scrollTo`. The `prefers-reduced-motion` media query sets `scroll-behavior: auto` to respect user preferences.

**Alignment:** Matches design spec section 6 exactly. No deviations.

### Rejected Alternatives

**Option A: JavaScript swipe library (e.g., `react-swipeable`, `framer-motion`)**
- Why rejected: Adds bundle size for functionality the browser provides natively. JS-based swipe detection introduces timing issues (when does a horizontal swipe become a vertical scroll?) that CSS scroll-snap handles automatically. The two-pane use case does not require gesture callbacks, velocity detection, or programmatic animation that a library would provide.

**Option B: Tab-based UI instead of swipe**
- Why rejected: The design spec calls for swipeable panes with dot indicators, which is the standard mobile pattern for two related views. Tabs would work functionally but would consume vertical space for tab headers and miss the spatial metaphor of "sliding between views" that users expect on mobile.

---

## Design Details

### Data Model Changes

**New table** (added to `DASHBOARD_DDL` in `app.py`):

```sql
CREATE TABLE IF NOT EXISTS budget_custom_groups (
  category_id  TEXT PRIMARY KEY,
  custom_group TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
```

No foreign key to `categories` -- categories come from Monarch sync and may be deleted/recreated. The `category_id` is a text identifier from Monarch's API. Orphaned rows (category deleted from Monarch) are harmless and will be cleaned up on the next full save.

### API Contract Changes

**`GET /api/budgets/custom-groups`**
```json
{
  "groups": {
    "Food & Drink": [
      {"category_id": "cat_123", "sort_order": 0},
      {"category_id": "cat_456", "sort_order": 1}
    ],
    "Housing": [
      {"category_id": "cat_101", "sort_order": 0}
    ]
  }
}
```

**`POST /api/budgets/custom-groups`**
- Request body: same shape as GET response
- Response: `{"status": "ok", "count": N}` where N is total rows saved
- Implementation: `DELETE FROM budget_custom_groups; INSERT ...` in a transaction
- Validation: category_id must be non-empty string, custom_group must be non-empty string, sort_order must be non-negative integer. Max 500 rows (safety limit).

### Component Structure

```
frontend/src/
  pages/
    BudgetPage.jsx              # Modified: adds isMobile check, renders MobileBudgetPage
    MobileBudgetPage.jsx        # New: top-level mobile page component
    MobileBudgetPage.module.css # New
  components/mobile/
    MonthDetailView.jsx         # New: View 1 container
    MonthlySummaryView.jsx      # New: View 2 container
    BudgetPill.jsx              # New: shared pill component
    BudgetPill.module.css       # New
    BudgetGroup.jsx             # New: collapsible group with header + items
    BudgetGroup.module.css      # New
    BudgetLineItem.jsx          # New: single category row
    BudgetLineItem.module.css   # New
    MonthDropdown.jsx           # New: scrollable month selector
    MonthDropdown.module.css    # New
    GroupAssignmentSheet.jsx     # New: bottom sheet for group reassignment
    GroupAssignmentSheet.module.css # New
    HorizontalSwipeContainer.jsx   # New: scroll-snap wrapper
    HorizontalSwipeContainer.module.css # New
  api.js                        # Modified: add fetchCustomGroups, saveCustomGroups
  components/chartUtils.jsx     # Modified: extract WARNING_THRESHOLD to shared location
```

### Integration Points

1. **`BudgetPage.jsx`:** Add `import { useResponsive } from '../hooks/useResponsive.js'` and conditionally render `<MobileBudgetPage />`. Pass fetched `budgetData` as a prop to avoid duplicate fetches.

2. **`api.js`:** Add two new exports:
   ```js
   export const fetchCustomGroups = () => fetchJSON('/api/budgets/custom-groups')
   export const saveCustomGroups = (data) => postJSON('/api/budgets/custom-groups', data)
   ```

3. **`chartUtils.jsx`:** Export `WARNING_THRESHOLD = 0.85` so both `BudgetTable` and `BudgetPill` can import it.

4. **`backend/app.py`:**
   - Add `budget_custom_groups` DDL to `DASHBOARD_DDL` string
   - Add two new route handlers after the existing `budget_history` endpoint
   - No changes to existing endpoints

5. **`package.json`:** Add `@dnd-kit/core` and `@dnd-kit/sortable` to dependencies.

---

## Risks and Mitigations

### Risk 1: `@dnd-kit` version compatibility with React 18

**Likelihood:** Low. `@dnd-kit` has been stable with React 18 since 2022.
**Mitigation:** Pin to a specific version in package.json (e.g., `@dnd-kit/core@^6.1.0`). Run the full test suite after installation.

### Risk 2: Scroll-snap + drag-and-drop interaction conflict

**Likelihood:** Medium. During reorder mode, vertical drag gestures on budget line items could interfere with the horizontal scroll-snap container.
**Mitigation:** The design spec addresses this: set `overflow-x: hidden` on the swipe container during reorder mode. This completely disables horizontal scrolling. The `@dnd-kit` `TouchSensor` has configurable activation constraints (e.g., `activationConstraint: { distance: 8 }`) that prevent accidental drags.

### Risk 3: Custom groups diverge from Monarch categories after sync

**Likelihood:** Medium. A Monarch sync could rename, delete, or add categories. Custom groups reference category IDs that may become stale.
**Mitigation:**
- New categories (not in `budget_custom_groups`) fall back to their Monarch `group_name` and appear at the bottom of their group.
- Deleted categories: orphaned rows in `budget_custom_groups` are harmless (they reference IDs that no longer appear in budget data). They can be cleaned up on the next POST save.
- Renamed categories: `category_id` is the key, not the name. Name changes are transparent.

### Risk 4: Bottom sheet focus trap on older iOS Safari

**Likelihood:** Low. The custom bottom sheet uses `position: fixed` and manual focus management.
**Mitigation:** Use the native `<dialog>` element's `showModal()` API for focus trapping and Escape key handling. Style the dialog to look like a bottom sheet. This gets free accessibility and focus management from the browser. Fallback: `inert` attribute on background content (supported in all modern browsers since 2023).

### Risk 5: Large number of categories causes slow reorder mode

**Likelihood:** Low. Typical Monarch users have 20-50 budget categories.
**Mitigation:** `@dnd-kit` virtualizes displacement calculations efficiently. If needed, `useMemo` on the sorted/grouped category list prevents unnecessary re-renders. The safety limit of 500 rows on the POST endpoint prevents abuse.

---

## Open Questions

### Requiring Human Input

1. **Should desktop BudgetPage eventually also support custom groups?** The current design scopes custom groups to mobile only. If desktop support is planned, the API design is already compatible (desktop would just call the same endpoints). But the implementation plan should know whether to add group indicators to `BudgetTable.jsx` now or defer. **Recommendation: defer -- desktop was not in scope for this design spec.**

2. **Should the "Edit Groups" / reorder feature be gated behind a minimum number of categories?** If a user has only 2-3 categories, the reorder feature adds complexity without value. The design spec does not address this. **Recommendation: always show the button -- it is harmless and discoverable.**

### Technical Unknowns (resolved during implementation)

1. **Monarch category ID format:** The design spec uses `cat_123` as example IDs. The actual ID format from `categories.id` in the database needs to be verified. The schema uses `TEXT` type, so any format works. No risk here, just needs confirmation during implementation.

2. **`<dialog>` element styling for bottom sheet:** The `<dialog>` element has browser-default styles (centered positioning, backdrop). These need to be overridden for bottom-sheet positioning. The `::backdrop` pseudo-element can be styled for the scrim. Implementation will confirm cross-browser behavior.

3. **Scroll position restoration:** When returning from reorder mode to normal mode, should collapsed groups remain collapsed or reset? The design spec says expand state resets on month change but does not address mode changes. **Recommendation: preserve expand state when exiting reorder mode, since the user was just looking at those groups.**
