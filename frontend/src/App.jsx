import { useEffect, useState } from 'react'
import styles from './App.module.css'
import StatsCards from './components/StatsCards'
import NetWorthChart from './components/NetWorthChart'
import AccountsBreakdown from './components/AccountsBreakdown'
import GroupsPage from './pages/GroupsPage'
import SyncPage from './pages/SyncPage'

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

const TABS = [
  { id: 'networth', label: '📈  Net Worth' },
  { id: 'groups',   label: '⬡  Account Groups' },
  { id: 'sync',     label: '🔄  Sync Data' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('networth')

  // Net Worth tab data
  const [stats,    setStats]    = useState(null)
  const [history,  setHistory]  = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [error,    setError]    = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchJSON('/api/networth/stats'),
      fetchJSON('/api/networth/history'),
      fetchJSON('/api/accounts/summary'),
    ])
      .then(([s, h, a]) => {
        setStats(s)
        setHistory(h)
        setAccounts(a)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className={styles.root}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>◈</div>
          <div>
            <div className={styles.appName}>Monarch Dashboard</div>
            <div className={styles.appSub}>Personal Finance Intelligence</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={() => window.location.reload()}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <nav className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ────────────────────────────────────── */}
      <main className={styles.main}>
        {activeTab === 'networth' && (
          <>
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
          </>
        )}

        {activeTab === 'groups' && <GroupsPage />}

        {activeTab === 'sync' && <SyncPage />}
      </main>
    </div>
  )
}
