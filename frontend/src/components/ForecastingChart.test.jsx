import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ForecastingChart from './ForecastingChart.jsx'

vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isDesktop: true }),
}))

const MOCK_CHART_DATA = [
  { date: '2025-01-01', net_worth: 300000, projected_net_worth: null },
  { date: '2026-01-01', net_worth: 350000, projected_net_worth: null },
  { date: '2027-01-01', net_worth: null, projected_net_worth: 400000 },
  { date: '2030-01-01', net_worth: null, projected_net_worth: 600000 },
]

describe('ForecastingChart', () => {
  it('renders chart title "Investable Capital Projection"', () => {
    render(<ForecastingChart chartData={MOCK_CHART_DATA} />)
    expect(screen.getByText('Investable Capital Projection')).toBeInTheDocument()
  })

  it('renders range selector with 5Y, 10Y, 20Y, All buttons', () => {
    render(<ForecastingChart chartData={MOCK_CHART_DATA} />)
    expect(screen.getByText('5Y')).toBeInTheDocument()
    expect(screen.getByText('10Y')).toBeInTheDocument()
    expect(screen.getByText('20Y')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('renders screen reader summary text when provided', () => {
    const summary = 'You are projected to reach $2,000,000 by 2056.'
    render(<ForecastingChart chartData={MOCK_CHART_DATA} srSummary={summary} />)
    expect(screen.getByText(summary)).toBeInTheDocument()
  })

  it('renders chart container with data', () => {
    render(<ForecastingChart chartData={MOCK_CHART_DATA} />)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })
})
