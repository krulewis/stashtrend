import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from './App'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, MOCK_SETUP_STATUS, mockFetch } from './test/fixtures'

// Mock child pages so their own fetch calls don't interfere with App-level tests
vi.mock('./pages/GroupsPage', () => ({ default: () => <div data-testid="groups-page" /> }))
vi.mock('./pages/SyncPage',   () => ({ default: () => <div data-testid="sync-page" /> }))
vi.mock('./pages/SetupPage',  () => ({ default: ({ onComplete }) => <div data-testid="setup-page" /> }))

describe('App', () => {
  beforeEach(() => {
    mockFetch({
      '/api/setup/status':      MOCK_SETUP_STATUS,
      '/api/networth/stats':    MOCK_STATS,
      '/api/networth/history':  MOCK_HISTORY,
      '/api/accounts/summary':  MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the app name in the header', async () => {
    render(<App />)
    expect(await screen.findByText('Monarch Dashboard')).toBeInTheDocument()
  })

  it('renders all three tab buttons', async () => {
    render(<App />)
    // Use findByRole to wait for setup check to complete and tabs to appear
    expect(await screen.findByRole('button', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('shows Net Worth content by default (no other pages visible)', async () => {
    render(<App />)
    await screen.findByText('Monarch Dashboard') // wait for app to load past setup check
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('switches to Account Groups tab when clicked', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText(/Account Groups/))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('switches to Sync Data tab when clicked', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText(/Sync Data/))
    expect(screen.getByTestId('sync-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('can switch back from Groups to Net Worth', async () => {
    render(<App />)
    const groupsBtn = await screen.findByText(/Account Groups/)
    fireEvent.click(groupsBtn)
    fireEvent.click(screen.getByText(/Net Worth/))
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('shows API error state when data fetch fails', async () => {
    // Setup succeeds but data fetches fail
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/setup/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: true }) })
      }
      return Promise.reject(new Error('Connection refused'))
    })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument()
    })
  })

  it('renders a Refresh button', async () => {
    render(<App />)
    expect(await screen.findByText(/Refresh/)).toBeInTheDocument()
  })

  it('shows loading state while setup status is loading', () => {
    // Never-resolving fetch keeps configured=null
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<App />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('shows SetupPage when not configured', async () => {
    mockFetch({ '/api/setup/status': { configured: false } })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    })
  })
})
