import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import BudgetChart from './BudgetChart.jsx'
import { MOCK_BUDGET_HISTORY } from '../test/fixtures.js'

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ dataKey }) => <div data-testid={`bar-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('BudgetChart', () => {
  const { months, totals_by_month } = MOCK_BUDGET_HISTORY
  const incomeTotals = { '2025-11-01': 6000, '2025-12-01': 6200 }

  it('renders the chart container with data', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders the section title', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} />)
    expect(screen.getByText('Monthly Totals')).toBeInTheDocument()
  })

  it('renders Budget and Actual bars', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} />)
    expect(screen.getByTestId('bar-Budget')).toBeInTheDocument()
    expect(screen.getByTestId('bar-Actual')).toBeInTheDocument()
  })

  it('shows loading state when no data provided', () => {
    render(<BudgetChart months={null} totalsByMonth={null} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  // ── Income bar ────────────────────────────────────────────────────────────

  it('renders Income bar when incomeTotalsByMonth is provided', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} incomeTotalsByMonth={incomeTotals} />)
    expect(screen.getByTestId('bar-Income')).toBeInTheDocument()
  })

  it('does not render Income bar when incomeTotalsByMonth is not provided', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} />)
    expect(screen.queryByTestId('bar-Income')).not.toBeInTheDocument()
  })

  it('does not render Income bar when incomeTotalsByMonth is null', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} incomeTotalsByMonth={null} />)
    expect(screen.queryByTestId('bar-Income')).not.toBeInTheDocument()
  })

  it('renders Budget, Actual, and Income bars together', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} incomeTotalsByMonth={incomeTotals} />)
    expect(screen.getByTestId('bar-Budget')).toBeInTheDocument()
    expect(screen.getByTestId('bar-Actual')).toBeInTheDocument()
    expect(screen.getByTestId('bar-Income')).toBeInTheDocument()
  })

  it('renders Income bar even when all income values are zero', () => {
    render(<BudgetChart months={months} totalsByMonth={totals_by_month} incomeTotalsByMonth={{ '2025-11-01': 0, '2025-12-01': 0 }} />)
    expect(screen.getByTestId('bar-Income')).toBeInTheDocument()
  })
})
