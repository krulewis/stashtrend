import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SyncJobStatus from './SyncJobStatus.jsx'
import { MOCK_SYNC_JOB } from '../test/fixtures.js'

const RUNNING_JOB = {
  id: 'job-running',
  started_at: '2026-02-23T10:00:00Z',
  finished_at: null,
  status: 'running',
  entities: ['accounts', 'transactions'],
  results: {
    accounts: { status: 'success', count: 67, new: 0 },
    // transactions not yet started
  },
}

describe('SyncJobStatus', () => {
  it('shows empty state when job is null', () => {
    render(<SyncJobStatus job={null} isRunning={false} />)
    expect(screen.getByText(/No sync has been run yet/)).toBeInTheDocument()
  })

  it('renders the panel title', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText('Sync Status')).toBeInTheDocument()
  })

  it('renders the job status badge', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText(/success/)).toBeInTheDocument()
  })

  it('renders a row for each selected entity', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
  })

  it('shows synced record counts for completed entities', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText(/67 synced/)).toBeInTheDocument()
    expect(screen.getByText(/964 synced/)).toBeInTheDocument()
  })

  it('shows "+N new" label when new records were found', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText(/\+5 new/)).toBeInTheDocument()
  })

  it('shows "no new records" when count is zero', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText('no new records')).toBeInTheDocument()
  })

  it('shows "syncing…" label for the currently running entity', () => {
    render(<SyncJobStatus job={RUNNING_JOB} isRunning={true} />)
    expect(screen.getByText('syncing…')).toBeInTheDocument()
  })

  it('shows elapsed time while job is running', () => {
    render(<SyncJobStatus job={RUNNING_JOB} isRunning={true} />)
    expect(screen.getByText(/elapsed/)).toBeInTheDocument()
  })

  it('shows started-at timestamp', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText(/Started:/)).toBeInTheDocument()
  })

  it('shows duration for completed jobs', () => {
    render(<SyncJobStatus job={MOCK_SYNC_JOB} isRunning={false} />)
    expect(screen.getByText(/Duration:/)).toBeInTheDocument()
  })
})
