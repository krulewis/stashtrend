/**
 * SyncHistory — table of the last 10 sync runs.
 * Clicking a row makes it the "active" job shown in SyncJobStatus.
 */
import styles from './SyncHistory.module.css'
import { fmtDatetime, durationFinal } from './chartUtils.jsx'
import { SYNC_ENTITY_SHORT, SYNC_STATUS_ICON } from '../constants/syncEntities.js'

function totalRecords(results) {
  if (!results) return '—'
  const total = Object.values(results).reduce((sum, r) => sum + (r.count || 0), 0)
  return total.toLocaleString()
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
              const td = (extra = '') => [styles.td, isActive && styles.tdActive, extra].filter(Boolean).join(' ')
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={td()} title={job.started_at}>
                    {fmtDatetime(job.started_at)}
                  </td>
                  <td className={td()}>
                    {/* statusCell color is data-driven */}
                    <span
                      className={styles.statusCell}
                      style={{ color: SYNC_STATUS_ICON[job.status]?.color || 'var(--text-muted)' }}
                    >
                      {SYNC_STATUS_ICON[job.status]?.icon || '?'} {job.status}
                    </span>
                  </td>
                  <td className={td()}>
                    <span style={{ color: job.full_refresh ? 'var(--color-accent)' : 'var(--text-faint)' }}>
                      {job.full_refresh ? 'Full' : 'Incremental'}
                    </span>
                  </td>
                  <td className={td()}>
                    {(job.entities || []).map(e => (
                      <span key={e} className={styles.entityPill}>
                        {SYNC_ENTITY_SHORT[e] || e}
                      </span>
                    ))}
                  </td>
                  <td className={td(styles.tdRight)}>
                    {totalRecords(job.results)}
                  </td>
                  <td className={td(styles.tdRight)}>
                    {job.status === 'running'
                      ? <span style={{ color: 'var(--amber)' }}>running…</span>
                      : durationFinal(job.started_at, job.finished_at)
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
