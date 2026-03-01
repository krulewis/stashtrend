import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import SyncPage from './SyncPage.jsx'
import {
  MOCK_SYNC_HISTORY,
  MOCK_SYNC_LAST_STATUS,
  MOCK_SETTINGS,
  mockFetch,
} from '../test/fixtures.js'

const RUNNING_JOB = {
  id: 'job-running',
  status: 'running',
  started_at: '2026-02-23T10:00:00Z',
  finished_at: null,
  entities: ['accounts'],
  results: {},
}

const COMPLETED_JOB = {
  ...RUNNING_JOB,
  status: 'success',
  finished_at: '2026-02-23T10:01:00Z',
  results: { accounts: { status: 'success', count: 67, new: 0 } },
}

// ── Default mock routes used by most tests ──────────────────────────────────

function setupDefaultMocks(settingsOverride = MOCK_SETTINGS) {
  mockFetch({
    '/api/sync/history':     MOCK_SYNC_HISTORY,
    '/api/sync/last-status': MOCK_SYNC_LAST_STATUS,
    '/api/sync/start':       { job_id: 'job-new' },
    '/api/settings':         settingsOverride,
  })
}

describe('SyncPage — existing panels', () => {
  beforeEach(() => {
    setupDefaultMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Sync Data control panel title', async () => {
    render(<SyncPage />)
    expect(screen.getByText('Sync Data')).toBeInTheDocument()
  })

  it('renders the Sync Status panel', async () => {
    render(<SyncPage />)
    expect(screen.getByText('Sync Status')).toBeInTheDocument()
  })

  it('renders the Sync History panel', async () => {
    render(<SyncPage />)
    expect(screen.getByText('Sync History')).toBeInTheDocument()
  })

  it('fetches sync history on mount', async () => {
    render(<SyncPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/sync/history')
    })
  })

  it('renders history rows after loading', async () => {
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/success/)).toBeInTheDocument()
    })
  })

  it('shows empty status panel before any sync has run (no history)', async () => {
    mockFetch({
      '/api/sync/history':     [],
      '/api/sync/last-status': [],
      '/api/settings':         MOCK_SETTINGS,
    })
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/No sync has been run yet/)).toBeInTheDocument()
    })
  })

  it('shows an error message when sync history fails to load', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/sync/history')) return Promise.reject(new Error('Network error'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        url.includes('/api/settings') ? MOCK_SETTINGS : MOCK_SYNC_LAST_STATUS
      )})
    })
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })
})

describe('SyncPage — Auto Sync settings panel', () => {
  beforeEach(() => {
    setupDefaultMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Auto Sync section heading', async () => {
    render(<SyncPage />)
    expect(screen.getByText('Auto Sync')).toBeInTheDocument()
  })

  it('renders the interval dropdown', async () => {
    render(<SyncPage />)
    expect(screen.getByRole('combobox', { name: /sync interval/i })).toBeInTheDocument()
  })

  it('fetches current settings on mount', async () => {
    render(<SyncPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/settings')
    })
  })

  it('shows "Disabled" option when interval is 0', async () => {
    render(<SyncPage />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /sync interval/i })
      expect(select.value).toBe('0')
    })
  })

  it('shows stored interval when API returns non-zero value', async () => {
    setupDefaultMocks({ sync_interval_hours: 6 })
    render(<SyncPage />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /sync interval/i })
      expect(select.value).toBe('6')
    })
  })

  it('renders all expected interval options including Disabled', async () => {
    render(<SyncPage />)
    const select = screen.getByRole('combobox', { name: /sync interval/i })
    const values = Array.from(select.options).map(o => parseInt(o.value))
    expect(values).toContain(0)   // Disabled
    expect(values).toContain(1)
    expect(values).toContain(6)
    expect(values).toContain(12)
    expect(values).toContain(24)
  })

  it('POSTs new interval when dropdown changes', async () => {
    render(<SyncPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/settings')
    })

    const select = screen.getByRole('combobox', { name: /sync interval/i })
    fireEvent.change(select, { target: { value: '6' } })

    await waitFor(() => {
      const calls = global.fetch.mock.calls
      const postCall = calls.find(
        ([url, opts]) => url === '/api/settings' && opts?.method === 'POST'
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall[1].body)
      expect(body.sync_interval_hours).toBe(6)
    })
  })

  it('updates dropdown to reflect new selection after change', async () => {
    render(<SyncPage />)
    const select = screen.getByRole('combobox', { name: /sync interval/i })
    fireEvent.change(select, { target: { value: '12' } })
    expect(select.value).toBe('12')
  })
})

describe('SyncPage — polling lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts polling automatically when history has a running job on mount', async () => {
    mockFetch({
      '/api/sync/history':            [RUNNING_JOB],
      '/api/sync/last-status':        MOCK_SYNC_LAST_STATUS,
      '/api/settings':                MOCK_SETTINGS,
      '/api/sync/status/job-running': RUNNING_JOB,
    })
    render(<SyncPage />)

    // Flush initial async effects (history + settings fetches)
    await act(async () => {})

    // Advance past the 2-second poll interval to trigger first poll
    await act(async () => { vi.advanceTimersByTime(2100) })

    const statusCalls = global.fetch.mock.calls.filter(([url]) =>
      url.includes('/api/sync/status/job-running')
    )
    expect(statusCalls.length).toBeGreaterThan(0)
  })

  it('stops polling and refreshes history when job completes', async () => {
    let pollCount = 0
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/sync/history')) {
        // First call: running job; subsequent calls: completed history
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
          pollCount === 0 ? [RUNNING_JOB] : [COMPLETED_JOB]
        )})
      }
      if (url.includes('/api/sync/status/job-running')) {
        pollCount++
        // First poll: still running; second poll: completed
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
          pollCount === 1 ? RUNNING_JOB : COMPLETED_JOB
        )})
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        url.includes('/api/settings') ? MOCK_SETTINGS : MOCK_SYNC_LAST_STATUS
      )})
    })

    render(<SyncPage />)

    // Flush initial history fetch (returns RUNNING_JOB, starts polling)
    await act(async () => {})
    // First poll — still running
    await act(async () => { vi.advanceTimersByTime(2100) })
    // Second poll — job completes, stopPolling() is called
    await act(async () => { vi.advanceTimersByTime(2100) })

    // After completion, isRunning=false so Start Sync button is enabled
    const startBtn = screen.getByRole('button', { name: /start sync/i })
    expect(startBtn).not.toBeDisabled()
  })

  it('handleSyncStarted sets isRunning and disables the Start Sync button', async () => {
    mockFetch({
      '/api/sync/history':         [],
      '/api/sync/last-status':     MOCK_SYNC_LAST_STATUS,
      '/api/sync/start':           { job_id: 'job-new' },
      '/api/settings':             MOCK_SETTINGS,
      '/api/sync/status/job-new':  RUNNING_JOB,
    })
    render(<SyncPage />)

    // Flush mount effects
    await act(async () => {})

    const startBtn = screen.getByRole('button', { name: /start sync/i })
    fireEvent.click(startBtn)

    // Flush the fetch('/api/sync/start') promise
    await act(async () => {})

    // After sync starts, button shows running state (disabled)
    expect(screen.getByText(/sync in progress/i)).toBeInTheDocument()
  })

  it('handles polling network errors gracefully without crashing', async () => {
    let statusCallCount = 0
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/sync/status')) {
        statusCallCount++
        if (statusCallCount === 1) return Promise.reject(new Error('Network error'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COMPLETED_JOB) })
      }
      if (url.includes('/api/sync/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([RUNNING_JOB]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        url.includes('/api/settings') ? MOCK_SETTINGS : MOCK_SYNC_LAST_STATUS
      )})
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SyncPage />)

    // Flush initial history fetch
    await act(async () => {})

    // First poll throws network error — should log but not crash
    await act(async () => { vi.advanceTimersByTime(2100) })

    expect(consoleSpy).toHaveBeenCalledWith('Polling error', expect.any(Error))
    // Page still renders
    expect(screen.getByText('Sync Data')).toBeInTheDocument()
  })

  it('surfaces a polling error message in the UI when status fetch fails', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/sync/status')) return Promise.reject(new Error('Network error'))
      if (url.includes('/api/sync/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([RUNNING_JOB]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        url.includes('/api/settings') ? MOCK_SETTINGS : MOCK_SYNC_LAST_STATUS
      )})
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SyncPage />)
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(2100) })

    expect(screen.getByText(/lost connection|sync status may be stale/i)).toBeInTheDocument()
  })
})
