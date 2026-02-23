/**
 * SyncPage — orchestrates the full sync UI.
 *
 * Layout:
 *   [ SyncControl (left) ] [ SyncJobStatus (right) ]
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

export default function SyncPage() {
  const [currentJob, setCurrentJob] = useState(null)   // full job object being polled
  const [history, setHistory]       = useState([])
  const [isRunning, setIsRunning]   = useState(false)
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

      <SyncHistory
        history={history}
        activeJobId={currentJob?.id}
        onSelectJob={handleSelectHistoryJob}
      />
    </div>
  )
}
