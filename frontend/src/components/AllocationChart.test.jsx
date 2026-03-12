import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AllocationChart from './AllocationChart.jsx'

vi.mock('recharts', () => ({
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false }),
}))

const MOCK_ALLOCATION = [
  { type: 'Stock', value: 20000, pct: 54.1 },
  { type: 'ETF', value: 12000, pct: 32.4 },
  { type: 'Cash', value: 5000, pct: 13.5 },
]

const MOCK_TOTALS = { current_value: 37000 }

describe('AllocationChart', () => {
  it('shows empty state when allocation is null', () => {
    render(
      <AllocationChart allocation={null} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByText('No allocation data available.')).toBeInTheDocument()
  })

  it('shows empty state when allocation is an empty array', () => {
    render(
      <AllocationChart allocation={[]} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByText('No allocation data available.')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={true} />
    )
    const skeleton = container.querySelector('[class*="skeletonCircle"]')
    expect(skeleton).toBeTruthy()
  })

  it('does not show chart or legend when loading', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={true} />
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders legend items for each allocation type', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByText('Stock')).toBeInTheDocument()
    expect(screen.getByText('ETF')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('renders chart title "Asset Allocation"', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByText('Asset Allocation')).toBeInTheDocument()
  })

  it('renders the pie chart element when allocation data is provided', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('renders percentage values in legend', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByText('54.1%')).toBeInTheDocument()
    expect(screen.getByText('32.4%')).toBeInTheDocument()
    expect(screen.getByText('13.5%')).toBeInTheDocument()
  })

  it('renders legend as a list', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('does not show empty state when allocation data is present', () => {
    render(
      <AllocationChart allocation={MOCK_ALLOCATION} totals={MOCK_TOTALS} loading={false} />
    )
    expect(screen.queryByText('No allocation data available.')).not.toBeInTheDocument()
  })
})
