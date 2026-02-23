import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from './App'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, mockFetch } from './test/fixtures'

// Mock child pages so their own fetch calls don't interfere with App-level tests
vi.mock('./pages/GroupsPage', () => ({ default: () => <div data-testid="groups-page" /> }))
vi.mock('./pages/SyncPage',   () => ({ default: () => <div data-testid="sync-page" /> }))

describe('App', () => {
  beforeEach(() => {
    mockFetch({
      '/api/networth/stats':    MOCK_STATS,
      '/api/networth/history':  MOCK_HISTORY,
      '/api/accounts/summary':  MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the app name in the header', () => {
    render(<App />)
    expect(screen.getByText('Monarch Dashboard')).toBeInTheDocument()
  })

  it('renders all three tab buttons', () => {
    render(<App />)
    // Use getByRole to scope to the tab buttons specifically (avoids matching chart headings)
    expect(screen.getByRole('button', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('shows Net Worth content by default (no other pages visible)', () => {
    render(<App />)
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('switches to Account Groups tab when clicked', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Account Groups/))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('switches to Sync Data tab when clicked', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Sync Data/))
    expect(screen.getByTestId('sync-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('can switch back from Groups to Net Worth', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Account Groups/))
    fireEvent.click(screen.getByText(/Net Worth/))
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('shows API error state when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Connection refused')))
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument()
    })
  })

  it('renders a Refresh button', () => {
    render(<App />)
    expect(screen.getByText(/Refresh/)).toBeInTheDocument()
  })
})
