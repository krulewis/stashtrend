import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import SyncPage from './SyncPage'
import {
  MOCK_SYNC_HISTORY,
  MOCK_SYNC_LAST_STATUS,
  MOCK_SETTINGS,
  mockFetch,
} from '../test/fixtures'

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
