/**
 * SyncPage — orchestrates the full sync UI.
 *
 * Layout:
 *   [ SyncControl (left) ] [ SyncJobStatus (right) ]
 *   [       Auto Sync settings (full width)         ]
 *   [         SyncHistory (full width, below)       ]
 *
 * Polling: while a job is running, polls /api/sync/status/:id every 2 seconds.
 * History: refreshed after every job completion and on mount.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import SyncControl   from "../components/SyncControl"
import SyncJobStatus from "../components/SyncJobStatus"
import SyncHistory   from "../components/SyncHistory"
import styles from "./SyncPage.module.css"

const POLL_INTERVAL_MS = 2000

const INTERVAL_OPTIONS = [
  { value: 0,  label: "Disabled" },
  { value: 1,  label: "Every 1 hour" },
  { value: 2,  label: "Every 2 hours" },
  { value: 4,  label: "Every 4 hours" },
  { value: 6,  label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Every 24 hours" },
]

export default function SyncPage() {
  const [currentJob, setCurrentJob]         = useState(null)   // full job object being polled
  const [history, setHistory]               = useState([])
  const [isRunning, setIsRunning]           = useState(false)
  const [syncInterval, setSyncInterval]     = useState(0)
  const [savingInterval, setSavingInterval] = useState(false)
  const pollRef = useRef(null)

  // ── History ──────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetch("/api/sync/history")
      const data = await res.json()
      setHistory(data)
      // If the most recent job is still running, resume polling
      if (data.length > 0 && data[0].status === "running") {
        setCurrentJob(data[0])
        setIsRunning(true)
        startPolling(data[0].id)
      }
    } catch (err) {
      console.error("Failed to load sync history", err)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadHistory()
    return () => stopPolling()
  }, [loadHistory])

  // ── Settings ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => setSyncInterval(data.sync_interval_hours ?? 0))
      .catch(() => {})
  }, [])

  // ── Polling ───────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling(jobId) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/status/${jobId}`)
        const job = await res.json()
        setCurrentJob(job)

        if (job.status !== "running") {
          // Job finished — stop polling and refresh history
          stopPolling()
          setIsRunning(false)
          loadHistory()
        }
      } catch (err) {
        console.error("Polling error", err)
      }
    }, POLL_INTERVAL_MS)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSyncStarted(jobId) {
    setIsRunning(true)
    // Immediately show a skeleton job row while we wait for the first poll
    setCurrentJob({ id: jobId, status: "running", started_at: new Date().toISOString(), entities: [], results: {} })
    startPolling(jobId)
    loadHistory()
  }

  function handleSelectHistoryJob(job) {
    setCurrentJob(job)
  }

  async function handleIntervalChange(e) {
    const val = parseInt(e.target.value, 10)
    setSyncInterval(val)
    setSavingInterval(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_interval_hours: val }),
      })
    } catch {
      // Optimistic update stays — backend will reconcile on next load
    } finally {
      setSavingInterval(false)
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <SyncControl
          isRunning={isRunning}
          onSyncStarted={handleSyncStarted}
        />
        <SyncJobStatus
          job={currentJob}
          isRunning={isRunning}
        />
      </div>

      <div className={styles.settingsRow}>
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
              disabled={savingInterval}
              aria-label="Sync interval"
            >
              {INTERVAL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <SyncHistory
        history={history}
        activeJobId={currentJob?.id}
        onSelectJob={handleSelectHistoryJob}
      />
    </div>
  )
}
