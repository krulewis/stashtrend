/**
 * Integration test — renders SyncPage with REAL child components
 * (SyncControl, SyncJobStatus, SyncHistory, AutoSyncSettings) to verify
 * parent→child data flow. No child component mocks are used.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import SyncPage from './SyncPage.jsx'
import {
  MOCK_SYNC_HISTORY,
  MOCK_SYNC_LAST_STATUS,
  MOCK_SETTINGS,
  mockFetch,
} from '../test/fixtures.js'

describe('SyncPage integration — real child rendering', () => {
  afterEach(() => vi.restoreAllMocks())

  function setupMocks(settingsOverride = MOCK_SETTINGS) {
    mockFetch({
      '/api/sync/history':     MOCK_SYNC_HISTORY,
      '/api/sync/last-status': MOCK_SYNC_LAST_STATUS,
      '/api/settings':         settingsOverride,
    })
  }

  it('renders "Sync Data" title from real SyncControl child', async () => {
    setupMocks()
    render(<SyncPage />)
    expect(screen.getByText('Sync Data')).toBeInTheDocument()
  })

  it('passes MOCK_SYNC_LAST_STATUS through to real SyncControl entity rows', async () => {
    setupMocks()
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/67 rows/)).toBeInTheDocument()
    })
  })

  it('passes MOCK_SYNC_HISTORY through to real SyncHistory rows', async () => {
    setupMocks()
    render(<SyncPage />)
    await waitFor(() => {
      expect(screen.getByText(/success/)).toBeInTheDocument()
    })
  })

  it('renders "Auto Sync" heading from real AutoSyncSettings child', async () => {
    setupMocks()
    render(<SyncPage />)
    expect(screen.getByText('Auto Sync')).toBeInTheDocument()
  })

  it('passes MOCK_SETTINGS interval through to real AutoSyncSettings dropdown', async () => {
    setupMocks()
    render(<SyncPage />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /sync interval/i })
      expect(select.value).toBe('0')
    })
  })

  it('passes non-zero interval to real AutoSyncSettings dropdown', async () => {
    setupMocks({ sync_interval_hours: 6 })
    render(<SyncPage />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /sync interval/i })
      expect(select.value).toBe('6')
    })
  })
})
