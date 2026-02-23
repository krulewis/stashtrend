/**
 * SyncJobStatus — live progress panel for the current or most recent sync job.
 * Polls /api/sync/status/:id every 2 seconds while status === 'running'.
 * Shows per-entity status, counts, new-record deltas, and error details.
 */
import styles from "./SyncJobStatus.module.css"

const ENTITY_ORDER = [
  "accounts",
  "account_history",
  "categories",
  "transactions",
  "budgets",
]

const ENTITY_LABELS = {
  accounts:        "Accounts",
  account_history: "Account History",
  categories:      "Categories",
  transactions:    "Transactions",
  budgets:         "Budgets",
}

function fmtDateTime(iso) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit",
    })
  } catch { return iso }
}

function duration(startedAt, finishedAt) {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end   = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const secs  = Math.round((end - start) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

const STATUS_ICON = {
  pending: { icon: "●", color: "#475569" },
  running: { icon: "⟳", color: "#f59e0b" },
  success: { icon: "✓", color: "#34d399" },
  partial: { icon: "⚠", color: "#f59e0b" },
  failed:  { icon: "✗", color: "#f87171" },
}

function jobOverallColor(status) {
  return STATUS_ICON[status]?.color || "#64748b"
}

export default function SyncJobStatus({ job, isRunning }) {
  if (!job) {
    return (
      <div className={styles.card}>
        <p className={styles.title}>Sync Status</p>
        <div className={styles.emptyState}>
          No sync has been run yet.<br />
          <span style={{ fontSize: 12, color: "#334155" }}>
            Select entities and click Start Sync to begin.
          </span>
        </div>
      </div>
    )
  }

  const entities    = job.entities || []
  const results     = job.results  || {}
  const status      = job.status

  // Build a row for each entity in canonical order, showing only the ones
  // selected for this job, plus pending for those not yet reached.
  const rows = ENTITY_ORDER.filter(e => entities.includes(e)).map(e => {
    const r = results[e]
    if (!r) {
      // Not yet started — determine if it's actively next or just pending
      const entityStatus = isRunning ? "pending" : "pending"
      return { key: e, entityStatus, count: null, newCount: null, error: null }
    }
    return {
      key:         e,
      entityStatus: r.status,
      count:       r.count,
      newCount:    r.new,
      error:       r.error,
    }
  })

  // Mark the first pending entity as "running" if the job is still running
  if (isRunning) {
    const firstPending = rows.find(r => r.entityStatus === "pending")
    if (firstPending) firstPending.entityStatus = "running"
  }

  const badgeColor = jobOverallColor(status)

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Sync Status</p>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>Started: {fmtDateTime(job.started_at)}</span>
            {job.finished_at && (
              <span className={styles.metaItem}>
                Duration: {duration(job.started_at, job.finished_at)}
              </span>
            )}
            {isRunning && (
              <span className={styles.metaItem} style={{ color: "#f59e0b" }}>
                ⟳ {duration(job.started_at, null)} elapsed
              </span>
            )}
          </div>
        </div>
        {/* statusBadge background/color/border are data-driven */}
        <div
          className={styles.statusBadge}
          style={{
            background: `${badgeColor}22`,
            color: badgeColor,
            border: `1px solid ${badgeColor}44`,
          }}
        >
          {STATUS_ICON[status]?.icon} {status}
        </div>
      </div>

      <div className={styles.entityList}>
        {rows.map(row => (
          <div key={row.key} className={styles.entityRow}>
            {/* entityIcon color/animation are data-driven */}
            <div
              className={styles.entityIcon}
              style={{
                color: STATUS_ICON[row.entityStatus]?.color || "#64748b",
                animation: row.entityStatus === "running" ? "spin 1.2s linear infinite" : "none",
              }}
            >
              {STATUS_ICON[row.entityStatus]?.icon || "●"}
            </div>
            <div style={{ flex: 1 }}>
              <div className={styles.entityName}>{ENTITY_LABELS[row.key] || row.key}</div>
              {row.error && (
                <div className={styles.entityError}>{row.error}</div>
              )}
            </div>
            {row.count !== null && (
              <div className={styles.entityCount}>
                <div>{row.count.toLocaleString()} synced</div>
                {row.newCount > 0 && (
                  <div className={styles.entityNew}>+{row.newCount.toLocaleString()} new</div>
                )}
                {row.newCount === 0 && row.entityStatus === "success" && (
                  <div className={styles.entityNew} style={{ color: "#475569" }}>no new records</div>
                )}
              </div>
            )}
            {row.count === null && row.entityStatus !== "running" && (
              <div className={styles.entityCount} style={{ color: "#334155" }}>pending</div>
            )}
            {row.entityStatus === "running" && (
              <div className={styles.entityCount} style={{ color: "#f59e0b" }}>syncing…</div>
            )}
          </div>
        ))}
      </div>

      {job.error && (
        <div className={styles.errorBox}>
          <strong>Error:</strong> {job.error}
        </div>
      )}

      {/* Spin animation for running icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
