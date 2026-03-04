# Implementation Plan — Sidebar Navigation with URL Routing

**Date:** 2026-03-03
**Agent:** Engineer Agent (Step 3 of planning pipeline)
**Change size:** M
**Input documents:** `sidebar-nav-research.md`, `sidebar-nav-architecture.md`

---

## Overview

This plan adds `react-router-dom` v6 URL routing to Stashtrend, replacing the `useState` tab controller in `App.jsx` with a proper `<Routes>` / `<Route>` tree, a fixed 220px sidebar for desktop (>= 768px), and a pinned bottom tab bar for mobile (< 768px). Net Worth content is extracted from `App.jsx` into its own `NetWorthPage` component that self-fetches its data, consistent with all other page components.

Backend: **zero changes.** nginx and Vite: **zero config changes.** Both already support SPA fallback.

---

## Files to Create

### 1. `src/nav.js`

Single source of truth for nav items. Both `Sidebar` and `BottomTabBar` import from here.

```js
/**
 * NAV_ITEMS — single source of truth for sidebar and bottom tab bar.
 * Edit here to add, remove, or reorder nav items.
 */
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',      icon: '📈' },
  { path: '/groups',   label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
```

No imports, no dependencies. Pure data. Used as-is by both nav components.

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

No props. Self-contained — reads active state from router context via `NavLink`'s `isActive` callback.

---

### 3. `src/components/Sidebar.module.css`

```css
/* Hidden on mobile; shown via media query on desktop */
.sidebar {
  display: none;
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-deep);
  border-right: 1px solid var(--border);
  padding: var(--sp-4) 0;
  overflow-y: auto;
  position: sticky;
  top: 0;
  align-self: flex-start;
  height: calc(100vh - 57px); /* 57px = header height at mobile; overridden at 768px */
}

@media (min-width: 768px) {
  .sidebar {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 73px); /* 73px = header height at desktop (16px*2 + content) */
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
  font-size: 16px;
  line-height: 1;
  width: 20px;           /* fixed width so labels align regardless of emoji width */
  text-align: center;
}

.navLabel {
  flex: 1;
}
```

**Token notes (from architecture doc §6.2):**
- `--bg-deep` (#161b27) — sidebar background, one step darker than `--bg-root`
- `--bg-hover` (#252a3d) — hover + active background
- `--accent` (#6366f1) — active left border indicator
- `--accent-light` (#818cf8) — active item text
- `--border` (#2d3348) — right edge separator
- `--sp-3` (12px), `--sp-4` (16px), `--sp-5` (20px) — spacing scale

---

### 4. `src/components/BottomTabBar.jsx`

```jsx
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../nav.js'
import styles from './BottomTabBar.module.css'

export default function BottomTabBar() {
  return (
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
  )
}
```

No props. Same `NavLink` + `NAV_ITEMS` pattern as `Sidebar`.

---

### 5. `src/components/BottomTabBar.module.css`

```css
/* Visible only on mobile; hidden on desktop */
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
  padding-bottom: env(safe-area-inset-bottom, 0); /* iOS safe area (notch/home indicator) */
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
  flex: 1;
  min-width: 0;
}

.tabIcon {
  font-size: 20px;
  line-height: 1;
}

.tabLabel {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
}

.tabItemActive {
  color: var(--accent-light);
}
```

**Token notes (from architecture doc §6.4):**
- `--bg-card` (#1e2130) — bar background, matches existing card surfaces
- `--border` (#2d3348) — top edge separator
- `--accent-light` (#818cf8) — active tab color

---

### 6. `src/pages/NetWorthPage.jsx`

Extracted from `App.jsx`. Owns its own data fetching, matching the pattern of all other pages. Includes the page header row with title, "Updated at" timestamp, and refresh button (moved from global header per architecture doc §3.1 and §3.2).

```jsx
import { useEffect, useState } from 'react'
import StatsCards from '../components/StatsCards.jsx'
import NetWorthChart from '../components/NetWorthChart.jsx'
import AccountsBreakdown from '../components/AccountsBreakdown.jsx'
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary } from '../api.js'
import styles from './NetWorthPage.module.css'

export default function NetWorthPage() {
  const [stats,       setStats]       = useState(null)
  const [history,     setHistory]     = useState(null)
  const [accounts,    setAccounts]    = useState(null)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  function loadData() {
    setError(null)
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
    ])
      .then(([stats, history, accounts]) => {
        setStats(stats)
        setHistory(history)
        setAccounts(accounts)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Net Worth</h2>
        <div className={styles.pageActions}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={loadData}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Error state ── */}
      {error ? (
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
      ) : (
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

```css
.page {
  /* No extra wrapper padding — inherits from .main in App.module.css */
}

/* Page header: title left, actions right */
.pageHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-5);
  gap: var(--sp-3);
  flex-wrap: wrap;
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
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
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

/* Error state — moved from App.module.css */
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

### 8. Test Files to Create

See "Test Strategy" section for full details on each file. Files:

- `src/components/Sidebar.test.jsx` — 5 tests
- `src/components/BottomTabBar.test.jsx` — 4 tests
- `src/pages/NetWorthPage.test.jsx` — 6 tests

---

## Files to Modify

### 1. `frontend/package.json`

**Change:** Add `react-router-dom` to `dependencies`.

Current `dependencies` block (lines 13–18):
```json
"dependencies": {
  "prop-types": "^15.8.1",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "recharts": "^2.12.7"
},
```

New `dependencies` block:
```json
"dependencies": {
  "prop-types": "^15.8.1",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.28.0",
  "recharts": "^2.12.7"
},
```

**Why `^6.28.0`:** Pin to v6.x only (not v7) per architecture doc §8.3. The `^6` range in npm resolves to the latest v6 release. As of 2026-03-03, that is v6.28.x. Using `^6` allows patch updates for security fixes while preventing accidental v7 upgrade.

**Do NOT run `npm install` manually — use the exact command in Implementation Steps below.**

---

### 2. `src/main.jsx`

**Current (lines 1–10):**
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**New:**
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

**Change:** Add `import { BrowserRouter } from 'react-router-dom'` (line 3) and wrap `<App />` with `<BrowserRouter>` (lines 8 and 10).

---

### 3. `src/App.jsx`

This is the largest single-file change. The entire file is rewritten. Below is the before/after mapping for every section.

**Remove entirely:**
- Lines 3–5: imports for `StatsCards`, `NetWorthChart`, `AccountsBreakdown` (move to `NetWorthPage`)
- Lines 11: `fetchNetworthStats`, `fetchNetworthHistory`, `fetchAccountsSummary` from api import (keep only `fetchSetupStatus`)
- Lines 14–20: `const TABS = [...]` array
- Lines 24: `const [activeTab, setActiveTab] = useState('networth')`
- Lines 27–31: five net worth data state declarations (`stats`, `history`, `accounts`, `error`, `lastUpdated`)
- Lines 43–57: `loadDashboardData()` function
- Lines 59–62: `useEffect` that calls `loadDashboardData()` when `configured === true`
- Lines 80–86: `lastUpdated` span and refresh button in the `headerRight` div
- Lines 89–100: entire `<nav className={styles.tabBar}>` block
- Lines 104–125: entire net worth conditional render block (`activeTab === 'networth'`)
- Lines 127–133: `activeTab === 'groups'`, `activeTab === 'budgets'`, `activeTab === 'builder'`, `activeTab === 'sync'` conditional renders

**Add:**
- Import: `{ Routes, Route, Navigate }` from `react-router-dom`
- Import: `Sidebar` from `./components/Sidebar.jsx`
- Import: `BottomTabBar` from `./components/BottomTabBar.jsx`
- Import: `NetWorthPage` from `./pages/NetWorthPage.jsx`
- Remove `GroupsPage`, `BudgetPage`, `BudgetBuilderPage`, `SyncPage` direct imports (they still exist but are now imported differently — actually keep them, just move to route children)
- New layout structure in the return

**Full new `App.jsx`:**

```jsx
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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

      {/* ── Body: sidebar + main content ────────────────────── */}
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Navigate to="/networth" replace />} />
            <Route path="/networth" element={<NetWorthPage />} />
            <Route path="/groups"   element={<GroupsPage />} />
            <Route path="/budgets"  element={<BudgetPage />} />
            <Route path="/builder"  element={<BudgetBuilderPage />} />
            <Route path="/sync"     element={<SyncPage />} />
            <Route path="*"         element={<Navigate to="/networth" replace />} />
          </Routes>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ────────────────────────────── */}
      <BottomTabBar />
    </div>
  )
}
```

**Import line diff summary:**
- Remove: `StatsCards`, `NetWorthChart`, `AccountsBreakdown` imports (move to NetWorthPage)
- Remove: `fetchNetworthStats`, `fetchNetworthHistory`, `fetchAccountsSummary` from api import
- Add: `{ Routes, Route, Navigate }` from `react-router-dom`
- Add: `Sidebar` from `./components/Sidebar.jsx`
- Add: `BottomTabBar` from `./components/BottomTabBar.jsx`
- Add: `NetWorthPage` from `./pages/NetWorthPage.jsx`
- Keep: all existing page imports (`GroupsPage`, `BudgetPage`, `BudgetBuilderPage`, `SyncPage`, `SetupPage`)
- Keep: `fetchSetupStatus` in api import, `version` import

---

### 4. `src/App.module.css`

**Remove these classes entirely** (they move to `NetWorthPage.module.css` or become obsolete):
- `.updatedAt` (lines 80–84 + media query lines 86–88 for `.updatedAt` entry) — moves to NetWorthPage
- `.refreshBtn` (lines 91–104) — moves to NetWorthPage
- `.tabBar` (lines 107–115) — replaced by Sidebar/BottomTabBar
- `.tabBar::-webkit-scrollbar` (line 117) — removed with tabBar
- `.tabBtn` (lines 123–137 + 139–141 media query block) — replaced by Sidebar/BottomTabBar
- `.tabBtnActive` (lines 143–146) — removed with tabBtn
- `.errorBox` (lines 163–174) — moves to NetWorthPage.module.css
- `.errorTitle`, `.errorMsg`, `.errorCode`, `.errorDetail` (lines 176–211) — all move to NetWorthPage.module.css

**Modify `.root`** (lines 13–16) — add grid layout:

```css
.root {
  min-height: 100vh;
  background: var(--bg-root);
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr;
}
```

**Add `.body`** (new class, after `.root`):

```css
.body {
  display: flex;
  flex-direction: row;
  min-height: 0; /* allow flex children to scroll independently */
}

@media (max-width: 767px) {
  .body {
    padding-bottom: 60px; /* 56px bar height + 4px breathing room, prevents content hiding behind fixed BottomTabBar */
  }
}
```

**Modify `.main`** (lines 149–153 + media queries lines 155–162):

Current:
```css
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px;
}

@media (min-width: 768px) {
  .main { padding: 28px 24px; }
}

@media (min-width: 1024px) {
  .main { padding: 32px 24px; }
}
```

New:
```css
.main {
  flex: 1;
  min-width: 0;       /* prevent flex blowout when content is wide */
  max-width: 1200px;
  padding: var(--sp-5) var(--sp-4); /* 20px 16px */
  overflow-y: auto;
}

@media (min-width: 768px) {
  .main { padding: var(--sp-8) var(--sp-6); } /* 32px 24px */
}
```

Note: `margin: 0 auto` is removed from `.main`. The `max-width: 1200px` cap remains to prevent the content area from becoming too wide on ultrawide monitors, but centering is no longer needed — the sidebar already provides left-side offset. The 1024px breakpoint collapses into the 768px breakpoint (same padding value, one fewer rule).

**Modify `.header`** — add `z-index: 20` to match architecture doc (currently `z-index: 10`):

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bg-card);
  background: var(--bg-root);
  position: sticky;
  top: 0;
  z-index: 20;
}
```

**Keep unchanged:**
- `.loading`
- `.headerLeft`, `.logo`, `.appName`, `.appSub`, `.headerRight`, `.versionBadge`
- All header media queries

**Full resulting `App.module.css` after changes:**

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
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bg-card);
  background: var(--bg-root);
  position: sticky;
  top: 0;
  z-index: 20;
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
  gap: 8px;
}

.versionBadge {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.5;
}

/* Body: flex row containing sidebar + main */
.body {
  display: flex;
  flex-direction: row;
  min-height: 0;
}

@media (max-width: 767px) {
  .body {
    padding-bottom: 60px; /* prevent content from hiding behind fixed BottomTabBar */
  }
}

/* Main content area */
.main {
  flex: 1;
  min-width: 0;
  max-width: 1200px;
  padding: var(--sp-5) var(--sp-4);
  overflow-y: auto;
}

@media (min-width: 768px) {
  .main { padding: var(--sp-8) var(--sp-6); }
}
```

---

### 5. `src/App.test.jsx`

All `render(<App />)` calls must be wrapped in `<MemoryRouter>` because `App` now uses `<Routes>`, `<Route>`, `<Navigate>` — components that require a router context. In tests, `MemoryRouter` provides this context without a real browser URL.

**Add import** at line 2:
```jsx
import { MemoryRouter } from 'react-router-dom'
```

**Add mock** for `NetWorthPage` after the existing page mocks (after line 10):
```jsx
vi.mock('./pages/NetWorthPage.jsx', () => ({ default: () => <div data-testid="networth-page" /> }))
```

**Add helper function** after the `vi.mock` blocks:
```jsx
function renderApp(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  )
}
```

**Rewrite each test** — full test-by-test changes:

**Test 1 — "renders the app name in the header"** (line 26)
```jsx
// Before:
render(<App />)
// After:
renderApp()
// Assertion: unchanged — findByText('Stashtrend') still works
```

**Test 2 — "renders all four tab buttons"** (line 31) — FULL REWRITE
```jsx
// Before: finds role='button' with names 'Net Worth', 'Account Groups', 'Budgets', 'Sync Data'
// After: NavLinks render as <a> tags, role='link'. Test name changes to match new nav type.

it('renders all nav links', async () => {
  renderApp()
  expect(await screen.findByRole('link', { name: /Net Worth/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Account Groups/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Budgets/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Sync Data/ })).toBeInTheDocument()
})
```

Note: `NavLink` renders as `<a>` not `<button>`. There will be two sets of nav links (Sidebar + BottomTabBar), both rendering the same `NAV_ITEMS`. `screen.findByRole('link', { name: /Net Worth/ })` finds the first match — both Sidebar and BottomTabBar links are present in the DOM; only one needs to be checked for presence.

**Test 3 — "shows Net Worth content by default (no other pages visible)"** (line 40)
```jsx
// Before:
render(<App />)
await screen.findByText('Stashtrend')
// After:
renderApp('/networth')
await screen.findByText('Stashtrend')
// Assertions: unchanged — queryByTestId('groups-page'), queryByTestId('sync-page')
// NetWorthPage is now mocked at data-testid="networth-page"
// Add positive assertion:
expect(screen.getByTestId('networth-page')).toBeInTheDocument()
```

**Test 4 — "switches to Account Groups tab when clicked"** (line 47)
```jsx
// Before: fireEvent.click(await screen.findByText(/Account Groups/)) — clicked a <button>
// After: same click works — NavLink text is still 'Account Groups', click triggers navigation
// BUT: fireEvent.click on NavLink in MemoryRouter does navigate — need userEvent or check via URL
// Use fireEvent.click on the link by role for consistency:
renderApp()
fireEvent.click(await screen.findByRole('link', { name: /Account Groups/ }))
expect(screen.getByTestId('groups-page')).toBeInTheDocument()
expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
// Note: findByRole returns the first match. Both Sidebar and BottomTabBar have this link.
// Either works for click — fireEvent.click on one NavLink triggers navigation.
```

**Test 5 — "switches to Sync Data tab when clicked"** (line 54)
```jsx
renderApp()
fireEvent.click(await screen.findByRole('link', { name: /Sync Data/ }))
expect(screen.getByTestId('sync-page')).toBeInTheDocument()
expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
```

**Test 6 — "switches to Budgets tab when clicked"** (line 61)
```jsx
renderApp()
fireEvent.click(await screen.findByRole('link', { name: /Budgets/ }))
expect(screen.getByTestId('budget-page')).toBeInTheDocument()
expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
```

**Test 7 — "can switch back from Groups to Net Worth"** (line 69)
```jsx
renderApp()
fireEvent.click(await screen.findByRole('link', { name: /Account Groups/ }))
fireEvent.click(screen.getByRole('link', { name: /Net Worth/ }))
expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
expect(screen.getByTestId('networth-page')).toBeInTheDocument()
```

**Test 8 — "shows API error state when data fetch fails"** (line 77)
```jsx
// Before: render(<App />) — error renders inside App's inline net worth block
// After: error renders inside NetWorthPage — but NetWorthPage is MOCKED in App.test.jsx
// This test should REMAIN in NetWorthPage.test.jsx instead (see new test file below)
// In App.test.jsx, remove or replace this test with a simpler assertion:

it('shows API error state when data fetch fails', async () => {
  // NetWorthPage is mocked — this test now just verifies setup status error handling
  // is not App's job anymore. Keep test to verify setup check still works under error.
  global.fetch = vi.fn((url) => {
    if (url.includes('/api/setup/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: true }) })
    }
    return Promise.reject(new Error('Connection refused'))
  })
  renderApp('/networth')
  // NetWorthPage is mocked — it renders regardless; error state is tested in NetWorthPage.test.jsx
  await waitFor(() => {
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
  })
})
```

**Test 9 — "renders a Refresh button"** (line 91) — REWRITE
```jsx
// Before: refresh button was in the global App header
// After: refresh button is inside NetWorthPage, which is MOCKED in App.test.jsx
// This test moves to NetWorthPage.test.jsx. In App.test.jsx, replace with:

it('renders only the version badge in the header (no page-specific controls)', async () => {
  renderApp()
  await screen.findByText('Stashtrend')
  expect(screen.queryByText(/Refresh/)).not.toBeInTheDocument()
})
```

**Test 10 — "shows loading state while setup status is loading"** (line 96)
```jsx
// Before: render(<App />)
// After: renderApp() — loading state renders BEFORE routes (pre-router gate), so MemoryRouter wrapper is fine
global.fetch = vi.fn(() => new Promise(() => {}))
renderApp()
expect(screen.getByText(/Loading/)).toBeInTheDocument()
```

**Test 11 — "shows SetupPage when not configured"** (line 103)
```jsx
// Before: render(<App />)
// After: renderApp() — SetupPage gate is pre-router, unaffected by route
mockFetch({ '/api/setup/status': { configured: false } })
renderApp()
await waitFor(() => {
  expect(screen.getByTestId('setup-page')).toBeInTheDocument()
})
```

---

## Implementation Steps — Ordered

### Step 0 — Pre-implementation audit (before writing any code)

Search for any references to `activeTab` or `TABS` outside of `App.jsx`:

```bash
grep -r "activeTab\|from.*App" frontend/src --include="*.jsx" --include="*.js" | grep -v "App.jsx" | grep -v "App.test.jsx" | grep -v ".module.css"
```

Expected result: no matches. Confirms the removal of `TABS` and `activeTab` is safe.

Also confirm `--bg-deep` and `--bg-hover` tokens exist in `index.css`:

```bash
grep "bg-deep\|bg-hover\|accent-light\|ease-default\|sp-4\|sp-5\|sp-6\|sp-8" frontend/src/index.css
```

If any tokens are missing, add them to `index.css` before proceeding. (These tokens were established in the design token work — they should all exist.)

---

### Step 1 — Install react-router-dom

```bash
cd /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/ui-ux-improvements/frontend
npm install react-router-dom@^6
```

This updates `package.json` and `package-lock.json`. Verify the install:

```bash
node -e "require('./node_modules/react-router-dom/package.json').version" 2>/dev/null || cat node_modules/react-router-dom/package.json | grep '"version"'
```

Expected: version starts with `6.`.

---

### Step 2 — Create `src/nav.js`

Create the file at `src/nav.js` with the exact content shown in "Files to Create §1" above.

Verify manually: the array has 5 items, paths match `/networth`, `/groups`, `/budgets`, `/builder`, `/sync`.

---

### Step 3 — Write tests BEFORE implementation (tests-first per global workflow)

Write all three new test files now. They will fail because the components don't exist yet — this is the required TDD state.

#### `src/components/Sidebar.test.jsx`

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import Sidebar from './Sidebar.jsx'
import { NAV_ITEMS } from '../nav.js'

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
    NAV_ITEMS.forEach(item => {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    })
  })

  it('each nav item links to the correct href', () => {
    renderSidebar()
    NAV_ITEMS.forEach(item => {
      const link = screen.getByRole('link', { name: new RegExp(item.label) })
      expect(link).toHaveAttribute('href', item.path)
    })
  })

  it('the nav item matching the current route has the active class', () => {
    renderSidebar('/budgets')
    const budgetsLink = screen.getByRole('link', { name: /Budgets/ })
    expect(budgetsLink.className).toMatch(/navItemActive/)
  })

  it('non-matching nav items do not have the active class', () => {
    renderSidebar('/budgets')
    const networthLink = screen.getByRole('link', { name: /Net Worth/ })
    expect(networthLink.className).not.toMatch(/navItemActive/)
  })

  it('clicking a nav item navigates to the correct route', () => {
    const { container } = renderSidebar('/networth')
    const groupsLink = screen.getByRole('link', { name: /Account Groups/ })
    fireEvent.click(groupsLink)
    // After click in MemoryRouter, the groups link should become active
    expect(groupsLink.className).toMatch(/navItemActive/)
  })
})
```

#### `src/components/BottomTabBar.test.jsx`

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import BottomTabBar from './BottomTabBar.jsx'
import { NAV_ITEMS } from '../nav.js'

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
    NAV_ITEMS.forEach(item => {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    })
  })

  it('each tab item links to the correct href', () => {
    renderBottomTabBar()
    NAV_ITEMS.forEach(item => {
      const link = screen.getByRole('link', { name: new RegExp(item.label) })
      expect(link).toHaveAttribute('href', item.path)
    })
  })

  it('the tab item matching the current route has the active class', () => {
    renderBottomTabBar('/sync')
    const syncLink = screen.getByRole('link', { name: /Sync Data/ })
    expect(syncLink.className).toMatch(/tabItemActive/)
  })

  it('clicking a tab item navigates to the correct route', () => {
    renderBottomTabBar('/networth')
    const budgetsLink = screen.getByRole('link', { name: /Budgets/ })
    fireEvent.click(budgetsLink)
    expect(budgetsLink.className).toMatch(/tabItemActive/)
  })
})
```

#### `src/pages/NetWorthPage.test.jsx`

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NetWorthPage from './NetWorthPage.jsx'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, mockFetch } from '../test/fixtures.js'

// Mock heavy child components so tests focus on NetWorthPage behavior
vi.mock('../components/StatsCards.jsx',       () => ({ default: ({ stats }) => <div data-testid="stats-cards">{stats ? 'loaded' : 'empty'}</div> }))
vi.mock('../components/NetWorthChart.jsx',    () => ({ default: () => <div data-testid="net-worth-chart" /> }))
vi.mock('../components/AccountsBreakdown.jsx',() => ({ default: () => <div data-testid="accounts-breakdown" /> }))

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

  it('renders child components after data loads', async () => {
    render(<NetWorthPage />)
    expect(await screen.findByTestId('stats-cards')).toBeInTheDocument()
    expect(screen.getByTestId('net-worth-chart')).toBeInTheDocument()
    expect(screen.getByTestId('accounts-breakdown')).toBeInTheDocument()
  })

  it('renders the API error state when data fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Connection refused')))
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument()
    })
  })

  it('renders a Refresh button', async () => {
    render(<NetWorthPage />)
    expect(await screen.findByText(/Refresh/)).toBeInTheDocument()
  })

  it('clicking Refresh re-fetches data', async () => {
    render(<NetWorthPage />)
    await screen.findByTestId('stats-cards') // wait for initial load
    const fetchCallCount = global.fetch.mock.calls.length
    fireEvent.click(screen.getByText(/Refresh/))
    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(fetchCallCount)
    })
  })

  it('renders the "Updated at" timestamp after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Updated at/)).toBeInTheDocument()
    })
  })

  it('does not show "Updated at" before data loads', () => {
    // Never-resolving fetch keeps data null
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<NetWorthPage />)
    expect(screen.queryByText(/Updated at/)).not.toBeInTheDocument()
  })
})
```

**Run tests now to confirm they all fail (expected):**
```bash
cd /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/ui-ux-improvements/frontend
npx vitest run src/components/Sidebar.test.jsx src/components/BottomTabBar.test.jsx src/pages/NetWorthPage.test.jsx
```

Expected: all fail with "Cannot find module" or similar. Good — this confirms TDD baseline.

---

### Step 4 — Create `src/pages/NetWorthPage.jsx` and `src/pages/NetWorthPage.module.css`

Create the files with the exact content from "Files to Create §6 and §7" above.

Run NetWorthPage tests:
```bash
npx vitest run src/pages/NetWorthPage.test.jsx
```

Expected: all 6 pass.

---

### Step 5 — Create `src/components/Sidebar.jsx` and `src/components/Sidebar.module.css`

Create the files with the exact content from "Files to Create §2 and §3" above.

Run Sidebar tests:
```bash
npx vitest run src/components/Sidebar.test.jsx
```

Expected: all 5 pass.

---

### Step 6 — Create `src/components/BottomTabBar.jsx` and `src/components/BottomTabBar.module.css`

Create the files with the exact content from "Files to Create §4 and §5" above.

Run BottomTabBar tests:
```bash
npx vitest run src/components/BottomTabBar.test.jsx
```

Expected: all 4 pass.

---

### Step 7 — Modify `src/main.jsx`

Apply the exact change described in "Files to Modify §2": add BrowserRouter import and wrap `<App />`.

No tests for `main.jsx` (it's the entry point, not a component). Verify visually in Step 10.

---

### Step 8 — Modify `src/App.jsx`

Replace the entire file with the new content from "Files to Modify §3". The key changes:
1. Remove `TABS`, `activeTab`, all net worth state and `loadDashboardData()`
2. Remove all net worth data imports
3. Add `Routes`, `Route`, `Navigate` from react-router-dom
4. Add `Sidebar`, `BottomTabBar`, `NetWorthPage` imports
5. Remove `<nav className={styles.tabBar}>` entirely
6. Remove refresh button and `updatedAt` from the header
7. Add `<div className={styles.body}>` wrapping `<Sidebar />` and `<main>`
8. Replace conditional renders with `<Routes>` tree
9. Add `<BottomTabBar />` at the bottom of the root div

---

### Step 9 — Modify `src/App.module.css`

Apply changes described in "Files to Modify §4":
1. Add `display: grid; grid-template-rows: auto 1fr; grid-template-columns: 1fr;` to `.root`
2. Change `z-index: 10` to `z-index: 20` in `.header`
3. Add `.body` class with flex-row layout and mobile padding-bottom
4. Rewrite `.main` to `flex: 1; min-width: 0; ...` (remove `margin: 0 auto`, remove 1024px breakpoint)
5. Remove: `.updatedAt`, `.refreshBtn`, `.tabBar`, `.tabBar::-webkit-scrollbar`, `.tabBtn`, `.tabBtnActive`, `.errorBox`, `.errorTitle`, `.errorMsg`, `.errorCode`, `.errorDetail`

---

### Step 10 — Update `src/App.test.jsx`

Apply all changes described in "Files to Modify §5":
1. Add `import { MemoryRouter } from 'react-router-dom'`
2. Add `vi.mock('./pages/NetWorthPage.jsx', ...)` mock
3. Add `renderApp()` helper function
4. Rewrite each test per the test-by-test changes above

Run App tests:
```bash
npx vitest run src/App.test.jsx
```

Expected: all 10 tests pass (same count as before).

---

### Step 11 — Run full test suite

```bash
cd /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/ui-ux-improvements/frontend
npm test
```

Expected: all existing tests pass + 15 new tests pass (5 Sidebar + 4 BottomTabBar + 6 NetWorthPage). Zero regressions.

If any tests fail, diagnose before proceeding. Do not move to Step 12 with failing tests.

---

## Test Strategy

### Write-first order (TDD — tests must fail before implementation)

1. Write all three new test files (Step 3) before creating components.
2. Confirm all fail with import errors.
3. Implement components.
4. Confirm all pass.
5. Update `App.test.jsx` last (after components are implemented, before running full suite).

### Test coverage summary

| File | Tests | What it covers |
|------|-------|----------------|
| `Sidebar.test.jsx` | 5 | Renders all 5 items, correct hrefs, active class on matching route, no active class on non-matching, click navigates |
| `BottomTabBar.test.jsx` | 4 | Renders all 5 items, correct hrefs, active class on matching route, click navigates |
| `NetWorthPage.test.jsx` | 6 | Child components render, error state, refresh button present, refresh re-fetches, "Updated at" shows, "Updated at" absent before load |
| `App.test.jsx` | 10 | App name renders, nav links render, net worth page default, navigation to each page, back navigation, error handling, header has no refresh, loading state, setup page |

**Total new tests: 15.** Total after: ~66 (51 existing + 15 new).

### What is NOT tested (and why)

- **CSS breakpoint visibility** (sidebar hidden on mobile, bottom bar hidden on desktop): CSS `display: none` via media queries cannot be tested in jsdom/Vitest because jsdom has no layout engine. These are verified visually in Playwright QA (Step 7 of workflow).
- **iPhone safe-area-inset**: same reason — visual/device QA only.
- **Browser back/forward navigation**: tested by the browser, not unit tests.

### Key testing patterns used

- `MemoryRouter` with `initialEntries` for controlled route state in all nav component tests.
- `vi.mock()` for page components in `App.test.jsx` to prevent their own fetch calls interfering.
- `vi.mock()` for `StatsCards`, `NetWorthChart`, `AccountsBreakdown` in `NetWorthPage.test.jsx` to isolate the page's own behavior.
- `mockFetch()` from `test/fixtures.js` for API mocking.
- `waitFor()` for async state assertions.
- `fireEvent.click()` for navigation — adequate for testing that clicks trigger route changes; `userEvent` not needed here (no complex event sequences).

---

## Rollback Plan

If the implementation causes regressions that cannot be fixed quickly:

1. **Git restore** to the last good commit before this work began:
   ```bash
   git stash
   # or
   git checkout HEAD -- frontend/src/App.jsx frontend/src/App.module.css frontend/src/main.jsx frontend/package.json
   ```

2. The new files (`nav.js`, `Sidebar.jsx`, `BottomTabBar.jsx`, `NetWorthPage.jsx` + their CSS and tests) can be left in place — they have no effect if `App.jsx` does not import them.

3. Delete the new files if needed to clean up:
   ```bash
   rm frontend/src/nav.js
   rm frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.module.css frontend/src/components/Sidebar.test.jsx
   rm frontend/src/components/BottomTabBar.jsx frontend/src/components/BottomTabBar.module.css frontend/src/components/BottomTabBar.test.jsx
   rm frontend/src/pages/NetWorthPage.jsx frontend/src/pages/NetWorthPage.module.css frontend/src/pages/NetWorthPage.test.jsx
   ```

4. The `react-router-dom` package can remain in `node_modules` harmlessly if rollback is needed — it is unused unless imported.

**Most likely failure modes and first-response fixes:**

| Failure | Fix |
|---------|-----|
| `App` tests fail with "No routes matched location '...'" | Verify `MemoryRouter` wrapping in `App.test.jsx` and that `renderApp()` is called with a valid route |
| Sidebar/BottomTabBar tests fail with "Cannot find module '../nav.js'" | Confirm `src/nav.js` was created with the correct relative path |
| `NavLink` active class not matching in tests | Confirm `MemoryRouter initialEntries` matches the route being tested; CSS Modules mangle class names — use `.toMatch(/navItemActive/)` not exact string match |
| `NetWorthPage` tests fail with "Cannot find module '../components/StatsCards'" | Confirm mock paths use `../components/...` not `./components/...` (NetWorthPage.test.jsx is in `src/pages/`) |
| App renders blank on `/` | Verify the `<Navigate to="/networth" replace />` route is the first route in the `<Routes>` block |
| Header z-index fights with sidebar | Confirm `z-index: 20` on `.header` and that `.sidebar` has no `z-index` set (sidebar is not fixed-position, so no z-index conflict) |

---

## Verification Checklist

### Automated (all must pass before Playwright QA)

```
[ ] npm install react-router-dom@^6 succeeds, package.json updated
[ ] npx vitest run src/components/Sidebar.test.jsx — 5 pass, 0 fail
[ ] npx vitest run src/components/BottomTabBar.test.jsx — 4 pass, 0 fail
[ ] npx vitest run src/pages/NetWorthPage.test.jsx — 6 pass, 0 fail
[ ] npx vitest run src/App.test.jsx — 10 pass, 0 fail
[ ] npm test (full suite) — all pass, zero regressions vs baseline
```

### Visual / Playwright QA (Step 7 of workflow)

Desktop (browser window >= 768px wide):
```
[ ] Sidebar visible at 220px width on left side
[ ] Sidebar background is darker than main content area (#161b27 vs #0d1117)
[ ] 5 nav items render with emoji icon + label
[ ] Active nav item has accent-colored left border and text
[ ] Clicking each nav item changes the route (URL bar updates)
[ ] Content area renders correct page for each route
[ ] Refresh button and "Updated at" appear inside the Net Worth page header, not the global header
[ ] Global header shows only: logo, app name, subtitle, version badge
[ ] Bottom tab bar NOT visible at >= 768px
[ ] Browser Back button navigates to previous page
[ ] Navigating to / redirects to /networth automatically
[ ] Navigating to an unknown path (/garbage) redirects to /networth
```

Mobile (browser window < 768px wide):
```
[ ] Sidebar NOT visible
[ ] Bottom tab bar visible at bottom of viewport
[ ] Bottom tab bar has 5 items with emoji icon + label
[ ] Active tab item has accent color
[ ] Tapping each tab item navigates correctly
[ ] Main content not hidden behind the bottom tab bar (60px padding-bottom)
[ ] iPhone safe-area padding correct (env(safe-area-inset-bottom))
```

---

## Architecture Decisions Referenced

All decisions in this plan come directly from `sidebar-nav-architecture.md`. Key callouts:

| Decision | Source |
|----------|--------|
| BrowserRouter in main.jsx, not createBrowserRouter | §1 Selected Approach |
| 220px fixed sidebar, no collapse | §2.3 Rejected Alternatives |
| Bottom tab bar (not hamburger) on mobile | §2.4 Rejected Alternatives |
| NetWorth data fetching moves INTO NetWorthPage | §5.3 NetWorthPage Extraction |
| Refresh button and "Updated at" move to NetWorthPage | §3.1, §3.2 Open Questions |
| / redirects to /networth with `replace` | §3.3 Open Questions |
| * catch-all redirects to /networth silently | §4.3 404 Handling |
| Emoji icons retained, no SVG library | §3.4 Open Questions |
| `^6` pin for react-router-dom | §8.3 Risks |
| `MemoryRouter` wrapping in all App tests | §7.1 App.test.jsx Changes |
| Sidebar hidden on mobile via CSS `display: none` | §5.1 Sidebar Component |
| BottomTabBar hidden on desktop via CSS `display: none` | §5.2 BottomTabBar Component |
| No global state / Context API needed | §5.6 Global State |
