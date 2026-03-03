# Architecture Decisions — Sidebar Navigation with URL Routing

**Date:** 2026-03-03
**Agent:** Staff Architect Agent (Step 2 of planning pipeline)
**Change size:** M
**Input:** `docs/plans/sidebar-nav-research.md`

---

## 1. Selected Approach

**BrowserRouter in `main.jsx` + `<Routes>` in `App.jsx` + fixed sidebar on desktop + bottom tab bar on mobile.**

Rationale:
- `BrowserRouter` is validated by the existing infrastructure — both Vite dev server and nginx `try_files` already handle SPA fallback. No config changes anywhere.
- The classic `<Routes>` / `<Route>` API is the right fit because: no route-level data loaders are needed (pages self-fetch), no SSR, no deferred data. The data router API (`createBrowserRouter`) adds complexity with zero benefit here.
- Fixed-width sidebar is appropriate for a 5-item personal tool. Collapse mechanics are not worth the state management and animation complexity.
- Bottom tab bar on mobile replaces the current horizontal-scroll tab bar, which requires scrolling to see all 5 items. A bottom bar makes all items visible and thumb-accessible.

---

## 2. Rejected Alternatives

### 2.1 `createBrowserRouter` + `RouterProvider` (Option B from research)
**Rejected.** The data router API exists to enable route-level `loader` and `action` functions. All five pages already self-fetch data in `useEffect`. Adopting the data router would require restructuring data fetching into loaders for no user-facing benefit. It also makes test setup more complex (`createMemoryRouter` requires defining a full route config in every test).

### 2.2 Manual `history.pushState` sync (Option C from research)
**Rejected.** This reinvents what react-router already solves — browser back/forward handling, active link detection, route matching. It is fragile (requires manual `popstate` listeners, manual URL parsing on refresh) and has no upside over the library.

### 2.3 Collapsible sidebar
**Rejected for this iteration.** A collapsible sidebar requires: toggle state, animation CSS/transitions, tooltip-on-hover for collapsed icons, localStorage persistence of collapse preference. The payoff is marginal — 5 short labels in a personal tool do not oppress the content area. The sidebar is hidden entirely below 768px anyway. Can be added later as enhancement if requested.

### 2.4 Hamburger drawer on mobile
**Rejected.** A hamburger menu requires a tap to open, then a tap to navigate — two taps versus one. A bottom tab bar shows all 5 items simultaneously and is in the thumb zone. For 5 items, a bottom bar is strictly superior. Hamburger drawers are appropriate when the nav has 8+ items.

### 2.5 Keep horizontal tab bar on mobile + sidebar on desktop only
**Rejected.** The horizontal tab bar requires scrolling to see all 5 items on narrow viewports. A bottom tab bar is a strict upgrade — all items visible, no scroll, thumb-reachable. There is no reason to preserve the inferior pattern.

---

## 3. Open Questions — Answers

### 3.1 Refresh button placement
**Decision: Move into NetWorthPage as a page-level action.**

The Refresh button currently sits in the global header and calls `loadDashboardData()` in App.jsx. This couples the header to net worth data. With routing, the button should only appear when the user is on the Net Worth page — it makes no sense to show "Refresh" when viewing Budgets.

Implementation: `NetWorthPage` gets its own page header row with "Net Worth" title on the left, refresh button and "Updated at" timestamp on the right. This matches the pattern other pages could adopt (e.g., Sync page already has its own action buttons).

The global header becomes simpler: just the logo, app name, subtitle, and version badge. No data-coupled controls.

### 3.2 "Updated at" timestamp placement
**Decision: Move into NetWorthPage alongside the refresh button.**

Same rationale as 3.1. The timestamp is semantically tied to net worth data freshness. It should live where that data lives. The global header does not need to know about individual page data state.

Layout within NetWorthPage:
```
┌─────────────────────────────────────────────────┐
│  Net Worth                Updated at 3:42 PM  ↻ │
├─────────────────────────────────────────────────┤
│  [StatsCards]                                    │
│  [NetWorthChart]                                 │
│  [AccountsBreakdown]                             │
```

### 3.3 `/` redirect vs direct render
**Decision: `<Navigate to="/networth" replace />` at `/`.**

Reasons:
- The URL bar should always reflect the actual page. If `/` rendered NetWorthPage, the user would see net worth content but the URL would say `/` — inconsistent with the sidebar active state (which uses URL matching).
- `replace` ensures `/` does not pollute browser history. Typing the app URL and pressing Enter lands on `/networth` without a back-button trap.
- This is a one-liner with `<Navigate>` from react-router-dom.

### 3.4 Icons: emoji vs SVG
**Decision: Keep emoji for now. No new icon library.**

Rationale:
- Adding `lucide-react` or similar is a separate concern from navigation architecture. It adds ~8kb to the bundle, a new dependency to maintain, and design decisions about icon weight/size that are orthogonal to routing.
- The current emoji icons (chart increasing, hexagon, money bag, construction, arrows) work visually and are already familiar to the user.
- Emoji render consistently in the dark theme (they are not affected by CSS color).
- A future "polish" pass can swap emoji for SVG icons without any structural changes — the sidebar `NAV_ITEMS` array is the single source of truth.
- One exception: the hexagon character `⬡` for Account Groups renders poorly at small sizes. Note this for the future polish pass.

---

## 4. Route Structure

### 4.1 Route Table

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `<Navigate to="/networth" replace />` | Redirect only, no component |
| `/networth` | `<NetWorthPage />` | New component, extracted from App.jsx |
| `/groups` | `<GroupsPage />` | Existing, no changes |
| `/budgets` | `<BudgetPage />` | Existing, no changes |
| `/builder` | `<BudgetBuilderPage />` | Existing, no changes |
| `/sync` | `<SyncPage />` | Existing, no changes |
| `*` | `<Navigate to="/networth" replace />` | 404 catch-all redirects to net worth |

### 4.2 Setup Gate
The `configured === null` (loading) and `configured === false` (setup) states remain **outside the router** — they are checked in `App.jsx` before any routes render. `SetupPage` is not a route. This is unchanged behavior.

### 4.3 404 Handling
**Decision: Silent redirect to `/networth`.** This is a personal localhost tool with 5 known routes. A custom 404 page is not worth building. The catch-all `*` route redirects home. If the user typos a URL, they land on Net Worth — acceptable UX for a single-user tool.

### 4.4 Nav Items — Single Source of Truth

```jsx
// Shared between Sidebar and BottomTabBar
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',       icon: '\ud83d\udcc8' },
  { path: '/groups',   label: 'Account Groups',  icon: '\u2b21'  },
  { path: '/budgets',  label: 'Budgets',         icon: '\ud83d\udcb0' },
  { path: '/builder',  label: 'Budget Builder',  icon: '\ud83c\udfd7'  },
  { path: '/sync',     label: 'Sync Data',       icon: '\ud83d\udd04'  },
]
```

This array is defined once in a shared location (`src/nav.js`) and imported by both `Sidebar` and `BottomTabBar`. Never duplicate nav item definitions.

---

## 5. Component Architecture

### 5.1 Sidebar Component

**File:** `src/components/Sidebar.jsx` + `src/components/Sidebar.module.css`

**Behavior:**
- Renders `NAV_ITEMS` as `<NavLink>` elements (from react-router-dom).
- `NavLink` provides `isActive` automatically via URL matching — no manual state needed.
- Active state: accent-colored left border + accent text color. Inactive: muted text, no border.
- Visible only on desktop (`>= 768px`). Hidden via CSS `display: none` on mobile.

**Props:** None. The sidebar is self-contained — it reads route state from the router context and nav items from the shared `NAV_ITEMS` array.

**Structure:**
```jsx
<nav className={styles.sidebar} aria-label="Main navigation">
  {NAV_ITEMS.map(item => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
      }
    >
      <span className={styles.navIcon}>{item.icon}</span>
      <span className={styles.navLabel}>{item.label}</span>
    </NavLink>
  ))}
</nav>
```

### 5.2 BottomTabBar Component

**File:** `src/components/BottomTabBar.jsx` + `src/components/BottomTabBar.module.css`

**Behavior:**
- Renders `NAV_ITEMS` as `<NavLink>` elements in a horizontal row pinned to the viewport bottom.
- Active state: accent-colored text + icon. Inactive: muted color.
- Visible only on mobile (`< 768px`). Hidden via CSS `display: none` on desktop.
- Fixed position at viewport bottom with `z-index: 20` (same as header).
- Labels displayed below icons at smaller font size.

**Props:** None. Same self-contained pattern as Sidebar.

**Structure:**
```jsx
<nav className={styles.bottomBar} aria-label="Main navigation">
  {NAV_ITEMS.map(item => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        `${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`
      }
    >
      <span className={styles.tabIcon}>{item.icon}</span>
      <span className={styles.tabLabel}>{item.label}</span>
    </NavLink>
  ))}
</nav>
```

### 5.3 NetWorthPage Extraction

**File:** `src/pages/NetWorthPage.jsx` (new) + `src/pages/NetWorthPage.test.jsx` (new)

**Decision: Move data fetching INTO NetWorthPage** (not prop-passing from App).

This aligns NetWorthPage with the established pattern — all other pages (Groups, Budget, BudgetBuilder, Sync) own their own data lifecycle. It also simplifies App.jsx significantly by removing 5 state variables, the `loadDashboardData` function, and the conditional data-fetching `useEffect`.

NetWorthPage will contain:
- The `loadDashboardData()` function (moved from App)
- State for `stats`, `history`, `accounts`, `error`, `lastUpdated`
- A page header row with title, "Updated at" timestamp, and refresh button
- The existing `StatsCards`, `NetWorthChart`, `AccountsBreakdown` child components
- The error state UI (API connection error box)

**What App.jsx loses:**
- `stats`, `history`, `accounts`, `error`, `lastUpdated` state
- `loadDashboardData()` function
- The `useEffect` that triggers data fetch when `configured === true`
- All inline Net Worth JSX
- The refresh button and "Updated at" in the header

### 5.4 App.jsx Shell — New Structure

After refactoring, App.jsx becomes a thin layout shell:

```jsx
export default function App() {
  const [configured, setConfigured] = useState(null)

  useEffect(() => {
    fetchSetupStatus()
      .then(d => setConfigured(d.configured))
      .catch(() => setConfigured(false))
  }, [])

  if (configured === null) return <div className={styles.loading}>Loading...</div>
  if (configured === false) return <SetupPage onComplete={() => setConfigured(true)} />

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>◈</div>
          <div>
            <div className={styles.appName}>Stashtrend</div>
            <div className={styles.appSub}>Personal Finance Intelligence Powered by Monarch Money Data</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.versionBadge}>v{version}</span>
        </div>
      </header>

      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Navigate to="/networth" replace />} />
            <Route path="/networth" element={<NetWorthPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/budgets" element={<BudgetPage />} />
            <Route path="/builder" element={<BudgetBuilderPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="*" element={<Navigate to="/networth" replace />} />
          </Routes>
        </main>
      </div>

      <BottomTabBar />
    </div>
  )
}
```

### 5.5 main.jsx — Router Wrapper

```jsx
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

The `BrowserRouter` wraps at the top level so both `App` and all child components have router context.

### 5.6 Global State

| State | Location | Rationale |
|-------|----------|-----------|
| `configured` | `App.jsx` | Gate for the entire app — must live above routes |
| Net worth data | `NetWorthPage` | Page-local, consistent with all other pages |
| All other page data | Respective page components | Already the case, unchanged |

No Context API, no state management library needed. The app has no cross-page shared state.

---

## 6. CSS Layout Specification

### 6.1 Desktop Layout (>= 768px)

`.root` becomes a full-viewport grid:

```css
.root {
  min-height: 100vh;
  background: var(--bg-root);
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr;
}
```

`.body` is a new wrapper for sidebar + main content:

```css
.body {
  display: flex;
  flex-direction: row;
  min-height: 0; /* allow flex children to scroll independently */
}
```

### 6.2 Sidebar CSS

```css
.sidebar {
  display: none; /* hidden on mobile by default */
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-deep);
  border-right: 1px solid var(--border);
  padding: var(--sp-4) 0;
  overflow-y: auto;
  position: sticky;
  top: 0;       /* sticks below the header due to grid row placement */
  height: calc(100vh - <header-height>);
}

@media (min-width: 768px) {
  .sidebar { display: flex; flex-direction: column; }
}
```

**Sidebar nav item:**

```css
.navItem {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  border-left: 3px solid transparent;
  transition: color var(--ease-default), background var(--ease-default), border-color var(--ease-default);
}

.navItem:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.navItemActive {
  color: var(--accent-light);
  border-left-color: var(--accent);
  background: var(--bg-hover);
}
```

Design token usage:
- `--bg-deep` (#161b27) for sidebar background — one step darker than `--bg-root`, creating visual separation without a heavy border.
- `--border` (#2d3348) for the right edge.
- `--accent` (#6366f1) for the active indicator border.
- `--accent-light` (#818cf8) for active item text — slightly brighter than `--accent` for better readability on dark background.
- `--bg-hover` (#252a3d) for hover and active background.
- `--sp-3` (12px), `--sp-5` (20px) for padding, keeping consistent with the spacing scale.

### 6.3 Main Content Area

```css
.main {
  flex: 1;
  min-width: 0;        /* prevent flex blowout */
  max-width: 1200px;
  padding: var(--sp-5) var(--sp-4); /* 20px 16px — unchanged mobile */
  overflow-y: auto;
}

@media (min-width: 768px) {
  .main { padding: var(--sp-8) var(--sp-6); } /* 32px 24px */
}
```

Note: The `max-width: 1200px` stays on `.main` but `margin: 0 auto` is removed — the content aligns to the left edge of its flex area on desktop, because the sidebar already offsets it. On mobile (no sidebar), the content is full-width with padding.

### 6.4 Bottom Tab Bar CSS

```css
.bottomBar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  z-index: 20;
  padding-bottom: env(safe-area-inset-bottom, 0); /* iPhone notch */
}

@media (min-width: 768px) {
  .bottomBar { display: none; }
}
```

**Tab bar item:**

```css
.tabItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 10px;
  font-weight: 500;
  padding: var(--sp-2) var(--sp-1);
  transition: color var(--ease-default);
}

.tabIcon {
  font-size: 20px;
  line-height: 1;
}

.tabLabel {
  font-size: 10px;
}

.tabItemActive {
  color: var(--accent-light);
}
```

Design token usage:
- `--bg-card` (#1e2130) for the bar background — slightly raised from root, matching existing card surfaces.
- `--border` (#2d3348) for the top edge.
- `--accent-light` (#818cf8) for the active item.

### 6.5 Mobile Body Padding

When the bottom tab bar is visible, the main content needs bottom padding to prevent content from being hidden behind the fixed bar:

```css
@media (max-width: 767px) {
  .body {
    padding-bottom: 60px; /* 56px bar height + 4px breathing room */
  }
}
```

### 6.6 Transition Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 768px | No sidebar, bottom tab bar visible, header compact |
| >= 768px | Sidebar visible (220px), no bottom tab bar, header full |

Single breakpoint at 768px. No intermediate "tablet" state needed — the sidebar is narrow enough (220px) that it works well from 768px up. The existing breakpoint comments in `index.css` define 768px as the mobile/tablet boundary, so this is consistent.

### 6.7 Header Adjustments

The header loses the refresh button and "Updated at" on all viewports. The `headerRight` div retains only the version badge. This simplifies the header CSS — the `updatedAt` class and `refreshBtn` class can be **removed from App.module.css** (they move to NetWorthPage's styles).

---

## 7. Test Strategy

### 7.1 App.test.jsx Changes

**All `render(<App />)` calls must be wrapped in `<MemoryRouter>`.**

Since `BrowserRouter` is added in `main.jsx`, the `App` component itself expects to be inside a router context (it uses `<Routes>`, `<Route>`, `<Navigate>`, `<NavLink>`). In tests, we use `MemoryRouter` to control the initial URL.

```jsx
import { MemoryRouter } from 'react-router-dom'

// Helper
function renderApp(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  )
}
```

**Test changes by current test:**

| Current test | Change needed |
|-------------|--------------|
| "renders the app name in the header" | Wrap in `MemoryRouter`. Assertion unchanged. |
| "renders all four tab buttons" | **Rewrite.** Tab buttons become `NavLink`s in `Sidebar`/`BottomTabBar`. Assert that nav links exist (by role `link` instead of `button`). |
| "shows Net Worth content by default" | Wrap with `initialEntries={['/networth']}`. Assertions unchanged. |
| "switches to Account Groups tab when clicked" | Click the "Account Groups" link (now an `<a>` from `NavLink`). Same assertion on `data-testid`. |
| "switches to Sync Data tab when clicked" | Same pattern. |
| "switches to Budgets tab when clicked" | Same pattern. |
| "can switch back from Groups to Net Worth" | Click groups link, then net worth link. Same assertion. |
| "shows API error state when data fetch fails" | Wrap in `MemoryRouter`. Assertion unchanged — error box now renders inside `NetWorthPage`. |
| "renders a Refresh button" | **Rewrite.** Refresh button is now inside `NetWorthPage`, not the global header. Test must navigate to `/networth` and find the button there. |
| "shows loading state" | Unchanged (loading state renders before routes). |
| "shows SetupPage when not configured" | Unchanged (setup gate is pre-router). |

**Net test count change for App.test.jsx:** Same number of tests (10), most need only the `MemoryRouter` wrapper added. Two tests need assertion updates (tab buttons becoming links, refresh button moving).

### 7.2 New Sidebar Tests

**File:** `src/components/Sidebar.test.jsx`

Tests:
1. Renders all 5 nav items with correct labels.
2. Each nav item links to the correct `href` (`/networth`, `/groups`, etc.).
3. The nav item matching the current route has the active class.
4. Non-matching nav items do not have the active class.
5. Clicking a nav item navigates (assert URL change in `MemoryRouter`).

All tests use `MemoryRouter` wrapping with controlled `initialEntries`.

### 7.3 New BottomTabBar Tests

**File:** `src/components/BottomTabBar.test.jsx`

Tests:
1. Renders all 5 tab items with correct labels.
2. Each tab item links to the correct `href`.
3. The tab item matching the current route has the active class.
4. Clicking a tab item navigates.

Structurally identical to Sidebar tests — both components render the same `NAV_ITEMS` with the same `NavLink` pattern.

### 7.4 New NetWorthPage Tests

**File:** `src/pages/NetWorthPage.test.jsx`

Tests:
1. Renders loading/skeleton state before data arrives.
2. Renders `StatsCards`, `NetWorthChart`, `AccountsBreakdown` after data loads.
3. Renders error state when API fetch fails.
4. Renders refresh button.
5. Clicking refresh re-fetches data.
6. Renders "Updated at" timestamp after data loads.

These tests do NOT need `MemoryRouter` wrapping (NetWorthPage does not use router hooks). They mock `fetch` to control API responses, same pattern as existing page tests.

### 7.5 Existing Test Files — No Changes

All other test files (28 files) are unaffected:
- Page tests (`GroupsPage.test.jsx`, `BudgetPage.test.jsx`, etc.) render their page directly, no router context needed.
- Component tests (`StatsCards.test.jsx`, `AccountsBreakdown.test.jsx`, etc.) are pure component tests.
- Integration tests render page-level components directly.

---

## 8. Risks & Mitigations

### 8.1 Net Worth Data Refetch on Re-navigation — LOW

When the user navigates away from `/networth` and back, `NetWorthPage` unmounts and remounts, triggering a fresh data fetch. This is the same behavior as clicking a different tab and back today. For a personal finance tool, re-fetching on revisit is actually desirable — the data may have been updated by a sync.

**Mitigation:** None needed. Behavior is acceptable and arguably beneficial.

### 8.2 SyncPage Polling Lifecycle — NO RISK

SyncPage's polling interval is cleaned up on unmount. React Router unmounts route components on navigation, same as the current conditional render. Behavior is identical.

### 8.3 `react-router-dom` Version — LOW

**Decision: Install `react-router-dom@^6`.** Pin to v6.x only (not v7) to avoid any breaking changes from the v7 migration that introduced new conventions. The v6 API (`BrowserRouter`, `Routes`, `Route`, `NavLink`, `Navigate`) is stable and will remain supported. The `^6` range allows patch updates for security fixes.

**Mitigation:** Lock to `^6` in package.json. Do not use any v7-only APIs.

### 8.4 CSS Module Class Name Conflicts — NEGLIGIBLE

New CSS modules (`Sidebar.module.css`, `BottomTabBar.module.css`) are scoped by CSS Modules — class names are locally scoped. No global conflicts possible. The only file with global classes is `index.css`, which we are not modifying.

### 8.5 Stale `activeTab` References in Other Code — LOW

The `activeTab` state and `TABS` constant in App.jsx are removed. If any other code references these (via import or copy), it would break.

**Mitigation:** Search for `activeTab` and `TABS` imports across the codebase before implementation. Current audit shows they are only used in `App.jsx` — not imported elsewhere.

### 8.6 Browser Back Button at App Entry — LOW

If the user opens the app fresh at `/networth`, the browser Back button has no previous route in the SPA history — it would navigate to whatever page they were on before the app. This is standard SPA behavior and not a regression.

**Mitigation:** None needed. Standard browser behavior.

---

## 9. File Change Summary

### New files (5):
| File | Purpose |
|------|---------|
| `src/nav.js` | Shared `NAV_ITEMS` array |
| `src/pages/NetWorthPage.jsx` | Extracted net worth page with own data fetching |
| `src/components/Sidebar.jsx` + `.module.css` | Desktop sidebar navigation |
| `src/components/BottomTabBar.jsx` + `.module.css` | Mobile bottom tab bar |

### Modified files (4):
| File | Changes |
|------|---------|
| `package.json` | Add `react-router-dom@^6` |
| `src/main.jsx` | Wrap `<App>` in `<BrowserRouter>` |
| `src/App.jsx` | Remove tab state, remove net worth data/UI, add `<Routes>`, import Sidebar/BottomTabBar, restructure layout |
| `src/App.module.css` | Remove tabBar/tabBtn styles, add body flex layout, remove refreshBtn/updatedAt (moved to NetWorthPage) |

### New test files (4):
| File | Tests |
|------|-------|
| `src/pages/NetWorthPage.test.jsx` | 6 tests |
| `src/components/Sidebar.test.jsx` | 5 tests |
| `src/components/BottomTabBar.test.jsx` | 4 tests |

### Modified test files (1):
| File | Changes |
|------|---------|
| `src/App.test.jsx` | Add `MemoryRouter` wrapping, update nav assertions from buttons to links |

### Unchanged files:
- All existing page components (GroupsPage, BudgetPage, BudgetBuilderPage, SyncPage, SetupPage)
- All existing component files and their tests
- All integration tests
- Backend (zero backend changes)
- nginx.conf, vite.config.js, index.css

---

## 10. Implementation Order

Recommended sequence for the Engineer Agent:

1. `npm install react-router-dom@^6` (dependency first)
2. Create `src/nav.js` (shared data, no dependencies)
3. Create `src/pages/NetWorthPage.jsx` + tests (extract from App, test in isolation)
4. Create `src/components/Sidebar.jsx` + CSS + tests
5. Create `src/components/BottomTabBar.jsx` + CSS + tests
6. Modify `src/main.jsx` (add BrowserRouter)
7. Modify `src/App.jsx` (the main refactor — remove old tab system, add routes, add layout)
8. Modify `src/App.module.css` (layout restructure)
9. Update `src/App.test.jsx` (add MemoryRouter, fix assertions)
10. Run full test suite, fix any failures

Steps 2-5 can be developed and tested independently before touching App.jsx. Step 7 is the integration point where everything connects.
