import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import SyncControl from './SyncControl'
import { MOCK_SYNC_LAST_STATUS, mockFetch } from '../test/fixtures'

const onSyncStarted = vi.fn()

describe('SyncControl', () => {
  beforeEach(() => {
    mockFetch({
      '/api/sync/last-status': MOCK_SYNC_LAST_STATUS,
      '/api/sync/start':       { job_id: 'job-new' },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    onSyncStarted.mockClear()
  })

  it('renders all five entity checkboxes', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Account History')).toBeInTheDocument()
    expect(screen.getByText('Categories')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Budgets')).toBeInTheDocument()
  })

  it('all entity checkboxes are checked by default', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb).toBeChecked())
  })

  it('unchecking a checkbox deselects that entity', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0]).not.toBeChecked()
  })

  it('"Deselect all" button unchecks all checkboxes', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    fireEvent.click(screen.getByText('Deselect all'))
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).not.toBeChecked())
  })

  it('"Select all" button re-checks all checkboxes after deselecting', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    fireEvent.click(screen.getByText('Deselect all'))
    fireEvent.click(screen.getByText('Select all'))
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeChecked())
  })

  it('renders Incremental and Full Refresh mode buttons', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    expect(screen.getByText('Incremental')).toBeInTheDocument()
    expect(screen.getByText('Full Refresh')).toBeInTheDocument()
  })

  it('clicking Full Refresh updates the mode hint text', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    fireEvent.click(screen.getByText('Full Refresh'))
    expect(screen.getByText(/Re-fetches all historical data/)).toBeInTheDocument()
  })

  it('Start Sync button is enabled when not running and entities are selected', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    expect(screen.getByText('▶ Start Sync')).not.toBeDisabled()
  })

  it('Start Sync button is disabled when isRunning is true', () => {
    render(<SyncControl isRunning={true} onSyncStarted={onSyncStarted} />)
    expect(screen.getByText(/Sync in progress/)).toBeDisabled()
  })

  it('Start Sync button is disabled when no entities are selected', () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    fireEvent.click(screen.getByText('Deselect all'))
    expect(screen.getByText('▶ Start Sync')).toBeDisabled()
  })

  it('calls onSyncStarted with job_id after successful start', async () => {
    render(<SyncControl isRunning={false} onSyncStarted={onSyncStarted} />)
    fireEvent.click(screen.getByText('▶ Start Sync'))
    await waitFor(() => {
      expect(onSyncStarted).toHaveBeenCalledWith('job-new')
    })
  })
})
