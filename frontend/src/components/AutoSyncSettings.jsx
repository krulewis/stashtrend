/**
 * AutoSyncSettings — self-contained card for the auto-sync schedule setting.
 * Manages its own state and persists changes to /api/settings.
 */
import { useEffect, useState } from 'react'
import { fetchSettings, saveSettings } from '../api.js'
import styles from './AutoSyncSettings.module.css'

const INTERVAL_OPTIONS = [
  { value: 0,  label: 'Disabled' },
  { value: 1,  label: 'Every 1 hour' },
  { value: 2,  label: 'Every 2 hours' },
  { value: 4,  label: 'Every 4 hours' },
  { value: 6,  label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every 24 hours' },
]

export default function AutoSyncSettings() {
  const [syncInterval,   setSyncInterval]   = useState(0)
  const [saving,         setSaving]         = useState(false)
  const [settingsError,  setSettingsError]  = useState(null)

  useEffect(() => {
    fetchSettings()
      .then(data => setSyncInterval(data.sync_interval_hours ?? 0))
      .catch(() => setSettingsError('Could not load sync settings'))
  }, [])

  async function handleIntervalChange(e) {
    const val = parseInt(e.target.value, 10)
    const prev = syncInterval
    setSyncInterval(val)
    setSaving(true)
    setSettingsError(null)
    try {
      await saveSettings({ sync_interval_hours: val })
    } catch (err) {
      setSyncInterval(prev)
      setSettingsError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.settingsCard}>
      <p className={styles.settingsTitle}>Auto Sync</p>
      <p className={styles.settingsSubtitle}>
        Automatically sync all data from Monarch Money on a repeating schedule.
      </p>
      <div className={styles.intervalRow}>
        <label htmlFor="sync-interval" className={styles.intervalLabel}>
          Sync interval
        </label>
        <select
          id="sync-interval"
          className={styles.intervalSelect}
          value={syncInterval}
          onChange={handleIntervalChange}
          disabled={saving}
          aria-label="Sync interval"
        >
          {INTERVAL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {settingsError && (
        <div className={styles.settingsError}>{settingsError}</div>
      )}
    </div>
  )
}
