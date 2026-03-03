/**
 * Integration test — renders GroupsPage with REAL child components
 * (GroupsSnapshot, GroupManager, GroupsTimeChart) to verify parent→child
 * data flow. Only recharts and useResponsive are mocked.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import GroupsPage from './GroupsPage.jsx'
import {
  MOCK_GROUPS,
  MOCK_HISTORY_DATA,
  MOCK_SNAPSHOT,
  MOCK_ACCOUNTS,
  MOCK_CONFIGS_RESPONSE,
  MOCK_CONFIGS_EMPTY,
  mockFetch,
} from '../test/fixtures.js'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('GroupsPage integration — real child rendering', () => {
  afterEach(() => vi.restoreAllMocks())

  function setupMocks(configsResponse = MOCK_CONFIGS_EMPTY) {
    mockFetch({
      '/api/accounts/summary': MOCK_ACCOUNTS,
      '/api/groups/configs':   configsResponse,
      '/api/groups/snapshot':  MOCK_SNAPSHOT,
      '/api/groups/history':   MOCK_HISTORY_DATA,
      '/api/groups':           MOCK_GROUPS,
    })
  }

  it('renders real GroupsSnapshot showing "No groups selected" when no active config', async () => {
    setupMocks(MOCK_CONFIGS_EMPTY)
    render(<GroupsPage />)
    await waitFor(() => {
      expect(screen.getByText(/No groups selected/)).toBeInTheDocument()
    })
  })

  it('renders "Current Snapshot" heading from real GroupsSnapshot child', async () => {
    setupMocks(MOCK_CONFIGS_RESPONSE)
    render(<GroupsPage />)
    await waitFor(() => {
      expect(screen.getByText('Current Snapshot')).toBeInTheDocument()
    })
  })

  it('passes fetched group names through to real GroupsSnapshot summary table', async () => {
    setupMocks(MOCK_CONFIGS_RESPONSE)
    render(<GroupsPage />)
    // MOCK_CONFIGS_RESPONSE has active_config_id=1 which selects group 1 (Liquid Cash)
    // "Liquid Cash" appears in both snapshot controls and manager — use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText('Liquid Cash').length).toBeGreaterThanOrEqual(1)
    })
    // Verify snapshot-specific content: account count rendered by real GroupsSnapshot
    expect(screen.getByText(/2 accts/)).toBeInTheDocument()
  })

  it('renders real GroupManager with "Manage Groups" heading', async () => {
    setupMocks(MOCK_CONFIGS_EMPTY)
    render(<GroupsPage />)
    await waitFor(() => {
      expect(screen.getByText('Manage Groups')).toBeInTheDocument()
    })
  })

  it('passes account data through to real GroupManager child', async () => {
    setupMocks(MOCK_CONFIGS_EMPTY)
    render(<GroupsPage />)
    // GroupManager renders group cards — name appears in both controls and manager
    await waitFor(() => {
      expect(screen.getAllByText('Liquid Cash').length).toBeGreaterThanOrEqual(1)
    })
  })
})
