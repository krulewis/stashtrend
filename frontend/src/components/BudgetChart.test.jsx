import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import BudgetChart from './BudgetChart'
import { MOCK_BUDGET_HISTORY } from '../test/fixtures'

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
})
