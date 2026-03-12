import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NetWorthPage from './NetWorthPage.jsx'
import { MOCK_STATS, MOCK_ACCOUNTS, MOCK_NETWORTH_BY_TYPE, mockFetch } from '../test/fixtures.js'

// Mock child components so this test only exercises NetWorthPage's own behavior
vi.mock('../components/StatsCards.jsx',        () => ({ default: () => <div data-testid="stats-cards" /> }))
vi.mock('../components/AccountsBreakdown.jsx', () => ({ default: () => <div data-testid="accounts-breakdown" /> }))
vi.mock('../components/TypeStackedChart.jsx',  () => ({ default: () => <div data-testid="type-stacked-chart" /> }))

describe('NetWorthPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/networth/stats':   MOCK_STATS,
      '/api/accounts/summary': MOCK_ACCOUNTS,
      '/api/networth/by-type': MOCK_NETWORTH_BY_TYPE,
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

  it('renders StatsCards, TypeStackedChart, AccountsBreakdown after data loads', async () => {
    render(<NetWorthPage />)
    await waitFor(() => {
      expect(screen.getByTestId('stats-cards')).toBeInTheDocument()
    })
    expect(screen.getByTestId('type-stacked-chart')).toBeInTheDocument()
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
    // Refresh triggers 3 more fetch calls (stats, accounts, by-type)
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

  it('fetches 3 endpoints on mount (stats, accounts, by-type)', async () => {
    render(<NetWorthPage />)
    await waitFor(() => expect(screen.getByTestId('stats-cards')).toBeInTheDocument())
    expect(global.fetch.mock.calls.length).toBe(3)
    const urls = global.fetch.mock.calls.map((c) => c[0])
    expect(urls.some((u) => u.includes('/api/networth/stats'))).toBe(true)
    expect(urls.some((u) => u.includes('/api/accounts/summary'))).toBe(true)
    expect(urls.some((u) => u.includes('/api/networth/by-type'))).toBe(true)
  })
})
