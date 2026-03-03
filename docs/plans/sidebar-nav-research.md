# Research Report — Sidebar Navigation with URL Routing

**Date:** 2026-03-03
**Agent:** Research Agent (Step 1 of planning pipeline)
**Change size:** M — multi-file, new feature, involves test migration

---

## 1. Current Implementation Audit

### 1.1 Navigation Mechanism

The app uses a single `App.jsx` component with a `useState('networth')` tab controller. Navigation is handled by `setActiveTab(id)`, which conditionally renders content with `{activeTab === 'x' && <Page />}`. There is no URL involvement; the address bar always shows `/`.

```jsx
// App.jsx — current pattern
const [activeTab, setActiveTab] = useState('networth')

// Tab bar — 5 buttons in a horizontal <nav>
const TABS = [
  { id: 'networth', label: '📈  Net Worth' },
  { id: 'groups',   label: '⬡  Account Groups' },
  { id: 'budgets',  label: '💰  Budgets' },
  { id: 'builder',  label: '🏗  Budget Builder' },
  { id: 'sync',     label: '🔄  Sync Data' },
]
```

**Critical observation:** All 5 pages are conditionally rendered at the same level. Each page component self-fetches its own data in `useEffect` on mount (not parent-driven). This is important: routing won't break data fetching — each page already owns its data lifecycle.

### 1.2 State Architecture

State in `App.jsx`:
- `configured` / `activeTab` — shell state
- `stats`, `history`, `accounts`, `lastUpdated`, `error` — Net Worth tab data fetched at the App level via `loadDashboardData()`
- All other page state lives within their own page components (Groups, Budget, BudgetBuilder, Sync)

The Net Worth data is the only exception: it is fetched by `App.jsx` (not `NetWorthPage`), because Net Worth isn't its own page component — the three sub-components (`StatsCards`, `NetWorthChart`, `AccountsBreakdown`) are rendered inline in App.jsx's JSX. This means the Net Worth section needs a small refactor to become a proper `NetWorthPage` component when routing is introduced.

### 1.3 Layout Structure

```
┌─────────────────────────────────────────────────┐
│ header (sticky, position: sticky; top: 0)        │
├─────────────────────────────────────────────────┤
│ tabBar (horizontal scroll on mobile)             │
├─────────────────────────────────────────────────┤
│ main (max-width: 1200px; margin: 0 auto)         │
│   padding: 20px 16px → 32px 24px at 1024px      │
└─────────────────────────────────────────────────┘
```

The layout is entirely vertical stacking. There is no existing flex-row or grid layout at the shell level that a sidebar could slot into. The CSS restructuring is non-trivial.

### 1.4 No React Router Installed

`package.json` has no `react-router-dom`. It must be added as a new dependency (currently: `react`, `react-dom`, `recharts`, `prop-types`).

### 1.5 Infrastructure — BrowserRouter is Already Supported

Both deployment targets support HTML5 History API routing:

- **Vite dev server:** no config changes needed — Vite's dev server already handles SPA fallback for all routes.
- **nginx (Docker production):** `nginx.conf` already has `try_files $uri $uri/ /index.html;` — the SPA fallback is in place. BrowserRouter will work without any nginx changes.

This is a strong finding: **HashRouter is unnecessary.** BrowserRouter is the correct choice.

---

## 2. Page Component Inventory

| Component | File | Self-fetching? | Props received | Key state |
|-----------|------|---------------|----------------|-----------|
| Net Worth (inline) | `App.jsx` | No (App fetches) | `stats`, `history`, `accounts`, `error` | n/a — must become a page |
| `GroupsPage` | `pages/GroupsPage.jsx` | Yes (useEffect on mount) | None | groups, accounts, historyData, snapshot, configs |
| `BudgetPage` | `pages/BudgetPage.jsx` | Yes (useEffect on `months`) | None | budgetData, months, loading, error |
| `BudgetBuilderPage` | `pages/BudgetBuilderPage.jsx` | Yes (useEffect on mount) | None | aiConfigured, profile, regional, plan |
| `SyncPage` | `pages/SyncPage.jsx` | Yes (useEffect on mount) | None | history, displayedJob, isRunning, polling |
| `SetupPage` | `pages/SetupPage.jsx` | No | `onComplete` callback | token, loading, error |

**Key insight:** 4 of 5 navigable pages are already fully self-contained. The only component that needs a wrapper is Net Worth. SetupPage is a pre-auth gate and should remain outside the router.

---

## 3. Test Impact Analysis

### 3.1 Test File Inventory

Total test files in `frontend/src/`: **28 files**

Files that directly test tab/navigation behavior (highest migration cost):

**`App.test.jsx` (9 tests) — highest impact:**
- Tests that click tab buttons by label text: "Net Worth", "Account Groups", "Budgets", "Sync Data"
- Tests check `data-testid` presence/absence after clicking (e.g., `groups-page`, `sync-page`)
- After routing, clicking would navigate via `<NavLink>` or `<Link>`, which needs `MemoryRouter` wrapping in tests
- The `App` render will fail in tests without a router context once `BrowserRouter` is added to `main.jsx`
- **Resolution:** Wrap `<App />` in `MemoryRouter` in all `App.test.jsx` renders, OR extract the router into `main.jsx` and use `createMemoryRouter` + `RouterProvider` in tests

**Page tests (low impact):** All other page tests render their page component directly (e.g., `render(<SyncPage />)`) — these don't touch routing at all. They will be unaffected unless those components start using `useNavigate` or `useParams`, which this feature does not require.

**Integration tests:**
- `BudgetPage.integration.test.jsx`
- `GroupsPage.integration.test.jsx`
- `SyncPage.integration.test.jsx`

These render page-level components directly — same story as unit tests; unaffected unless the pages start importing router hooks.

### 3.2 Quantified Migration Burden

- **Directly affected: 1 test file** (`App.test.jsx`, 9 tests)
- **Indirectly affected: 0 other test files** (no page or component uses router hooks)
- **New tests needed:** sidebar component (NavLink active states, collapse behavior), routing integration
- **Total estimated test changes:** Light. The App tests need router wrapping, not logic rewrites. Test assertions switch from "click tab button" to "click NavLink" — conceptually the same pattern.

---

## 4. Competitor Navigation Patterns

### 4.1 Monarch Money (the source app)

Monarch Money uses a **persistent left sidebar** on desktop with labeled icons, collapsing to a narrower icon-only rail on smaller desktop viewports, and a **bottom tab bar** on mobile. Key items visible: Dashboard, Budgets, Transactions, Recurring, Goals, Investments, Reports, Accounts, Settings. Active item is highlighted with a distinct accent background/color.

### 4.2 YNAB

YNAB uses a **persistent left sidebar** on desktop that does not collapse — it stays expanded at all widths with budget account names as nav items. On mobile it becomes a slide-over drawer. Navigation is entirely route-based with deep-linkable URLs.

### 4.3 Rocket Money

Rocket Money uses a **bottom navigation bar** on mobile (iOS-style 5-item bar) and a **top horizontal tab bar** on desktop for primary sections. Less sidebar-forward than Monarch.

### 4.4 Industry Pattern Consensus

For financial dashboards with 5–8 primary sections:
- **Desktop (≥1024px):** Persistent left sidebar, 240–280px wide, with icon + label nav items. Collapsible to 48–64px icon rail optional.
- **Mobile (<768px):** Bottom tab bar (3–5 items in thumb zone) OR hamburger → slide-over drawer. Bottom bar is more thumb-friendly and is the iOS/Android native convention.
- **Tablet (768–1023px):** Often icon-rail collapsed sidebar OR still full sidebar.

For Stashtrend (5 nav items, localhost personal tool), the cleaner approach is:
- Desktop: persistent expanded sidebar (no collapse required — complexity not worth it for a personal tool)
- Mobile: bottom tab bar (matches the existing horizontal tab bar's muscle memory, better thumb ergonomics)

---

## 5. Solution Approaches Surveyed

### 5.1 React Router Approach Options

**Option A: `BrowserRouter` wrapper in `main.jsx` + `<Routes>` in `App.jsx`**
- Classic v6 pattern. Add `<BrowserRouter>` in main.jsx, define `<Routes>` + `<Route>` in App.jsx.
- Clean separation. App.jsx becomes the layout shell; routes render in a `<Outlet>` or inline.
- Test wrapping: wrap `<App />` in `<MemoryRouter>` for tests.
- Verdict: **Good fit for this codebase.**

**Option B: `createBrowserRouter` + `RouterProvider` + `createMemoryRouter` for tests**
- The "modern" React Router v6.4+ data router approach. Enables `loader` functions for route-level data fetching.
- More powerful, but overkill here — no server-side rendering, no route loaders needed, pages already self-fetch.
- Tests use `createMemoryRouter` instead of `MemoryRouter` wrapper.
- Verdict: Over-engineered for this use case. Adds complexity without benefit.

**Option C: Keep `useState` routing, add `useEffect` to sync URL**
- Manually push to `window.history` via `history.pushState`. No react-router needed.
- Hacky — browser back button won't work without a `popstate` listener, deep links on refresh will 404 (until you handle it), maintaining sync is error-prone.
- Verdict: **Rejected.** This is exactly the problem react-router solves.

**Recommendation: Option A — `BrowserRouter` + `<Routes>` + `<NavLink>`**

### 5.2 Router Type Decision

**BrowserRouter** — confirmed correct. Both Vite dev server and nginx already handle SPA fallback. Clean URLs (`/budgets`, `/sync`). HashRouter (`/#/budgets`) is unnecessary and visually inferior. No server changes required.

### 5.3 Sidebar Collapse vs Fixed Width

**Options:**
1. **Fixed-width expanded sidebar** — always 220–260px. Simplest. No toggle state. Content area gets remaining width.
2. **Collapsible sidebar** — button toggles between 260px (icon+label) and 56px (icon only). Requires `useState`, resize animation, tooltip for icons in collapsed state.
3. **Auto-collapse** — collapses at a breakpoint (e.g., <1280px). CSS media query only, no JS state.

**For Stashtrend:**
- This is a personal localhost tool. The user is one person.
- 5 nav items with short labels — a fixed sidebar is not oppressive.
- The content `max-width: 1200px` already caps page width, so a sidebar of 220px only affects the positioning, not the content layout.
- **Recommendation: Fixed-width sidebar on desktop, bottom tab bar on mobile.** No collapse for now. Tech debt note: add collapse as a future enhancement if requested.

### 5.4 Mobile Navigation Pattern

**Options:**
1. **Bottom tab bar** — 5 icons + labels pinned to viewport bottom. Matches native app conventions and current tab bar muscle memory.
2. **Hamburger → slide-over drawer** — single hamburger icon in header opens a full-height sidebar. Common on desktop-first apps.
3. **Keep horizontal tab bar** on mobile, add sidebar only on desktop.

**Analysis for Stashtrend mobile:**
- The current horizontal scrolling tab bar on mobile (`overflow-x: auto`) works but requires horizontal scrolling to see all 5 items.
- A bottom tab bar is a strict UX improvement: all 5 items visible simultaneously, thumb-zone accessible.
- However, Stashtrend is primarily a desktop tool (personal finance dashboards are data-heavy, rarely used one-handed). Mobile is secondary.
- **Recommendation: Bottom tab bar on mobile (<768px). This replaces the horizontal scroll tab bar.**

---

## 6. Routing Structure Design

### 6.1 Proposed Routes

```
/              → redirect to /networth
/networth      → NetWorthPage (new wrapper for existing inline content)
/groups        → GroupsPage (existing, no changes)
/budgets       → BudgetPage (existing, no changes)
/builder       → BudgetBuilderPage (existing, no changes)
/sync          → SyncPage (existing, no changes)
```

Setup gate remains: if `configured === false`, render `<SetupPage onComplete=... />` before the router renders at all. This is not a route — it's a pre-auth wall, same as today.

### 6.2 NetWorthPage Extraction

The only new page component required. Extract from App.jsx:

```jsx
// src/pages/NetWorthPage.jsx
export default function NetWorthPage({ stats, history, accounts, error }) { ... }
```

The data (`stats`, `history`, `accounts`) stays in App.jsx (fetched on mount when `configured === true`), passed down as props. This keeps the refresh button in the header working — it calls `loadDashboardData()` which re-fetches and updates state in App.jsx, which re-passes to `NetWorthPage`. No `useContext` needed.

**Alternative:** Move data fetching into `NetWorthPage` itself (like all other pages). This would simplify App.jsx further but would break the header's "Updated at {time}" display and the Refresh button, which currently live in the App header and control net worth data. Resolution: either keep header state in App (prop-passing), or move the refresh button into NetWorthPage's own header section.

### 6.3 New Layout Structure

```
┌──────────────────────────────────────────────────────┐
│ header (sticky, z: 20)                               │
├─────────────┬────────────────────────────────────────┤
│             │                                        │
│  sidebar    │  <Outlet /> / route content            │
│  (220px     │  (flex-grow: 1, overflow-y: auto)      │
│   fixed)    │                                        │
│             │                                        │
└─────────────┴────────────────────────────────────────┘
```

CSS layout change: `.root` becomes `display: grid; grid-template-rows: auto 1fr; min-height: 100vh`. The body below the header becomes `display: flex; flex-direction: row`. Sidebar is `width: 220px; flex-shrink: 0`. Main content is `flex: 1`.

On mobile (`<768px`): sidebar hidden, bottom tab bar visible instead.

---

## 7. Risks and Tradeoffs

### 7.1 Test Migration Risk — LOW

- Only `App.test.jsx` (9 tests) needs meaningful changes.
- The change is mechanical: wrap renders with `<MemoryRouter initialEntries={['/networth']}>`, change tab-click assertions to use `NavLink` text clicks.
- Tests for individual pages (`SyncPage.test.jsx`, etc.) are completely unaffected — they don't use tab navigation.

### 7.2 State Management Risk — LOW

- Each page already self-manages its data. Routing doesn't change this.
- The one exception is Net Worth data in App.jsx. Options are clear (keep in App as props, or move into NetWorthPage). Either is fine. Moving into NetWorthPage is cleaner long-term.
- No Redux, no Context API, no Zustand — no global state infrastructure to migrate.

### 7.3 SyncPage Polling on Route Change — MEDIUM

SyncPage has a polling loop (setInterval every 2s). Currently, navigating away from the Sync tab unmounts `SyncPage`, which triggers the cleanup `return () => stopPolling()` in useEffect. This is safe.

With routing, navigating away from `/sync` still unmounts the component (React Router unmounts route components on navigation). Behavior is identical. **No risk here.**

However: if a sync job is running and the user navigates away, polling stops and the job status is lost until they return. This is the same behavior as today. It's acceptable for a personal tool.

### 7.4 Browser Back/Forward — BENEFIT (not a risk)

Currently, the browser Back button does nothing useful (no URL changes). With routing:
- Back navigates to the previous page in history (e.g., from /sync back to /budgets).
- This is a UX improvement, not a risk.

### 7.5 Deep Linking — BENEFIT

Users can bookmark `/budgets` and land directly on the Budgets page. Currently, all bookmarks land on Net Worth regardless. This is especially useful for the Sync page (operational task with specific intent).

### 7.6 Data Refetching on Route Change — LOW RISK

All page components fetch data on mount (the `useEffect(() => { fetch... }, [])` pattern). With routing, each time a route is visited, if the component unmounts and remounts (route changed away and back), it refetches. This is the same as clicking a different tab and back today. Net Worth data, which is fetched at App level, is unaffected — it's loaded once when `configured === true` and persists in App state across route changes.

BudgetPage re-fetches when `months` changes but not on mount/unmount cycles... wait, it does: `useEffect(() => { fetch... }, [months])` runs on mount (first render) and when `months` changes. So navigating back to /budgets will re-fetch. This is fine for a personal finance tool — data freshness is desirable.

### 7.7 Package Size — NEGLIGIBLE

`react-router-dom` v6 is approximately 15–20kb gzipped added to bundle. Recharts (~80kb gzipped) already dominates bundle size. Negligible impact.

### 7.8 Vite Config — NO CHANGES REQUIRED

Vite dev server already handles SPA-style routing (serves `index.html` for all non-asset routes by default). Confirmed in the existing vite.config.js — no `historyApiFallback` option needed; Vite handles this natively.

---

## 8. Implementation Complexity Assessment

### Files to create:
- `src/pages/NetWorthPage.jsx` (extract from App.jsx)
- `src/components/Sidebar.jsx` (new navigation component)
- `src/components/Sidebar.module.css`
- `src/components/BottomTabBar.jsx` (mobile nav)
- `src/components/BottomTabBar.module.css`

### Files to modify:
- `frontend/package.json` — add `react-router-dom`
- `frontend/package-lock.json` — updated by npm install
- `src/main.jsx` — wrap App with `BrowserRouter`
- `src/App.jsx` — replace tab state + conditional rendering with `<Routes>`, import Sidebar/BottomTabBar, restructure layout
- `src/App.module.css` — restructure shell layout from vertical stack to sidebar + content
- `src/App.test.jsx` — wrap renders in `MemoryRouter`, update tab-click tests to use route nav

### Files NOT requiring changes:
- All page components (GroupsPage, BudgetPage, BudgetBuilderPage, SyncPage, SetupPage)
- All component unit tests (AccountsBreakdown, BudgetTable, SyncPage, etc.)
- All integration tests
- Backend — zero backend changes

---

## 9. Recommended Approach Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Router package | `react-router-dom` v6 | Standard, well-tested, ecosystem fit |
| Router type | `BrowserRouter` | nginx + Vite already support SPA fallback |
| Router API | `<BrowserRouter>` + `<Routes>` | Simpler than data router API; no loaders needed |
| Sidebar on desktop | Fixed 220px, no collapse | 5 items, personal tool — simplicity wins |
| Mobile nav | Bottom tab bar (<768px) | UX improvement over horizontal scroll; thumb zone |
| NetWorthPage | Extract inline content into new page component | Cleaner routing, aligns with all other pages |
| NetWorth data fetching | Move into NetWorthPage | Simplifies App.jsx; refresh button moves into page header |
| Setup gate | Keep as pre-router wall (not a route) | Unchanged behavior, simpler |
| Test strategy | Wrap App tests in MemoryRouter | Minimal change; page tests unaffected |

---

## 10. Open Questions for Architect

1. **Refresh button placement:** Currently in the global header. If Net Worth data fetching moves into `NetWorthPage`, should the Refresh button move into NetWorthPage's page header (alongside the page title), or should it stay in the global header via a ref/callback? — The page-local approach is cleaner but changes the visible UI more significantly.

2. **"Updated at" timestamp:** Same question as above. This lives in the global header today and is coupled to net worth data. If refactored into NetWorthPage, the global header loses this context.

3. **Active sidebar item styling:** Should use `NavLink` (built into react-router-dom) which provides `isActive` prop automatically. Confirm this fits the design token system.

4. **Route for `/` redirect:** Should `/` redirect to `/networth` automatically, or should `/` itself render `NetWorthPage`? Redirect is semantically cleaner.

5. **Sidebar icons:** The current tab labels use emoji (📈, ⬡, 💰, 🏗, 🔄). The audit recommends moving to proper SVG icons or lucide-react icons for the sidebar. Is a new icon library in scope for this change, or should emoji be retained for now?

---

## Sources Consulted

- [React Router — Testing Library docs](https://testing-library.com/docs/example-react-router/)
- [createMemoryRouter | React Router](https://reactrouter.com/en/main/routers/create-memory-router)
- [Testing React Router useNavigate Hook](https://blog.logrocket.com/testing-react-router-usenavigate-hook-react-testing-library/)
- [React Router — Picking a Mode](https://reactrouter.com/start/modes)
- [BrowserRouter vs HashRouter comprehensive guide](https://www.dhiwise.com/post/browserrouter-vs-hashrouter-a-comprehensive-guide)
- [Best UX Practices for Designing a Sidebar — UX Planet](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2)
- [Bottom Tab Bar Navigation Design Best Practices](https://uxdworld.com/2024/03/01/bottom-tab-bar-navigation-design-best-practices/)
- [Mobile Navigation Patterns 2026](https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026)
- [Mastering React Testing with Vitest 2.0](https://patelvivek.dev/blog/testing-react-router-vitest)
