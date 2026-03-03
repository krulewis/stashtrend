# Final Implementation Plan — Sidebar Navigation with URL Routing

**Date:** 2026-03-03
**Agent:** Engineer Agent (Step 5 of planning pipeline)
**Change size:** M
**Input documents:** `sidebar-nav-plan.md`, `sidebar-nav-review.md`, `sidebar-nav-architecture.md`
**Reviewed code:** `App.jsx`, `App.module.css`, `App.test.jsx`, `main.jsx`, `BudgetTable.module.css`

---

## Staff Review Findings — How Each Is Addressed

### MUST FIX #1 — BudgetBuilderPage not mocked in App.test.jsx
**Resolution:** Add `vi.mock('./pages/BudgetBuilderPage.jsx', ...)` alongside the existing four page mocks in App.test.jsx. Also add `vi.mock('./pages/NetWorthPage.jsx', ...)` which is new and must also be mocked. See App.test.jsx section below.

### MUST FIX #2 — Fragile `calc(100vh - Npx)` sidebar height
**Resolution:** Use a flex column layout for `.root` with `flex: 1; min-height: 0` on `.body`. The sidebar and main content are flex children that fill the remaining height naturally. No hardcoded pixel values. Sidebar uses `overflow-y: auto` and `align-self: stretch` (via flex default). The `.body` receives `flex: 1; min-height: 0` so it fills the remaining viewport height after the sticky header without any height calculation. See App.module.css section below.

### MUST FIX #3 — Duplicate `aria-label="Main navigation"` on both nav components
**Resolution:** Sidebar uses `aria-label="Main navigation"`. BottomTabBar uses `aria-label="Mobile navigation"`. Both are distinct landmark labels. See component code below.

### MUST FIX #4 — Test renders render both nav components, causing duplicate link matches
**Resolution:** Sidebar.test.jsx wraps only `<Sidebar>` in `<MemoryRouter>`. BottomTabBar.test.jsx wraps only `<BottomTabBar>` in `<MemoryRouter>`. Neither test renders `<App>`. All link queries in these isolated tests find exactly one element. In App.test.jsx where both components are present, use `getAllByRole` + length assertions or `within()` scoping. See test sections below.

### SHOULD FIX #5 — `overflow-y: auto` on `.main` and sticky table headers
**Resolution:** Confirmed safe. `BudgetTable.module.css` uses `position: sticky; left: 0` (horizontal column stickiness within `.tableWrap { overflow-x: auto }`). This is horizontal sticky within a horizontal scroll container — it is unaffected by the vertical scroll container change on `.main`. No BudgetTable behavior changes. Documented below.

### SHOULD FIX #6 — No loading state in NetWorthPage
**Resolution:** Add an explicit `loading` boolean state in NetWorthPage. When `loading === true`, render a `<div data-testid="networth-loading">Loading…</div>`. When data arrives, set `loading` to false. Tests verify the loading state. See NetWorthPage code below.

### SHOULD FIX #7 — Dead CSS in `.headerRight` gap media query
**Resolution:** Remove the `gap` change from `.headerRight` inside `@media (min-width: 768px)` in App.module.css. The version badge is the only child after the refresh button and updatedAt move to NetWorthPage. Gap on a single child has no effect.

### SHOULD FIX #8 — No test for `/` → `/networth` redirect
**Resolution:** Add `it('redirects / to /networth', ...)` in App.test.jsx. See test list below.

### SHOULD FIX #9 — No test for `*` catch-all redirect
**Resolution:** Add `it('redirects unknown routes to /networth', ...)` in App.test.jsx. See test list below.

### SHOULD FIX #10 — NavLink `end` prop note
**Resolution:** Add a comment in `nav.js` noting that `end` prop on NavLink may be needed if sub-routes are introduced. No behavioral change needed now; none of the five routes is a prefix of another.

### SHOULD FIX #11 — Setup gate deep-link behavior not tested
**Resolution:** Add a test that renders at `/budgets` with `configured: false`, verifies SetupPage shows, then simulates setup completion and verifies the `/budgets` route renders. See test list below.

### CONSIDER #12 — Browser back/forward at setup gate boundary
**Resolution:** No action. Confirmed correct behavior — the setup gate conditionally renders before routes and pushes no history entries.

### CONSIDER #13 — Focus management on route change
**Resolution:** Add `useLocation` + `useRef` focus management in App.jsx. The `<main>` element gets `tabIndex={-1}` and `ref={mainRef}`. A `useEffect` focused on `location.pathname` calls `mainRef.current?.focus()` on route change. This is a quality-of-life improvement that costs two lines of code.

### CONSIDER #14 — Safe area inset on mobile body padding
**Resolution:** Use `calc(60px + env(safe-area-inset-bottom, 0))` for mobile body padding to account for iPhone home indicator.

---

## Dependency

```
npm install react-router-dom@^6
```

Pin to `^6` (not v7) to avoid breaking changes from the v7 migration. The v6 API is stable.

---

## Files to Create

### 1. `src/nav.js`

```js
/**
 * NAV_ITEMS — single source of truth for sidebar and bottom tab bar.
 * Edit here to add, remove, or reorder nav items.
 *
 * Note: NavLink `end` prop may be needed on individual items if sub-routes
 * are ever introduced (e.g., /networth/details would also match /networth
 * without `end`). Not needed today since no routes share a prefix.
 */
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',      icon: '📈' },
  { path: '/groups',   label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
```

---

### 2. `src/components/Sidebar.jsx`

```jsx
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../nav.js'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  return (
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
  )
}
```

---

### 3. `src/components/Sidebar.module.css`

```css
/* Hidden on mobile by default; shown on desktop via media query */
.sidebar {
  display: none;
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-deep);
  border-right: 1px solid var(--border);
  padding: var(--sp-4) 0;
  overflow-y: auto;
}

@media (min-width: 768px) {
  .sidebar {
    display: flex;
    flex-direction: column;
  }
}

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

.navIcon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.navLabel {
  font-size: 14px;
}
```

---

### 4. `src/components/BottomTabBar.jsx`

```jsx
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../nav.js'
import styles from './BottomTabBar.module.css'

export default function BottomTabBar() {
  return (
    <nav className={styles.bottomBar} aria-label="Mobile navigation">
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
  )
}
```

---

### 5. `src/components/BottomTabBar.module.css`

```css
/* Shown on mobile only; hidden on desktop */
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
  /* Account for iPhone home indicator (safe area inset) */
  padding-bottom: env(safe-area-inset-bottom, 0);
}

@media (min-width: 768px) {
  .bottomBar {
    display: none;
  }
}

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

---

### 6. `src/pages/NetWorthPage.jsx`

All five state variables, `loadDashboardData`, the fetch useEffect, error UI, loading state, and the refresh/timestamp header row — moved wholesale from `App.jsx`.

```jsx
import { useEffect, useState } from 'react'
import styles from './NetWorthPage.module.css'
import StatsCards from '../components/StatsCards.jsx'
import NetWorthChart from '../components/NetWorthChart.jsx'
import AccountsBreakdown from '../components/AccountsBreakdown.jsx'
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary } from '../api.js'

export default function NetWorthPage() {
  const [stats,       setStats]       = useState(null)
  const [history,     setHistory]     = useState(null)
  const [accounts,    setAccounts]    = useState(null)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(true)

  function loadDashboardData() {
    setError(null)
    setLoading(true)
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
    ])
      .then(([s, h, a]) => {
        setStats(s)
        setHistory(h)
        setAccounts(a)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Net Worth</h1>
        <div className={styles.pageActions}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={loadDashboardData}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div data-testid="networth-loading" className={styles.loading}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>⚠ Could not connect to the API</div>
          <div className={styles.errorMsg}>Make sure the backend is running:</div>
          <pre className={styles.errorCode}>
            cd monarch-dashboard/backend{'\n'}
            pip install -r requirements.txt{'\n'}
            python app.py
          </pre>
          <div className={styles.errorDetail}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          <StatsCards stats={stats} />
          <NetWorthChart history={history} />
          <AccountsBreakdown accounts={accounts} />
        </>
      )}
    </div>
  )
}
```

---

### 7. `src/pages/NetWorthPage.module.css`

The error box styles move from `App.module.css` to here. The refresh button and updatedAt styles move here too.

```css
.pageHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-5);
  gap: var(--sp-4);
}

.pageTitle {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

@media (min-width: 768px) {
  .pageTitle { font-size: 20px; }
}

.pageActions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.updatedAt {
  display: none;
  font-size: 12px;
  color: var(--text-muted);
}

@media (min-width: 768px) {
  .updatedAt { display: block; }
}

.refreshBtn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  min-height: 38px;
  white-space: nowrap;
}

.refreshBtn:hover {
  color: var(--text-primary);
}

.loading {
  color: var(--text-muted);
  font-size: 14px;
  padding: var(--sp-8) 0;
  text-align: center;
}

/* ── Error state ───────────────────────────────────────────── */
.errorBox {
  background: var(--bg-card);
  border: 1px solid var(--red);
  border-radius: 12px;
  padding: 24px 20px;
  text-align: center;
}

@media (min-width: 768px) {
  .errorBox { padding: 32px; }
}

.errorTitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--red);
  margin-bottom: 12px;
}

.errorMsg {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 12px;
}

.errorCode {
  background: var(--bg-root);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--accent-wash);
  text-align: left;
  display: block;
  overflow-x: auto;
  margin-bottom: 16px;
  font-family: monospace;
  white-space: pre;
}

@media (min-width: 768px) {
  .errorCode { font-size: 13px; display: inline-block; }
}

.errorDetail {
  color: var(--text-muted);
  font-size: 12px;
  font-family: monospace;
}
```

---

## Files to Modify

### 8. `src/main.jsx` — Add BrowserRouter

Full replacement:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

---

### 9. `src/App.jsx` — Replace tab system with router, strip net worth data

Full replacement:

```jsx
import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import styles from './App.module.css'
import Sidebar from './components/Sidebar.jsx'
import BottomTabBar from './components/BottomTabBar.jsx'
import NetWorthPage from './pages/NetWorthPage.jsx'
import GroupsPage from './pages/GroupsPage.jsx'
import BudgetPage from './pages/BudgetPage.jsx'
import BudgetBuilderPage from './pages/BudgetBuilderPage.jsx'
import SyncPage from './pages/SyncPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import { fetchSetupStatus } from './api.js'
import { version } from '../package.json'

// Inner component that uses router hooks — must be a child of BrowserRouter.
function AppShell() {
  const location = useLocation()
  const mainRef  = useRef(null)

  // Move focus to <main> on route change so keyboard/screen-reader users
  // receive a signal that page content has changed.
  useEffect(() => {
    mainRef.current?.focus()
  }, [location.pathname])

  return (
    <div className={styles.body}>
      <Sidebar />
      <main
        ref={mainRef}
        tabIndex={-1}
        className={styles.main}
      >
        <Routes>
          <Route path="/"        element={<Navigate to="/networth" replace />} />
          <Route path="/networth" element={<NetWorthPage />} />
          <Route path="/groups"  element={<GroupsPage />} />
          <Route path="/budgets" element={<BudgetPage />} />
          <Route path="/builder" element={<BudgetBuilderPage />} />
          <Route path="/sync"    element={<SyncPage />} />
          <Route path="*"        element={<Navigate to="/networth" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [configured, setConfigured] = useState(null) // null=loading, false=needs setup, true=ready

  // NOTE: This app is designed for local-only use (localhost). It relies on the
  // /api/setup/status configured flag rather than session-based authentication,
  // because all data stays on the user's own machine. If ever exposed beyond
  // localhost, add token or session authentication before the setup check.
  useEffect(() => {
    fetchSetupStatus()
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false))
  }, [])

  if (configured === null) return <div className={styles.loading}>Loading…</div>
  if (configured === false) return <SetupPage onComplete={() => setConfigured(true)} />

  return (
    <div className={styles.root}>
      {/* ── Header ──────────────────────────────────────────── */}
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

      {/* ── Body (sidebar + main) ────────────────────────────── */}
      <AppShell />

      {/* ── Mobile bottom tab bar ───────────────────────────── */}
      <BottomTabBar />
    </div>
  )
}
```

**Rationale for AppShell split:** `useLocation` requires a router context. `App` renders before the router context is available if `BrowserRouter` is in `main.jsx`. Splitting into `AppShell` (uses `useLocation`) inside `App` (does not) cleanly solves this — `App` is the setup gate, `AppShell` is the routed layout.

---

### 10. `src/App.module.css` — Layout restructure

Full replacement. Key changes:
- `.root` becomes a flex column so `.body` can fill remaining height naturally
- `.body` is a new flex row with `flex: 1; min-height: 0` — no hardcoded pixel heights
- Tab bar styles (`.tabBar`, `.tabBtn`, `.tabBtnActive`) removed
- `.main` loses `margin: 0 auto` (sidebar offsets it); gains `flex: 1; overflow-y: auto; min-width: 0`
- Error state styles moved to `NetWorthPage.module.css`
- `.updatedAt`, `.refreshBtn` removed (moved to NetWorthPage.module.css)
- Dead `.headerRight` gap media query removed (only one child remains)
- Mobile body bottom padding uses safe-area-inset

```css
/* ─── App shell ──────────────────────────────────────────────────────────── */

.loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-root);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.root {
  min-height: 100vh;
  background: var(--bg-root);
  display: flex;
  flex-direction: column;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bg-card);
  background: var(--bg-root);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .header { padding: 16px 32px; }
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 22px;
  color: var(--accent);
  line-height: 1;
}

@media (min-width: 768px) {
  .logo { font-size: 28px; }
}

.appName {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.appSub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

@media (min-width: 768px) {
  .appName { font-size: 17px; }
  .appSub  { font-size: 12px; }
}

.headerRight {
  display: flex;
  align-items: center;
}

.versionBadge {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.5;
}

/* ── Body (sidebar + main) ──────────────────────────────────────────────── */

/*
 * .body fills the remaining height after the sticky header.
 * flex: 1 stretches it; min-height: 0 allows flex children to scroll
 * independently (without this, overflow-y: auto on children has no effect).
 * No hardcoded pixel heights — the flex layout handles it naturally.
 */
.body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  /* Mobile: add bottom padding so content clears the fixed bottom tab bar.
     Uses safe-area-inset for iPhone home indicator. */
}

@media (max-width: 767px) {
  .body {
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0));
  }
}

/* ── Main content ───────────────────────────────────────────────────────── */

/*
 * overflow-y: auto creates a scroll container for page content.
 * BudgetTable uses position: sticky left: 0 (horizontal column stickiness
 * within its own overflow-x wrapper) — not affected by this vertical scroll
 * container. No existing sticky-top patterns in page components.
 */
.main {
  flex: 1;
  min-width: 0;        /* prevent flex blowout on narrow content */
  max-width: 1200px;
  padding: var(--sp-5) var(--sp-4);
  overflow-y: auto;
  /* Suppress focus outline on main — focus is moved here programmatically
     on route change for accessibility, but the outline is not needed visually. */
  outline: none;
}

@media (min-width: 768px) {
  .main { padding: var(--sp-8) var(--sp-6); }
}
```

---

### 11. `src/App.test.jsx` — Full replacement

All changes:
- Add `MemoryRouter` import from `react-router-dom`
- Add `renderApp(route)` helper that wraps `<App>` in `<MemoryRouter>`
- Add `vi.mock` for `BudgetBuilderPage` and `NetWorthPage`
- Rewrite "renders all four tab buttons" → "renders all nav links" using `getAllByRole` to handle duplicates from both Sidebar and BottomTabBar
- Remove direct `render(<App />)` from all tests, replace with `renderApp()`
- Update navigation tests: links are `<a>` elements, not `<button>` elements
- Update "renders a Refresh button" → navigates to `/networth` and checks NetWorthPage's button
- Add redirect tests: `/` and unknown route
- Add setup gate deep-link preservation test

```jsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from './App.jsx'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, MOCK_SETUP_STATUS, mockFetch } from './test/fixtures.js'

// Mock child pages so their own fetch calls don't interfere with App-level tests
vi.mock('./pages/GroupsPage.jsx',       () => ({ default: () => <div data-testid="groups-page" /> }))
vi.mock('./pages/BudgetPage.jsx',       () => ({ default: () => <div data-testid="budget-page" /> }))
vi.mock('./pages/BudgetBuilderPage.jsx',() => ({ default: () => <div data-testid="builder-page" /> }))
vi.mock('./pages/SyncPage.jsx',        () => ({ default: () => <div data-testid="sync-page" /> }))
vi.mock('./pages/SetupPage.jsx',       () => ({ default: ({ onComplete }) => (
  <div data-testid="setup-page">
    <button onClick={onComplete}>Complete Setup</button>
  </div>
)}))
vi.mock('./pages/NetWorthPage.jsx',    () => ({ default: () => <div data-testid="networth-page" /> }))

// Helper: renders App inside MemoryRouter at the given initial route.
// App uses <Routes> and <NavLink> which require a router context.
// BrowserRouter is in main.jsx (not App.jsx), so tests supply MemoryRouter here.
function renderApp(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  )
}

describe('App', () => {
  beforeEach(() => {
    mockFetch({
      '/api/setup/status':     MOCK_SETUP_STATUS,
      '/api/networth/stats':   MOCK_STATS,
      '/api/networth/history': MOCK_HISTORY,
      '/api/accounts/summary': MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the app name in the header', async () => {
    renderApp()
    expect(await screen.findByText('Stashtrend')).toBeInTheDocument()
  })

  // Both Sidebar and BottomTabBar render all 5 NAV_ITEMS as links.
  // Both components are in the DOM simultaneously (one hidden via CSS).
  // Use getAllByRole to find all instances and assert count.
  it('renders all nav links in sidebar and bottom tab bar', async () => {
    renderApp()
    await screen.findByText('Stashtrend') // wait for app to load past setup check

    // Each label appears twice: once in Sidebar, once in BottomTabBar
    expect(screen.getAllByRole('link', { name: /Net Worth/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Account Groups/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Budgets/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Budget Builder/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Sync Data/ })).toHaveLength(2)
  })

  it('shows Net Worth page by default (no other pages visible)', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('redirects / to /networth', async () => {
    renderApp('/')
    await waitFor(() => {
      expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    })
  })

  it('redirects unknown routes to /networth', async () => {
    renderApp('/bogus')
    await waitFor(() => {
      expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    })
  })

  it('navigates to Account Groups when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    // Use within() to scope to the sidebar's nav element and avoid duplicate links
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Account Groups/ }))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('navigates to Sync Data when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Sync Data/ }))
    expect(screen.getByTestId('sync-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('navigates to Budgets when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Budgets/ }))
    expect(screen.getByTestId('budget-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('can switch back from Groups to Net Worth', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Account Groups/ }))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    fireEvent.click(within(sidebar).getByRole('link', { name: /Net Worth/ }))
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
  })

  it('shows loading state while setup status is loading', () => {
    // Never-resolving fetch keeps configured=null
    global.fetch = vi.fn(() => new Promise(() => {}))
    renderApp()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('shows SetupPage when not configured', async () => {
    mockFetch({ '/api/setup/status': { configured: false } })
    renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    })
  })

  it('preserves deep-link route after completing setup', async () => {
    // User deep-links to /budgets before app is configured.
    // Setup gate shows SetupPage. After setup completes, /budgets route renders.
    mockFetch({ '/api/setup/status': { configured: false } })
    renderApp('/budgets')
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    })
    // Simulate completing setup
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
    await waitFor(() => {
      expect(screen.getByTestId('budget-page')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument()
  })
})
```

---

### 12. New: `src/components/Sidebar.test.jsx`

Tests render ONLY `<Sidebar>` in `<MemoryRouter>` — never `<App>`. No duplicate links.

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import Sidebar from './Sidebar.jsx'

// Helper: render Sidebar in MemoryRouter at the given route.
function renderSidebar(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders all 5 nav items with correct labels', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budgets/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('each nav item links to the correct href', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toHaveAttribute('href', '/networth')
    expect(screen.getByRole('link', { name: /Account Groups/ })).toHaveAttribute('href', '/groups')
    expect(screen.getByRole('link', { name: /Budgets/ })).toHaveAttribute('href', '/budgets')
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toHaveAttribute('href', '/builder')
    expect(screen.getByRole('link', { name: /Sync Data/ })).toHaveAttribute('href', '/sync')
  })

  it('applies active class to the nav item matching the current route', () => {
    renderSidebar('/budgets')
    const budgetsLink = screen.getByRole('link', { name: /Budgets/ })
    // NavLink adds active class automatically when route matches
    expect(budgetsLink.className).toMatch(/navItemActive/)
  })

  it('does not apply active class to non-matching nav items', () => {
    renderSidebar('/budgets')
    const networthLink = screen.getByRole('link', { name: /Net Worth/ })
    const syncLink     = screen.getByRole('link', { name: /Sync Data/ })
    expect(networthLink.className).not.toMatch(/navItemActive/)
    expect(syncLink.className).not.toMatch(/navItemActive/)
  })

  it('has aria-label "Main navigation"', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })
})
```

---

### 13. New: `src/components/BottomTabBar.test.jsx`

Tests render ONLY `<BottomTabBar>` in `<MemoryRouter>` — never `<App>`. No duplicate links.

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import BottomTabBar from './BottomTabBar.jsx'

function renderBottomTabBar(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomTabBar />
    </MemoryRouter>
  )
}

describe('BottomTabBar', () => {
  it('renders all 5 tab items with correct labels', () => {
    renderBottomTabBar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budgets/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('each tab item links to the correct href', () => {
    renderBottomTabBar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toHaveAttribute('href', '/networth')
    expect(screen.getByRole('link', { name: /Account Groups/ })).toHaveAttribute('href', '/groups')
    expect(screen.getByRole('link', { name: /Budgets/ })).toHaveAttribute('href', '/budgets')
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toHaveAttribute('href', '/builder')
    expect(screen.getByRole('link', { name: /Sync Data/ })).toHaveAttribute('href', '/sync')
  })

  it('applies active class to the tab item matching the current route', () => {
    renderBottomTabBar('/groups')
    const groupsLink = screen.getByRole('link', { name: /Account Groups/ })
    expect(groupsLink.className).toMatch(/tabItemActive/)
  })

  it('does not apply active class to non-matching tab items', () => {
    renderBottomTabBar('/groups')
    const networthLink = screen.getByRole('link', { name: /Net Worth/ })
    expect(networthLink.className).not.toMatch(/tabItemActive/)
  })

  it('has aria-label "Mobile navigation"', () => {
    renderBottomTabBar()
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
  })
})
```

---

### 14. New: `src/pages/NetWorthPage.test.jsx`

NetWorthPage does not use router hooks, so no MemoryRouter wrapper needed.

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NetWorthPage from './NetWorthPage.jsx'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, mockFetch } from '../test/fixtures.js'

// Mock child components so this test only exercises NetWorthPage's own behavior
vi.mock('../components/StatsCards.jsx',        () => ({ default: () => <div data-testid="stats-cards" /> }))
vi.mock('../components/NetWorthChart.jsx',     () => ({ default: () => <div data-testid="networth-chart" /> }))
vi.mock('../components/AccountsBreakdown.jsx', () => ({ default: () => <div data-testid="accounts-breakdown" /> }))

describe('NetWorthPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/networth/stats':   MOCK_STATS,
      '/api/networth/history': MOCK_HISTORY,
      '/api/accounts/summary': MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state before data arrives', () => {
    // Never-resolving fetch keeps loading=true
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<NetWorthPage />)
    expect(screen.getByTestId('networth-loading')).toBeInTheDocument()
  })

  it('renders StatsCards, NetWorthChart, AccountsBreakdown after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByTestId('stats-cards')).toBeInTheDocument()
    })
    expect(screen.getByTestId('networth-chart')).toBeInTheDocument()
    expect(screen.getByTestId('accounts-breakdown')).toBeInTheDocument()
    expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument()
  })

  it('renders error state when API fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Connection refused')))
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('stats-cards')).not.toBeInTheDocument()
  })

  it('renders a Refresh button', async () => {
    render(<NetWorthPage />)
    await waitFor(() => expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument()
  })

  it('re-fetches data when Refresh is clicked', async () => {
    render(<NetWorthPage />)
    await waitFor(() => expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument())
    const callsBefore = global.fetch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    // Refresh triggers 3 more fetch calls (stats, history, accounts)
    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('renders "Updated at" timestamp after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Updated at/)).toBeInTheDocument()
    })
  })
})
```

---

## Complete Test List

### App.test.jsx (13 tests, up from 10)

| # | Test name | Key assertion |
|---|-----------|---------------|
| 1 | renders the app name in the header | `findByText('Stashtrend')` |
| 2 | renders all nav links in sidebar and bottom tab bar | `getAllByRole('link', ...).toHaveLength(2)` × 5 |
| 3 | shows Net Worth page by default | `getByTestId('networth-page')` present |
| 4 | redirects / to /networth | `getByTestId('networth-page')` after `renderApp('/')` |
| 5 | redirects unknown routes to /networth | `getByTestId('networth-page')` after `renderApp('/bogus')` |
| 6 | navigates to Account Groups when that link is clicked | `getByTestId('groups-page')` |
| 7 | navigates to Sync Data when that link is clicked | `getByTestId('sync-page')` |
| 8 | navigates to Budgets when that link is clicked | `getByTestId('budget-page')` |
| 9 | can switch back from Groups to Net Worth | groups-page absent, networth-page present |
| 10 | shows loading state while setup status is loading | `getByText(/Loading/)` |
| 11 | shows SetupPage when not configured | `getByTestId('setup-page')` |
| 12 | preserves deep-link route after completing setup | setup → complete → budget-page present |

### Sidebar.test.jsx (5 tests)

| # | Test name |
|---|-----------|
| 1 | renders all 5 nav items with correct labels |
| 2 | each nav item links to the correct href |
| 3 | applies active class to the nav item matching the current route |
| 4 | does not apply active class to non-matching nav items |
| 5 | has aria-label "Main navigation" |

### BottomTabBar.test.jsx (5 tests)

| # | Test name |
|---|-----------|
| 1 | renders all 5 tab items with correct labels |
| 2 | each tab item links to the correct href |
| 3 | applies active class to the tab item matching the current route |
| 4 | does not apply active class to non-matching tab items |
| 5 | has aria-label "Mobile navigation" |

### NetWorthPage.test.jsx (6 tests)

| # | Test name |
|---|-----------|
| 1 | shows loading state before data arrives |
| 2 | renders StatsCards, NetWorthChart, AccountsBreakdown after data loads |
| 3 | renders error state when API fetch fails |
| 4 | renders a Refresh button |
| 5 | re-fetches data when Refresh is clicked |
| 6 | renders "Updated at" timestamp after data loads |

**Net new tests: +19** (13 App + 5 Sidebar + 5 BottomTabBar + 6 NetWorthPage - 10 replaced App tests = +19 net increase)

---

## Implementation Sequence

Execute in this exact order. Each step can be run and tested independently before proceeding.

### Step 1 — Install dependency
```
npm install react-router-dom@^6
```
Verify `package.json` shows `"react-router-dom": "^6.x.x"`.

### Step 2 — Create `src/nav.js`
No dependencies. Pure data file. No test needed (tested indirectly by Sidebar and BottomTabBar tests).

### Step 3 — Create `src/pages/NetWorthPage.jsx` + `NetWorthPage.module.css`
Move state, `loadDashboardData`, fetch useEffect, error UI, and child components from `App.jsx`. Add `loading` state and `data-testid="networth-loading"`. Move error/refresh/updatedAt CSS to `NetWorthPage.module.css`.

### Step 4 — Write `src/pages/NetWorthPage.test.jsx`
Write all 6 tests. Run: they should pass against the new NetWorthPage (or fail only due to import issues if file not yet complete — fix before proceeding).

### Step 5 — Create `src/components/Sidebar.jsx` + `Sidebar.module.css`
No dependencies except `nav.js` and `react-router-dom` (already installed).

### Step 6 — Write `src/components/Sidebar.test.jsx`
Write all 5 tests. Run: all should pass.

### Step 7 — Create `src/components/BottomTabBar.jsx` + `BottomTabBar.module.css`
Same structure as Sidebar.

### Step 8 — Write `src/components/BottomTabBar.test.jsx`
Write all 5 tests. Run: all should pass.

### Step 9 — Modify `src/main.jsx`
Add `BrowserRouter` wrapper. This is the only change to main.jsx.

### Step 10 — Modify `src/App.jsx`
- Remove: `TABS` constant, `activeTab` state, all 5 net worth state variables, `loadDashboardData`, net worth `useEffect`, `refreshBtn`/`updatedAt` JSX in header, tab bar nav element, all conditional `activeTab ===` renders
- Add: router imports, `AppShell` component with `useLocation` + `useRef` + focus management, `<Routes>` / `<Route>` tree, `<Sidebar>`, `<BottomTabBar>`
- Keep: `configured` state, setup `useEffect`, loading/setup guard, header with logo/name/sub/version

### Step 11 — Modify `src/App.module.css`
- Replace `.root` with flex column layout
- Add `.body` flex row with `flex: 1; min-height: 0`; mobile padding with safe-area-inset
- Replace `.main`: add `flex: 1; min-width: 0; overflow-y: auto`; remove `margin: 0 auto`
- Remove: `.tabBar`, `.tabBtn`, `.tabBtnActive`, `.updatedAt`, `.refreshBtn`, `.errorBox`, `.errorTitle`, `.errorMsg`, `.errorCode`, `.errorDetail`
- Remove: dead `gap` change in `.headerRight` media query
- Add: `flex-shrink: 0` to `.header` so it does not compress

### Step 12 — Rewrite `src/App.test.jsx`
Full replacement with all 13 tests as specified above.

### Step 13 — Run full test suite
```
cd frontend && npm test
```
Expected: all new tests pass, no existing tests broken. Fix any failures before proceeding.

---

## Verification Checklist

### Correctness
- [ ] `npm install react-router-dom@^6` completed, `package-lock.json` updated
- [ ] `src/nav.js` exists, exports `NAV_ITEMS` with 5 items
- [ ] `src/pages/NetWorthPage.jsx` exists, has `data-testid="networth-loading"` on loading div
- [ ] `src/components/Sidebar.jsx` uses `aria-label="Main navigation"`
- [ ] `src/components/BottomTabBar.jsx` uses `aria-label="Mobile navigation"`
- [ ] `App.jsx` contains no `activeTab`, no `TABS`, no `loadDashboardData`, no net worth state
- [ ] `App.jsx` contains `AppShell` component with `useLocation` + `mainRef?.focus()` on pathname change
- [ ] `App.jsx` `<main>` has `tabIndex={-1}` and `ref={mainRef}`
- [ ] `main.jsx` wraps `<App>` in `<BrowserRouter>`
- [ ] `App.module.css` `.root` is `display: flex; flex-direction: column`
- [ ] `App.module.css` `.body` has `flex: 1; min-height: 0`; no hardcoded pixel heights
- [ ] `App.module.css` `.main` has `flex: 1; min-width: 0; overflow-y: auto`; no `margin: 0 auto`
- [ ] `App.module.css` contains no `.tabBar`, `.tabBtn`, `.tabBtnActive`, `.updatedAt`, `.refreshBtn`
- [ ] `App.module.css` `.headerRight` has no `gap` media query change
- [ ] `App.test.jsx` mocks 6 pages: GroupsPage, BudgetPage, BudgetBuilderPage, SyncPage, SetupPage, NetWorthPage
- [ ] `App.test.jsx` SetupPage mock renders a "Complete Setup" button that calls `onComplete`

### Tests
- [ ] NetWorthPage.test.jsx: 6 tests pass
- [ ] Sidebar.test.jsx: 5 tests pass
- [ ] BottomTabBar.test.jsx: 5 tests pass
- [ ] App.test.jsx: 13 tests pass (including redirect tests, setup deep-link test)
- [ ] All pre-existing tests pass (no regressions in other test files)

### Behavior (Playwright QA)
- [ ] `http://localhost:5173/` redirects to `/networth` in address bar
- [ ] `http://localhost:5173/budgets` deep-link loads Budgets page directly
- [ ] `http://localhost:5173/bogus` redirects to `/networth`
- [ ] Sidebar visible at >= 768px viewport width
- [ ] Sidebar hidden at < 768px viewport width
- [ ] Bottom tab bar visible at < 768px viewport width
- [ ] Bottom tab bar hidden at >= 768px viewport width
- [ ] Active sidebar link has accent-colored left border
- [ ] Active bottom tab item has accent-colored text
- [ ] Net Worth page renders "Net Worth" heading, Refresh button, StatsCards, chart
- [ ] Clicking "Account Groups" sidebar link renders groups content and updates URL to `/groups`
- [ ] Browser Back button navigates to previous route correctly
- [ ] Page content scrolls independently of sidebar (sidebar stays fixed, content scrolls)
- [ ] Main content area does not overflow under bottom tab bar on mobile viewport

---

## Notes

### AppShell split rationale
`useLocation` (used for focus management) requires being inside a router context. Since `BrowserRouter` is added to `main.jsx`, `App` itself is inside the router context. However, splitting into `AppShell` keeps the concern clean: `App` handles the setup gate (pre-router concern), `AppShell` handles the routed layout (router-context concern). This also makes `App.test.jsx` wrapping with `MemoryRouter` cleaner — the test controls the router context.

### BudgetTable sticky columns: confirmed safe
`BudgetTable.module.css` lines 105–113 use `position: sticky; left: 0` for horizontal column stickiness within `.tableWrap { overflow-x: auto }`. This operates on the horizontal scroll axis within the table's own horizontal scroll container. The new `overflow-y: auto` on `.main` creates a vertical scroll container, which is a different axis and a different container. The two do not interact. BudgetTable sticky column behavior is unchanged.

### Error styles: moved, not deleted
Error box styles (`.errorBox`, `.errorTitle`, `.errorMsg`, `.errorCode`, `.errorDetail`) move from `App.module.css` to `NetWorthPage.module.css`. They are not deleted — they are relocated to the component that owns the error state.

### CSS Modules scoping
All new CSS modules (`Sidebar.module.css`, `BottomTabBar.module.css`, `NetWorthPage.module.css`) are locally scoped. Class names do not collide with each other or with `App.module.css`. Only `index.css` contains global classes, which is not modified.
