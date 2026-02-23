import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import SyncHistory from './SyncHistory'
import { MOCK_SYNC_HISTORY } from '../test/fixtures'

const onSelectJob = vi.fn()

describe('SyncHistory', () => {
  afterEach(() => {
    onSelectJob.mockClear()
  })

  it('shows empty state when history is null', () => {
    render(<SyncHistory history={null} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getByText(/No sync runs recorded yet/)).toBeInTheDocument()
  })

  it('shows empty state when history array is empty', () => {
    render(<SyncHistory history={[]} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getByText(/No sync runs recorded yet/)).toBeInTheDocument()
  })

  it('renders table column headers', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getByText('Started')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Mode')).toBeInTheDocument()
    expect(screen.getByText('Entities')).toBeInTheDocument()
    expect(screen.getByText('Records')).toBeInTheDocument()
    expect(screen.getByText('Duration')).toBeInTheDocument()
  })

  it('renders a row for each history entry', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    // Two rows — one success, one partial
    expect(screen.getByText(/success/)).toBeInTheDocument()
    expect(screen.getByText(/partial/)).toBeInTheDocument()
  })

  it('shows Full / Incremental mode labels', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getByText('Incremental')).toBeInTheDocument()
    expect(screen.getByText('Full')).toBeInTheDocument()
  })

  it('calls onSelectJob with the correct job when a row is clicked', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    // Click the first row (success job)
    fireEvent.click(screen.getByText(/success/))
    expect(onSelectJob).toHaveBeenCalledWith(MOCK_SYNC_HISTORY[0])
  })

  it('renders entity pills for each job row', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getAllByText('Accounts').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0)
  })

  it('renders the Sync History title', () => {
    render(<SyncHistory history={MOCK_SYNC_HISTORY} activeJobId={null} onSelectJob={onSelectJob} />)
    expect(screen.getByText('Sync History')).toBeInTheDocument()
  })
})
