import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import SyncPage from './SyncPage'
import { MOCK_SYNC_HISTORY, MOCK_SYNC_LAST_STATUS, mockFetch } from '../test/fixtures'

describe('SyncPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/sync/history':     MOCK_SYNC_HISTORY,
      '/api/sync/last-status': MOCK_SYNC_LAST_STATUS,
      '/api/sync/start':       { job_id: 'job-new' },
    })
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
    })
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/No sync has been run yet/)).toBeInTheDocument()
    })
  })
})
