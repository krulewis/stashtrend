import { useEffect, useState, useCallback, useMemo } from 'react'
import styles from './GroupsPage.module.css'
import GroupsTimeChart from '../components/GroupsTimeChart'
import GroupsSnapshot from '../components/GroupsSnapshot'
import GroupManager from '../components/GroupManager'
import { fetchJSON, postJSON } from '../api.js'

export default function GroupsPage() {
  const [groups,          setGroups]          = useState([])
  const [accounts,        setAccounts]        = useState([])
  const [historyData,     setHistoryData]     = useState(null)
  const [snapshot,        setSnapshot]        = useState(null)
  const [configs,         setConfigs]         = useState([])
  const [activeConfigId,  setActiveConfigId]  = useState(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set())
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)

  // Load accounts once (doesn't change when groups change)
  useEffect(() => {
    fetchJSON('/api/accounts/summary')
      .then(setAccounts)
      .catch((err) => setError(err.message))
  }, [])

  // Load groups + visualization data + configs — re-runs whenever groups are mutated
  const loadGroupData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchJSON('/api/groups'),
      fetchJSON('/api/groups/history'),
      fetchJSON('/api/groups/snapshot'),
      fetchJSON('/api/groups/configs'),
    ])
      .then(([g, h, snap, cfgData]) => {
        setGroups(g)
        setHistoryData(h)
        setSnapshot(snap)
        setConfigs(cfgData.configs)
        // Restore the last active config's group selection
        const activeId = cfgData.active_config_id
        const active   = cfgData.configs.find((c) => c.id === activeId)
        setActiveConfigId(activeId)
        setSelectedGroupIds(active ? new Set(active.group_ids) : new Set())
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadGroupData()
  }, [loadGroupData])

  // Conflict map: group_id → Set of group_ids that share at least one account
  const conflictMap = useMemo(() => {
    const accountToGroups = {}
    for (const g of groups) {
      for (const aid of g.account_ids) {
        if (!accountToGroups[aid]) accountToGroups[aid] = []
        accountToGroups[aid].push(g.id)
      }
    }
    const result = {}
    for (const g of groups) {
      const conflicts = new Set()
      for (const aid of g.account_ids) {
        for (const otherId of accountToGroups[aid] || []) {
          if (otherId !== g.id) conflicts.add(otherId)
        }
      }
      result[g.id] = conflicts
    }
    return result
  }, [groups])

  // Snapshot filtered to the selected group ids
  const filteredSnapshot = useMemo(() => {
    if (!snapshot) return null
    return snapshot.filter((g) => selectedGroupIds.has(g.id))
  }, [snapshot, selectedGroupIds])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGroupToggle = useCallback((groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
    setActiveConfigId(null) // manual toggle clears the saved-config pointer
  }, [])

  const handleSelectConfig = useCallback((config) => {
    setSelectedGroupIds(new Set(config.group_ids))
    setActiveConfigId(config.id)
    // Persist the last-active config (fire and forget — best effort)
    postJSON('/api/groups/configs', { configs, active_config_id: config.id }).catch(() => {})
  }, [configs])

  const handleSaveConfig = useCallback(async (name) => {
    const selectedIds = [...selectedGroupIds]
    const updated     = [...configs, { name, group_ids: selectedIds }]
    try {
      const data = await postJSON('/api/groups/configs', { configs: updated, active_config_id: activeConfigId })
      setConfigs(data.configs)
    } catch {
      // Non-critical — selection still works, just not persisted
    }
  }, [configs, selectedGroupIds, activeConfigId])

  const handleDeleteConfig = useCallback(async (configId) => {
    const updated     = configs.filter((c) => c.id !== configId)
    const newActiveId = activeConfigId === configId ? null : activeConfigId
    try {
      const data = await postJSON('/api/groups/configs', { configs: updated, active_config_id: newActiveId })
      setConfigs(data.configs)
      setActiveConfigId(newActiveId)
    } catch {
      // Non-critical
    }
  }, [configs, activeConfigId])

  // ── Render ────────────────────────────────────────────────────────────────

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
          <GroupsSnapshot
            snapshot={filteredSnapshot}
            groups={groups}
            selectedGroupIds={selectedGroupIds}
            configs={configs}
            activeConfigId={activeConfigId}
            conflictMap={conflictMap}
            onGroupToggle={handleGroupToggle}
            onSelectConfig={handleSelectConfig}
            onSaveConfig={handleSaveConfig}
            onDeleteConfig={handleDeleteConfig}
          />
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
