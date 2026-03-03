/**
 * Integration test — renders BudgetPage with REAL child components
 * (BudgetChart, BudgetTable, AIAnalysisPanel) to verify parent→child
 * data flow. Only recharts and useResponsive are mocked.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BudgetPage from './BudgetPage.jsx'
import {
  MOCK_BUDGET_HISTORY,
  MOCK_AI_CONFIG_UNCONFIGURED,
  mockFetch,
} from '../test/fixtures.js'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('BudgetPage integration — real child rendering', () => {
  afterEach(() => vi.restoreAllMocks())

  function setupMocks() {
    mockFetch({
      '/api/budgets/history': MOCK_BUDGET_HISTORY,
      '/api/ai/config':       MOCK_AI_CONFIG_UNCONFIGURED,
    })
  }

  it('renders "Monthly Totals" heading from real BudgetChart child', async () => {
    setupMocks()
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByText('Monthly Totals')).toBeInTheDocument()
    })
  })

  it('renders "Summary" heading from real BudgetTable child', async () => {
    setupMocks()
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument()
    })
  })

  it('renders "Category Detail" heading from real BudgetTable child', async () => {
    setupMocks()
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByText('Category Detail')).toBeInTheDocument()
    })
  })

  it('passes fetched category names through to real BudgetTable', async () => {
    setupMocks()
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument()
      expect(screen.getByText('Restaurants')).toBeInTheDocument()
    })
  })

  it('renders "Analyze with AI" button from real AIAnalysisPanel child', async () => {
    setupMocks()
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Analyze with AI/i })).toBeInTheDocument()
    })
  })
})
