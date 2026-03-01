import { useState } from 'react'
import styles from './GroupSnapshotControls.module.css'

/**
 * Controls bar for GroupsSnapshot: group selection chips, saved config pills,
 * and a save-current-selection form.
 *
 * All state lives in GroupsPage — this component is purely presentational.
 */
export default function GroupSnapshotControls({
  groups,
  selectedGroupIds,   // Set<id> | null  (null = all groups shown)
  configs,
  activeConfigId,
  conflictMap,
  onGroupToggle,
  onSelectConfig,
  onSaveConfig,
  onDeleteConfig,
}) {
  const [saving, setSaving]   = useState(false)
  const [saveName, setSaveName] = useState('')

  const isSelected = (groupId) => selectedGroupIds.has(groupId)

  const isBlocked = (groupId) => {
    if (selectedGroupIds.has(groupId)) return false // always allow deselecting
    const conflicts = conflictMap[groupId] ?? new Set()
    for (const cid of conflicts) {
      if (selectedGroupIds.has(cid)) return true
    }
    return false
  }

  const conflictingNames = (groupId) => {
    const conflicts = conflictMap[groupId] ?? new Set()
    return groups
      .filter((g) => conflicts.has(g.id) && selectedGroupIds.has(g.id))
      .map((g) => g.name)
  }

  const handleSaveSubmit = (e) => {
    e.preventDefault()
    const name = saveName.trim()
    if (!name) return
    onSaveConfig(name)
    setSaveName('')
    setSaving(false)
  }

  return (
    <div className={styles.controls}>
      {/* Group selection chips */}
      <div className={styles.chipsRow}>
        {groups.map((g) => {
          const blocked  = isBlocked(g.id)
          const selected = isSelected(g.id)
          const names    = blocked ? conflictingNames(g.id) : []
          return (
            <button
              key={g.id}
              role="button"
              aria-pressed={String(selected)}
              disabled={blocked}
              title={blocked ? `Shares accounts with: ${names.join(', ')}` : undefined}
              className={`${styles.chip} ${selected ? styles.chipActive : ''} ${blocked ? styles.chipBlocked : ''}`}
              onClick={() => !blocked && onGroupToggle(g.id)}
            >
              <span className={styles.chipDot} style={{ background: g.color }} />
              {g.name}
              {selected && <span className={styles.chipX} aria-hidden="true">×</span>}
            </button>
          )
        })}
      </div>

      {/* Saved config pills + save button */}
      <div className={styles.configsRow}>
        {configs.map((cfg) => (
          <button
            key={cfg.id}
            data-testid="config-pill"
            aria-pressed={String(cfg.id === activeConfigId)}
            className={`${styles.configPill} ${cfg.id === activeConfigId ? styles.configPillActive : ''}`}
            onClick={() => onSelectConfig(cfg)}
          >
            {cfg.name}
          </button>
        ))}

        {saving ? (
          <form className={styles.saveForm} onSubmit={handleSaveSubmit}>
            <input
              autoFocus
              className={styles.saveInput}
              placeholder="Name this view…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button type="submit" className={styles.saveConfirm}>Save</button>
            <button type="button" className={styles.saveCancel} onClick={() => setSaving(false)}>Cancel</button>
          </form>
        ) : (
          <button className={styles.saveBtn} onClick={() => setSaving(true)}>
            Save view
          </button>
        )}
      </div>
    </div>
  )
}
