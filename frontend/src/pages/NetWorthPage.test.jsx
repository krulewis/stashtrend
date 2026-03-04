import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NetWorthPage from './NetWorthPage.jsx'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, mockFetch } from '../test/fixtures.js'

// Mock child components so this test only exercises NetWorthPage's own behavior
vi.mock('../components/StatsCards.jsx',        () => ({ default: () => <div data-testid="stats-cards" /> }))
vi.mock('../components/NetWorthChart.jsx',     () => ({ default: () => <div data-testid="networth-chart" /> }))
vi.mock('../components/AccountsBreakdown.jsx', () => ({ default: () => <div data-testid="accounts-breakdown" /> }))

describe('NetWorthPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/networth/stats':   MOCK_STATS,
      '/api/networth/history': MOCK_HISTORY,
      '/api/accounts/summary': MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state before data arrives', () => {
    // Never-resolving fetch keeps loading=true
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<NetWorthPage />)
    expect(screen.getByTestId('networth-loading')).toBeInTheDocument()
  })

  it('renders StatsCards, NetWorthChart, AccountsBreakdown after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByTestId('stats-cards')).toBeInTheDocument()
    })
    expect(screen.getByTestId('networth-chart')).toBeInTheDocument()
    expect(screen.getByTestId('accounts-breakdown')).toBeInTheDocument()
    expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument()
  })

  it('renders error state when API fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Connection refused')))
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('stats-cards')).not.toBeInTheDocument()
  })

  it('renders a Refresh button', async () => {
    render(<NetWorthPage />)
    await waitFor(() => expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument()
  })

  it('re-fetches data when Refresh is clicked', async () => {
    render(<NetWorthPage />)
    await waitFor(() => expect(screen.queryByTestId('networth-loading')).not.toBeInTheDocument())
    const callsBefore = global.fetch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    // Refresh triggers 3 more fetch calls (stats, history, accounts)
    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('renders "Updated at" timestamp after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByText(/Updated at/)).toBeInTheDocument()
    })
  })
})
