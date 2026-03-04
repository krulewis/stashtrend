# Staff Engineer Review — Sidebar Navigation with URL Routing

**Date:** 2026-03-03
**Agent:** Staff Engineer Agent (Step 4 of planning pipeline)
**Reviewed documents:** `sidebar-nav-plan.md`, `sidebar-nav-architecture.md`
**Reviewed code:** `App.jsx`, `App.module.css`, `App.test.jsx`, `main.jsx`, `SyncPage.jsx`, `BudgetPage.jsx`, `BudgetBuilderPage.jsx`, `GroupsPage.jsx`, `index.css`

---

## Findings

### 1. MUST FIX — BudgetBuilderPage is not mocked in App.test.jsx

The current `App.test.jsx` mocks `GroupsPage`, `BudgetPage`, `SyncPage`, and `SetupPage` — but **not** `BudgetBuilderPage`. This works today because BudgetBuilderPage only renders when `activeTab === 'builder'` and no test navigates there. With routing, BudgetBuilderPage is imported and registered as a `<Route>` eagerly. Its `useEffect` fires `fetchAiConfig()`, `fetchBuilderProfile()`, and `fetchBuilderRegional()` when mounted — but since it's only rendered when the route matches `/builder`, it will not fire in tests that navigate to `/networth`.

However, the plan adds a mock for `NetWorthPage` but still omits `BudgetBuilderPage`. **This is a latent bug today and must be fixed now.** Add:

```jsx
vi.mock('./pages/BudgetBuilderPage.jsx', () => ({ default: () => <div data-testid="builder-page" /> }))
```

Without this, if a future test navigates to `/builder`, unmocked fetch calls will interfere. Add it for consistency and safety.

---

### 2. MUST FIX — Sidebar sticky + header sticky creates a broken scroll context

The plan makes `.header` `position: sticky; top: 0` and `.sidebar` `position: sticky; top: 0; height: calc(100vh - 73px)`. The sidebar's `sticky` positioning works relative to its scroll container. But `.body` is a flex child of `.root` (which is a CSS grid). The sidebar needs its **nearest scrolling ancestor** to be the viewport, not `.body`.

The plan also sets `overflow-y: auto` on `.main`. This is correct for the main content, but it means `.body` itself does NOT scroll — only `.main` scrolls. The sidebar with `position: sticky; top: 0` and `align-self: flex-start` will effectively behave like `position: fixed` within the flex container, which is the desired behavior... but the `height: calc(100vh - 73px)` is fragile because:

- The header height is not fixed — it varies between mobile (padding 12px) and desktop (padding 16px), and depends on the content height of the appName/appSub text.
- The hardcoded `73px` and `57px` values will silently break if header padding or font sizes change.

**Fix:** Instead of `height: calc(100vh - 73px)`, use `height: calc(100dvh - var(--header-height))` where `--header-height` is set dynamically, OR use `position: sticky; top: 0; height: 100vh` with the flex context handling the offset, OR (simplest) use this pattern:

```css
.body {
  display: flex;
  height: calc(100vh - <header>);  /* or use 100dvh */
}
.sidebar {
  overflow-y: auto;
  /* no sticky, no height calc — flex child stretches naturally */
}
.main {
  flex: 1;
  overflow-y: auto;
}
```

With `min-height: 0` on `.body` and the grid row being `1fr`, the `.body` fills the remaining viewport height after the header. Then the sidebar and main content both scroll independently within that space, and no hardcoded pixel values are needed.

---

### 3. MUST FIX — Duplicate `aria-label="Main navigation"` on Sidebar and BottomTabBar

Both `Sidebar` and `BottomTabBar` render `<nav aria-label="Main navigation">`. When both are in the DOM simultaneously (they are — one is hidden via CSS `display: none` but still present in the DOM), screen readers may announce two landmarks with the same label, which is a WCAG violation (landmark regions must have unique labels when multiple of the same type exist).

**Fix:** Give them distinct labels:

- Sidebar: `aria-label="Main navigation"`
- BottomTabBar: `aria-label="Main navigation (mobile)"`

Or use `aria-hidden="true"` on the visually hidden one, but that requires JavaScript to track the breakpoint, which is more complex.

---

### 4. MUST FIX — Test 2 ("renders all nav links") will find duplicate links and may be ambiguous

Both Sidebar and BottomTabBar render all 5 NAV_ITEMS as `<a>` elements. `screen.findByRole('link', { name: /Net Worth/ })` will fail because `findByRole` with `getBy*` throws when multiple elements match. The plan acknowledges "both Sidebar and BottomTabBar links are present in the DOM" but then uses `findByRole` which requires exactly one match.

**Fix:** Use `screen.findAllByRole('link', { name: /Net Worth/ })` and assert `length >= 1`, or `expect(links).toHaveLength(2)` to verify both nav components rendered. Alternatively, use `within(sidebar)` to scope the query to one nav element.

The same issue affects Tests 4, 5, 6, and 7 where `findByRole('link', ...)` or `getByRole('link', ...)` is used — these will also find duplicates.

---

### 5. SHOULD FIX — `overflow-y: auto` on `.main` may break pages that rely on viewport-relative sizing

Setting `overflow-y: auto` on `.main` creates a **new scroll container**. Any page content that uses `position: sticky` (e.g., table headers that stick during scroll) or `100vh`-based heights will now be relative to `.main`'s scroll container rather than the viewport. Check if any existing pages use these patterns.

`GroupsPage` has charts and tables that may benefit from sticky headers in the future. `BudgetTable` uses `position: sticky` on its header row (check `BudgetTable.module.css`). If the budget table header is `position: sticky`, changing the scroll container could break its behavior.

**Fix:** Verify `BudgetTable.module.css` for any `position: sticky` usage. If found, test that sticky behavior still works within the new `.main` scroll container.

---

### 6. SHOULD FIX — No loading/skeleton state in NetWorthPage before data arrives

The plan's NetWorthPage code shows the page header immediately but renders nothing between the header and the error/data states. When `stats`, `history`, and `accounts` are all `null` (initial state, before fetch completes), the component renders the header and then the non-error branch: `<StatsCards stats={null} />`, `<NetWorthChart history={null} />`, `<AccountsBreakdown accounts={null} />`.

This depends on those child components gracefully handling `null` props. Today they likely do (since the current App.jsx also starts with `null` state and renders them), but the architecture doc section 7.4 lists "Renders loading/skeleton state before data arrives" as a test. The plan's code has no explicit loading state — it relies on child components to handle nulls.

**Fix:** Either add an explicit loading guard (`if (!stats) return <div>Loading...</div>`) or confirm and document that child components handle null props gracefully. The test plan expects a loading state that the code does not implement.

---

### 7. SHOULD FIX — The `headerRight` div becomes nearly empty

After removing the refresh button and "Updated at" timestamp, `headerRight` contains only the version badge. The flex layout with `gap: 8px` and `gap: 12px` (at desktop) is fine for a single element, but the `.headerRight` media query at 768px that changes `gap` from 8px to 12px becomes pointless with only one child.

This is not a bug, but it is dead CSS. **Fix:** Remove the `gap` change from the `@media (min-width: 768px)` block for `.headerRight` since there is only one child and gap has no effect.

---

### 8. SHOULD FIX — The plan does not address what happens on initial load at `/`

The route table shows `/ -> <Navigate to="/networth" replace />`. The architecture doc correctly explains this uses `replace` to avoid a back-button trap. However, the plan's test helper defaults to `renderApp('/networth')` — no test verifies that the redirect from `/` to `/networth` actually works.

**Fix:** Add a test:

```jsx
it('redirects / to /networth', async () => {
  renderApp('/')
  await waitFor(() => {
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
  })
})
```

---

### 9. SHOULD FIX — The plan does not test the 404 catch-all route

The route `* -> <Navigate to="/networth" replace />` is defined but never tested. A typo'd route like `/bogus` should redirect to net worth.

**Fix:** Add a test:

```jsx
it('redirects unknown routes to /networth', async () => {
  renderApp('/bogus')
  await waitFor(() => {
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
  })
})
```

---

### 10. SHOULD FIX — NavLink `end` prop needed for `/` path matching

The plan does not use the `end` prop on any `NavLink`. For the five routes (`/networth`, `/groups`, `/budgets`, `/builder`, `/sync`), this is fine because none is a prefix of another. However, if a route like `/networth/details` were ever added, the `/networth` NavLink would match both `/networth` and `/networth/details` without `end`.

This is acceptable for now since no nested routes exist, but the architecture doc's section on NavLink active class detection (check item 8 in the review checklist) should note this. **Fix:** Add a brief comment in `nav.js` or the architecture doc noting that `end` prop may be needed if sub-routes are introduced.

---

### 11. SHOULD FIX — Setup gate deep-link behavior is not tested

If a user deep-links to `/budgets` before the app is configured (`configured === false`), the setup gate renders `<SetupPage>` before routes are evaluated, so the URL remains `/budgets`. After setup completes (`setConfigured(true)`), the routes render — and the user correctly lands on `/budgets` because the URL never changed. This is correct behavior, but no test verifies it.

**Fix:** Add a test that verifies deep-link preservation through setup:

```jsx
it('preserves deep-link route after completing setup', async () => {
  mockFetch({ '/api/setup/status': { configured: false } })
  renderApp('/budgets')
  // Setup page shows
  await waitFor(() => expect(screen.getByTestId('setup-page')).toBeInTheDocument())
  // After setup completes, budgets page should render
  // (would need to trigger onComplete callback in the test)
})
```

---

### 12. CONSIDER — Browser back/forward across setup gate boundary

If the user is on `/networth`, then navigates to `/budgets`, then the app state changes to `configured === false` (which cannot happen in practice since there is no "unconfigure" action), the setup gate would intercept. When `configured` becomes `true` again, the user returns to whatever URL is in the address bar. This is a theoretical edge case with no practical impact, but it is worth noting that the setup gate does not push any history entries — it simply conditionally renders before routes, which is correct.

No action needed.

---

### 13. CONSIDER — Focus management on route change

The plan uses basic React Router navigation with no focus management. When a user clicks a sidebar link, focus stays on the link. The main content area changes but screen reader users receive no announcement of the page change. Sighted keyboard users who tab after clicking a link may find focus still in the sidebar rather than the new page content.

React Router v6 does not handle focus management automatically. For a personal localhost tool, this is acceptable, but for completeness:

**Fix (optional):** Add a simple `useEffect` in App.jsx that moves focus to the `<main>` element on route change using `useLocation()`:

```jsx
const location = useLocation()
const mainRef = useRef(null)
useEffect(() => {
  mainRef.current?.focus()
}, [location.pathname])
```

And add `tabIndex={-1}` and `ref={mainRef}` to the `<main>` element. This is a quality-of-life improvement, not a blocker.

---

### 14. CONSIDER — Bottom tab bar `env(safe-area-inset-bottom)` changes effective height

The BottomTabBar has `height: 56px` and `padding-bottom: env(safe-area-inset-bottom, 0)`. On devices with a home indicator (iPhone X+), the `padding-bottom` adds ~34px, making the effective height ~90px. The `.body` mobile padding is `60px` (56px + 4px breathing room), which does not account for the safe area inset. Content could be hidden behind the taller bar on iOS devices.

**Fix (optional):** Change the mobile body padding to:

```css
@media (max-width: 767px) {
  .body {
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0));
  }
}
```

---

### 15. CONSIDER — Existing page components need no changes

Verified: `GroupsPage`, `BudgetPage`, `BudgetBuilderPage`, and `SyncPage` all render self-contained content with their own CSS modules. None depends on being inside a specific parent container or reads `activeTab` or any App-level state. They will work correctly as route targets with no modifications. This matches the plan's claim.

No action needed.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| **MUST FIX** | 4 | #1 (missing BudgetBuilderPage mock), #2 (sidebar height fragility), #3 (duplicate aria-label), #4 (duplicate link query in tests) |
| **SHOULD FIX** | 7 | #5 (overflow-y scroll container), #6 (missing loading state), #7 (dead CSS), #8 (no redirect test), #9 (no 404 test), #10 (NavLink end prop note), #11 (deep-link setup test) |
| **CONSIDER** | 3 | #12 (setup gate history — no action), #13 (focus management), #14 (safe area padding) |

The plan is solid overall. The NetWorthPage extraction is complete and correct — all five state variables, the `loadDashboardData` function, the data-fetching `useEffect`, the error UI, the refresh button, and the timestamp are accounted for. The route structure, architecture decisions, and component design are sound. The four MUST FIX items are the only blockers before implementation can proceed.
