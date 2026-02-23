/**
 * SyncControl — entity checkboxes, mode toggle, and Start Sync button.
 * Shows when each entity was last synced from the pipeline's sync_log.
 */
import { useEffect, useState } from "react"
import styles from "./SyncControl.module.css"

const ENTITIES = [
  { key: "accounts",        label: "Accounts",        desc: "Account names, balances, and metadata" },
  { key: "account_history", label: "Account History",  desc: "Daily balance snapshots for all accounts" },
  { key: "categories",      label: "Categories",       desc: "Transaction category definitions" },
  { key: "transactions",    label: "Transactions",     desc: "Individual transaction records" },
  { key: "budgets",         label: "Budgets",          desc: "Monthly budget vs. actual data" },
]

function fmtDate(iso) {
  if (!iso) return "Never"
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function SyncControl({ isRunning, onSyncStarted }) {
  const [selected,   setSelected]   = useState(new Set(ENTITIES.map(e => e.key)))
  const [fullMode,   setFullMode]   = useState(false)
  const [lastStatus, setLastStatus] = useState({})
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    fetch("/api/sync/last-status")
      .then(r => r.json())
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.entity] = r })
        setLastStatus(map)
      })
      .catch(() => {})
  }, [isRunning])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleStart() {
    if (isRunning || selected.size === 0 || loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/sync/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: [...selected], full: fullMode }),
      })
      const data = await res.json()
      if (res.ok) {
        onSyncStarted(data.job_id)
      } else {
        alert(data.error || "Failed to start sync")
      }
    } catch {
      alert("Could not reach the backend")
    } finally {
      setLoading(false)
    }
  }

  const allSelected  = selected.size === ENTITIES.length
  const noneSelected = selected.size === 0
  const btnDisabled  = isRunning || noneSelected || loading

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
        {allSelected ? "Deselect all" : "Select all"}
      </button>

      {ENTITIES.map((e, i) => {
        const log    = lastStatus[e.key]
        const isLast = i === ENTITIES.length - 1
        return (
          <div
            key={e.key}
            className={`${styles.entityRow} ${isLast ? styles.entityRowLast : ''}`}
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
                  <div>{fmtDate(log.last_synced_at)}</div>
                  <div style={{ color: "#334155" }}>{log.total_records?.toLocaleString()} rows</div>
                </>
              ) : (
                <span style={{ color: "#334155" }}>Never synced</span>
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
              background: !fullMode ? "#6366f1" : "transparent",
              color:      !fullMode ? "#fff"    : "#64748b",
            }}
            onClick={() => setFullMode(false)}
          >
            Incremental
          </button>
          <button
            className={styles.modeBtn}
            style={{
              background: fullMode ? "#6366f1" : "transparent",
              color:      fullMode ? "#fff"    : "#64748b",
            }}
            onClick={() => setFullMode(true)}
          >
            Full Refresh
          </button>
        </div>
        <span className={styles.modeHint}>
          {fullMode ? "Re-fetches all historical data" : "Only fetches new data since last sync"}
        </span>
      </div>

      {/* Start button colors are data-driven */}
      <button
        className={styles.startBtn}
        style={{
          background: btnDisabled ? "#1e2535" : "#6366f1",
          color:      btnDisabled ? "#475569" : "#fff",
          cursor:     btnDisabled ? "not-allowed" : "pointer",
        }}
        disabled={btnDisabled}
        onClick={handleStart}
      >
        {isRunning ? "⟳ Sync in progress…" : loading ? "Starting…" : "▶ Start Sync"}
      </button>
    </div>
  )
}
