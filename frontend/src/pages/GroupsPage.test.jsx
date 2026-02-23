import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import GroupsPage from './GroupsPage'
import {
  MOCK_GROUPS,
  MOCK_ACCOUNTS,
  MOCK_HISTORY_DATA,
  MOCK_SNAPSHOT,
  mockFetch,
} from '../test/fixtures'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('GroupsPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/accounts/summary':  MOCK_ACCOUNTS,
      '/api/groups/history':    MOCK_HISTORY_DATA,
      '/api/groups/snapshot':   MOCK_SNAPSHOT,
      '/api/groups':            MOCK_GROUPS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the required API endpoints on mount', async () => {
    render(<GroupsPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/accounts/summary')
      expect(global.fetch).toHaveBeenCalledWith('/api/groups')
      expect(global.fetch).toHaveBeenCalledWith('/api/groups/history')
      expect(global.fetch).toHaveBeenCalledWith('/api/groups/snapshot')
    })
  })

  it('renders the GroupManager section heading', async () => {
    render(<GroupsPage />)
    await waitFor(() => {
      expect(screen.getByText('Manage Groups')).toBeInTheDocument()
    })
  })

  it('shows error state when API fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')))
    render(<GroupsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Error loading data/)).toBeInTheDocument()
    })
  })

  it('renders group names after loading', async () => {
    render(<GroupsPage />)
    // 'Liquid Cash' appears in multiple places (chip, snapshot table, group card) — just verify presence
    await waitFor(() => {
      expect(screen.getAllByText('Liquid Cash').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Debt').length).toBeGreaterThan(0)
    })
  })
})
