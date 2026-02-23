/**
 * SyncHistory — table of the last 10 sync runs.
 * Clicking a row makes it the "active" job shown in SyncJobStatus.
 */
import styles from "./SyncHistory.module.css"

function fmtDate(iso) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    })
  } catch { return iso }
}

function duration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return "—"
  const secs = Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function totalRecords(results) {
  if (!results) return "—"
  const total = Object.values(results).reduce((sum, r) => sum + (r.count || 0), 0)
  return total.toLocaleString()
}

const STATUS_COLOR = {
  success: "#34d399",
  partial: "#f59e0b",
  failed:  "#f87171",
  running: "#f59e0b",
}

const STATUS_ICON = {
  success: "✓",
  partial: "⚠",
  failed:  "✗",
  running: "⟳",
}

const ENTITY_SHORT = {
  accounts:        "Accounts",
  account_history: "History",
  categories:      "Categories",
  transactions:    "Transactions",
  budgets:         "Budgets",
}

export default function SyncHistory({ history, activeJobId, onSelectJob }) {
  if (!history || history.length === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.title}>Sync History</p>
        <div className={styles.emptyState}>No sync runs recorded yet.</div>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <p className={styles.title}>Sync History</p>
      {/* Horizontal scroll wrapper for mobile */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Started</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Mode</th>
              <th className={styles.th}>Entities</th>
              <th className={`${styles.th} ${styles.thRight}`}>Records</th>
              <th className={`${styles.th} ${styles.thRight}`}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {history.map(job => {
              const isActive = job.id === activeJobId
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  style={{ cursor: "pointer" }}
                >
                  <td className={`${styles.td} ${isActive ? styles.tdActive : ''}`} title={job.started_at}>
                    {fmtDate(job.started_at)}
                  </td>
                  <td className={`${styles.td} ${isActive ? styles.tdActive : ''}`}>
                    {/* statusCell color is data-driven */}
                    <span
                      className={styles.statusCell}
                      style={{ color: STATUS_COLOR[job.status] || "#64748b" }}
                    >
                      {STATUS_ICON[job.status] || "?"} {job.status}
                    </span>
                  </td>
                  <td className={`${styles.td} ${isActive ? styles.tdActive : ''}`}>
                    <span style={{ color: job.full_refresh ? "#6366f1" : "#475569" }}>
                      {job.full_refresh ? "Full" : "Incremental"}
                    </span>
                  </td>
                  <td className={`${styles.td} ${isActive ? styles.tdActive : ''}`}>
                    {(job.entities || []).map(e => (
                      <span key={e} className={styles.entityPill}>
                        {ENTITY_SHORT[e] || e}
                      </span>
                    ))}
                  </td>
                  <td className={`${styles.td} ${styles.tdRight} ${isActive ? styles.tdActive : ''}`}>
                    {totalRecords(job.results)}
                  </td>
                  <td className={`${styles.td} ${styles.tdRight} ${isActive ? styles.tdActive : ''}`}>
                    {job.status === "running"
                      ? <span style={{ color: "#f59e0b" }}>running…</span>
                      : duration(job.started_at, job.finished_at)
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
