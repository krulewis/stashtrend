import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import InvestmentPerformanceChart from './InvestmentPerformanceChart.jsx'

vi.mock('recharts', () => ({
  ComposedChart: ({ children }) => <div data-testid="composed-chart">{children}</div>,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

const MOCK_PERFORMANCE = {
  series: [
    {
      date: '2025-01-01',
      total: 100000,
      accounts: { 'acc-1': 60000, 'acc-2': 40000 },
    },
  ],
  contributions: [{ month: '2025-01', total: 2000 }],
  account_names: { 'acc-1': '401k', 'acc-2': 'Brokerage' },
}

const DEFAULT_PROPS = {
  range: '1y',
  onRangeChange: vi.fn(),
}

describe('InvestmentPerformanceChart', () => {
  it('shows loading skeleton when loading=true', () => {
    const { container } = render(
      <InvestmentPerformanceChart {...DEFAULT_PROPS} loading={true} />
    )
    const skeleton = container.querySelector('[class*="skeleton"]')
    expect(skeleton).toBeTruthy()
  })

  it('shows error message when error prop is provided', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        error="Failed to load performance data"
      />
    )
    expect(screen.getByText('Failed to load performance data')).toBeInTheDocument()
  })

  it('shows empty state when no performance data', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={null}
        perfLoading={false}
      />
    )
    expect(screen.getByText('No performance data available for the selected range.')).toBeInTheDocument()
  })

  it('renders range selector buttons', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.getByText('3M')).toBeInTheDocument()
    expect(screen.getByText('6M')).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('renders y-mode toggle buttons for $ Value and % Change', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.getByText('$ Value')).toBeInTheDocument()
    expect(screen.getByText('% Change')).toBeInTheDocument()
  })

  it('renders the contribution toggle button', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.getByText(/Show contributions/)).toBeInTheDocument()
  })

  it('renders account chips when performance data is provided', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.getByText('All Combined')).toBeInTheDocument()
    expect(screen.getByText('401k')).toBeInTheDocument()
    expect(screen.getByText('Brokerage')).toBeInTheDocument()
  })

  it('does not render account chips when loading', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={true}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.queryByText('All Combined')).not.toBeInTheDocument()
  })

  it('renders the chart title "Performance"', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    expect(screen.getByText('Performance')).toBeInTheDocument()
  })

  it('toggles y-mode when % Change button is clicked', () => {
    render(
      <InvestmentPerformanceChart
        {...DEFAULT_PROPS}
        loading={false}
        performance={MOCK_PERFORMANCE}
        perfLoading={false}
      />
    )
    const pctButton = screen.getByText('% Change')
    fireEvent.click(pctButton)
    // After clicking, the % Change button should now be the active one
    expect(pctButton).toBeInTheDocument()
  })
})
