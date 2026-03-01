import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import BudgetPage from './BudgetPage.jsx'
import { MOCK_BUDGET_HISTORY, MOCK_AI_CONFIG_UNCONFIGURED, mockFetch } from '../test/fixtures.js'

vi.mock('../components/BudgetChart.jsx', () => ({
  default: ({ months, totalsByMonth }) => (
    <div data-testid="budget-chart">
      {months && <span>chart-months:{months.length}</span>}
    </div>
  ),
}))

vi.mock('../components/BudgetTable.jsx', () => ({
  default: ({ months, categories }) => (
    <div data-testid="budget-table">
      {categories && <span>table-categories:{categories.length}</span>}
    </div>
  ),
}))

vi.mock('../components/AIAnalysisPanel.jsx', () => ({
  default: () => <div data-testid="ai-analysis-panel" />,
}))

describe('BudgetPage', () => {
  beforeEach(() => {
    mockFetch({
      '/api/budgets/history': MOCK_BUDGET_HISTORY,
      '/api/ai/config':       MOCK_AI_CONFIG_UNCONFIGURED,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<BudgetPage />)
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('renders BudgetChart and BudgetTable after data loads', async () => {
    render(<BudgetPage />)
    expect(await screen.findByTestId('budget-chart')).toBeInTheDocument()
    expect(screen.getByTestId('budget-table')).toBeInTheDocument()
  })

  it('renders AIAnalysisPanel', async () => {
    render(<BudgetPage />)
    expect(await screen.findByTestId('ai-analysis-panel')).toBeInTheDocument()
  })

  it('renders range buttons 3M, 6M, 12M', async () => {
    render(<BudgetPage />)
    await screen.findByTestId('budget-chart')
    expect(screen.getByRole('button', { name: '3M' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6M' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '12M' })).toBeInTheDocument()
  })

  it('clicking 3M range button triggers fetch with months=3', async () => {
    render(<BudgetPage />)
    await screen.findByTestId('budget-chart')
    fireEvent.click(screen.getByRole('button', { name: '3M' }))
    await waitFor(() => {
      const calls = global.fetch.mock.calls.map(c => c[0])
      expect(calls.some(url => url.includes('months=3'))).toBe(true)
    })
  })

  it('shows error box when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network failure')))
    render(<BudgetPage />)
    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument()
    })
  })
})
