import styles from './SyncJobStatus.module.css'
import { fmtDatetimeSecs, durationElapsed, durationFinal } from './chartUtils.jsx'
import { SYNC_ENTITY_ORDER, SYNC_ENTITY_LABELS, SYNC_STATUS_ICON } from '../constants/syncEntities.js'

function jobOverallColor(status) {
  return SYNC_STATUS_ICON[status]?.color || 'var(--text-muted)'
}

export default function SyncJobStatus({ job, isRunning }) {
  if (!job) {
    return (
      <div className={styles.card}>
        <p className={styles.title}>Sync Status</p>
        <div className={styles.emptyState}>
          {isRunning ? (
            <span style={{ color: 'var(--amber)' }}>⟳ Sync starting…</span>
          ) : (
            <>
              No sync has been run yet.<br />
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Select entities and click Start Sync to begin.
              </span>
            </>
          )}
        </div>
      </div>
    )
  }

  const entities    = job.entities || []
  const results     = job.results  || {}
  const status      = job.status

  // Build rows in canonical order. When isRunning, the first pending entity
  // is shown as 'running' (the one actively being fetched).
  const pendingEntities = SYNC_ENTITY_ORDER.filter(e => entities.includes(e) && !results[e])
  const firstRunningKey = isRunning ? (pendingEntities[0] ?? null) : null

  const rows = SYNC_ENTITY_ORDER.filter(e => entities.includes(e)).map(e => {
    const r = results[e]
    if (!r) {
      return { key: e, entityStatus: e === firstRunningKey ? 'running' : 'pending', recordCount: null, newRecordCount: null, error: null }
    }
    return {
      key:            e,
      entityStatus:   r.status,
      recordCount:    r.count,
      newRecordCount: r.new,
      error:          r.error,
    }
  })

  const badgeColor = jobOverallColor(status)

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Sync Status</p>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>Started: {fmtDatetimeSecs(job.started_at)}</span>
            {job.finished_at && (
              <span className={styles.metaItem}>
                Duration: {durationFinal(job.started_at, job.finished_at)}
              </span>
            )}
            {isRunning && (
              <span className={styles.metaItem} style={{ color: 'var(--amber)' }}>
                ⟳ {durationElapsed(job.started_at, null)} elapsed
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
          {SYNC_STATUS_ICON[status]?.icon} {status}
        </div>
      </div>

      <div className={styles.entityList}>
        {rows.map(row => (
          <div key={row.key} className={styles.entityRow}>
            {/* entityIcon color/animation are data-driven */}
            <div
              className={styles.entityIcon}
              style={{
                color: SYNC_STATUS_ICON[row.entityStatus]?.color || 'var(--text-muted)',
                animation: row.entityStatus === 'running' ? 'spin 1.2s linear infinite' : 'none',
              }}
            >
              {SYNC_STATUS_ICON[row.entityStatus]?.icon || '●'}
            </div>
            <div style={{ flex: 1 }}>
              <div className={styles.entityName}>{SYNC_ENTITY_LABELS[row.key] || row.key}</div>
              {row.error && (
                <div className={styles.entityError}>{row.error}</div>
              )}
            </div>
            {row.entityStatus === 'running' ? (
              <div className={styles.entityCount} style={{ color: 'var(--amber)' }}>syncing…</div>
            ) : row.recordCount !== null ? (
              <div className={styles.entityCount}>
                <div>{row.recordCount.toLocaleString()} synced</div>
                {row.newRecordCount > 0 && (
                  <div className={styles.entityNew}>+{row.newRecordCount.toLocaleString()} new</div>
                )}
                {row.newRecordCount === 0 && row.entityStatus === 'success' && (
                  <div className={styles.entityNew} style={{ color: 'var(--text-faint)' }}>no new records</div>
                )}
              </div>
            ) : (
              <div className={styles.entityCount} style={{ color: 'var(--text-faint)' }}>pending</div>
            )}
          </div>
        ))}
      </div>

      {job.error && (
        <div className={styles.errorBox}>
          <strong>Error:</strong> {job.error}
        </div>
      )}

    </div>
  )
}
