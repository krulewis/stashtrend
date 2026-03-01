/**
 * SyncPage — orchestrates the sync UI.
 * Uses a ref (loadHistoryRef) to break the loadHistory↔startPolling circular
 * useCallback dependency — startPolling calls loadHistory via ref at job completion.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import SyncControl      from '../components/SyncControl.jsx'
import SyncJobStatus    from '../components/SyncJobStatus.jsx'
import SyncHistory      from '../components/SyncHistory.jsx'
import AutoSyncSettings from '../components/AutoSyncSettings.jsx'
import styles from './SyncPage.module.css'
import { fetchSyncHistory, fetchSyncStatus } from '../api.js'

const POLL_INTERVAL_MS = 2000

export default function SyncPage() {
  const [displayedJob,  setDisplayedJob]  = useState(null)   // job shown in SyncJobStatus (live or selected from history)
  const [history,       setHistory]       = useState([])
  const [isRunning,     setIsRunning]     = useState(false)
  const [historyError,  setHistoryError]  = useState(null)
  const [pollError,     setPollError]     = useState(null)
  const pollRef        = useRef(null)
  const loadHistoryRef = useRef(null)  // ref to break loadHistory↔startPolling circular dep

  // ── Polling ───────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // startPolling calls loadHistory via ref so it has no closure deps that
  // change over time — this keeps loadHistory's dep array honest.
  const startPolling = useCallback((jobId) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const job = await fetchSyncStatus(jobId)
        setDisplayedJob(job)

        if (job.status !== 'running') {
          // Job finished — stop polling and refresh history
          stopPolling()
          setIsRunning(false)
          loadHistoryRef.current?.()
        }
      } catch (err) {
        console.error('Polling error', err)
        setPollError('Lost connection to server — sync status may be stale')
      }
    }, POLL_INTERVAL_MS)
  }, [])  // stable: only reads pollRef (ref) and stable state setters

  // ── History ──────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchSyncHistory()
      setHistory(data)
      setHistoryError(null)
      // If the most recent job is still running, resume polling (only if not already polling)
      if (data.length > 0 && data[0].status === 'running' && !pollRef.current) {
        setDisplayedJob(data[0])
        setIsRunning(true)
        startPolling(data[0].id)
      }
    } catch (err) {
      setHistoryError('Failed to load sync history')
    }
  }, [startPolling])

  // Keep the ref in sync with the latest loadHistory instance
  useEffect(() => { loadHistoryRef.current = loadHistory }, [loadHistory])

  useEffect(() => {
    loadHistory()
    return () => stopPolling()
  }, [loadHistory])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSyncStarted(jobId) {
    setIsRunning(true)
    setDisplayedJob(null)
    startPolling(jobId)
    loadHistory()
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {historyError && (
        <div className={styles.historyError}>{historyError}</div>
      )}
      {pollError && (
        <div className={styles.historyError}>{pollError}</div>
      )}
      <div className={styles.topRow}>
        <SyncControl
          isRunning={isRunning}
          onSyncStarted={handleSyncStarted}
        />
        <SyncJobStatus
          job={displayedJob}
          isRunning={isRunning}
        />
      </div>

      <div className={styles.settingsRow}>
        <AutoSyncSettings />
      </div>

      <SyncHistory
        history={history}
        activeJobId={displayedJob?.id}
        onSelectJob={setDisplayedJob}
      />
    </div>
  )
}
