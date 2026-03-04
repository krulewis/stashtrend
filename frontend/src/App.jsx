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
