import { useEffect, useState, useCallback } from 'react'
import styles from './GroupsPage.module.css'
import GroupsTimeChart from '../components/GroupsTimeChart'
import GroupsSnapshot from '../components/GroupsSnapshot'
import GroupManager from '../components/GroupManager'

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function GroupsPage() {
  const [groups,      setGroups]      = useState([])
  const [accounts,    setAccounts]    = useState([])
  const [historyData, setHistoryData] = useState(null)
  const [snapshot,    setSnapshot]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  // Load accounts once (doesn't change when groups change)
  useEffect(() => {
    fetchJSON('/api/accounts/summary')
      .then(setAccounts)
      .catch((err) => setError(err.message))
  }, [])

  // Load groups + visualization data — re-runs whenever groups are mutated
  const loadGroupData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchJSON('/api/groups'),
      fetchJSON('/api/groups/history'),
      fetchJSON('/api/groups/snapshot'),
    ])
      .then(([g, h, snap]) => {
        setGroups(g)
        setHistoryData(h)
        setSnapshot(snap)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadGroupData()
  }, [loadGroupData])

  if (error) {
    return (
      <div className={styles.error}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>
          ⚠ Error loading data
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' }}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* Charts row */}
      <div className={styles.chartsRow}>
        <div className={styles.timeChartCol}>
          <GroupsTimeChart historyData={historyData} />
        </div>
        <div className={styles.snapshotCol}>
          <GroupsSnapshot snapshot={snapshot} />
        </div>
      </div>

      {/* Group manager */}
      <div className={styles.managerSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Manage Groups</h2>
          <div className={styles.sectionSub}>
            Groups let you bundle accounts into custom buckets and track them over time.
          </div>
        </div>
        {loading && groups.length === 0 ? (
          <div className={styles.loadingMsg}>Loading…</div>
        ) : (
          <GroupManager
            groups={groups}
            accounts={accounts}
            onGroupsChanged={loadGroupData}
          />
        )}
      </div>
    </div>
  )
}
