import { useEffect, useState } from 'react'
import styles from './SyncControl.module.css'
import { fetchSyncLastStatus, startSync } from '../api.js'
import { fmtDatetime } from './chartUtils.jsx'
import { SYNC_ENTITY_ORDER, SYNC_ENTITY_LABELS, SYNC_ENTITY_DESCS } from '../constants/syncEntities.js'

const ENTITIES = SYNC_ENTITY_ORDER.map(key => ({
  key,
  label: SYNC_ENTITY_LABELS[key],
  desc:  SYNC_ENTITY_DESCS[key],
}))

export default function SyncControl({ isRunning, onSyncStarted }) {
  const [selected,    setSelected]    = useState(new Set(ENTITIES.map(e => e.key)))
  const [fullMode,    setFullMode]    = useState(false)
  const [lastStatus,  setLastStatus]  = useState({})
  const [loadError,   setLoadError]   = useState(null)
  const [isStarting,  setIsStarting]  = useState(false)
  const [startError,  setStartError]  = useState(null)

  useEffect(() => {
    setLoadError(null)
    fetchSyncLastStatus()
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.entity] = r })
        setLastStatus(map)
      })
      .catch(() => setLoadError('Could not load last sync status'))
  }, [isRunning])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleStart() {
    if (isRunning || selected.size === 0 || isStarting) return
    setIsStarting(true)
    setStartError(null)
    try {
      const data = await startSync([...selected], fullMode)
      onSyncStarted(data.job_id)
    } catch (err) {
      setStartError(err.message || 'Failed to start sync')
    } finally {
      setIsStarting(false)
    }
  }

  const allSelected  = selected.size === ENTITIES.length
  const noneSelected = selected.size === 0
  const btnDisabled  = isRunning || noneSelected || isStarting

  return (
    <div className={styles.card}>
      <p className={styles.title}>Sync Data</p>
      <p className={styles.subtitle}>Choose which data to fetch from Monarch Money</p>

      <button
        className={styles.selectAll}
        onClick={() =>
          allSelected
            ? setSelected(new Set())
            : setSelected(new Set(ENTITIES.map(e => e.key)))
        }
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>

      {ENTITIES.map((e) => {
        const log = lastStatus[e.key]
        return (
          <div
            key={e.key}
            className={styles.entityRow}
            onClick={() => toggle(e.key)}
          >
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selected.has(e.key)}
              onChange={() => toggle(e.key)}
              onClick={ev => ev.stopPropagation()}
            />
            <div className={styles.entityInfo}>
              <div className={styles.entityLabel}>{e.label}</div>
              <div className={styles.entityDesc}>{e.desc}</div>
            </div>
            <div className={styles.lastSync}>
              {log ? (
                <>
                  <div>{fmtDatetime(log.last_synced_at)}</div>
                  <div style={{ color: 'var(--text-faint)' }}>{log.total_records?.toLocaleString()} rows</div>
                </>
              ) : (
                <span style={{ color: 'var(--text-faint)' }}>Never synced</span>
              )}
            </div>
          </div>
        )
      })}

      <div className={styles.divider} />

      <div className={styles.modeRow}>
        <span className={styles.modeLabel}>Mode:</span>
        <div className={styles.modeToggle}>
          {/* Button colors are data-driven (active state) */}
          <button
            className={styles.modeBtn}
            style={{
              background: !fullMode ? 'var(--color-accent)' : 'transparent',
              color:      !fullMode ? '#fff'                : 'var(--text-muted)',
            }}
            onClick={() => setFullMode(false)}
          >
            Incremental
          </button>
          <button
            className={styles.modeBtn}
            style={{
              background: fullMode ? 'var(--color-accent)' : 'transparent',
              color:      fullMode ? '#fff'               : 'var(--text-muted)',
            }}
            onClick={() => setFullMode(true)}
          >
            Full Refresh
          </button>
        </div>
        <span className={styles.modeHint}>
          {fullMode ? 'Re-fetches all historical data' : 'Only fetches new data since last sync'}
        </span>
      </div>

      {loadError && (
        <div className={styles.errorMsg}>{loadError}</div>
      )}

      {startError && (
        <div className={styles.errorMsg}>{startError}</div>
      )}

      {/* Start button colors are data-driven */}
      <button
        className={styles.startBtn}
        style={{
          background: btnDisabled ? 'var(--border-sub)'   : 'var(--color-accent)',
          color:      btnDisabled ? 'var(--text-faint)' : '#fff',
          cursor:     btnDisabled ? 'not-allowed' : 'pointer',
        }}
        disabled={btnDisabled}
        onClick={handleStart}
      >
        {isRunning ? '⟳ Sync in progress…' : isStarting ? 'Starting…' : '▶ Start Sync'}
      </button>
    </div>
  )
}
