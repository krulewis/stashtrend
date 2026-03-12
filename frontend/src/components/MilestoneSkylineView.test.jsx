import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ y, x }) => (
    <div
      data-testid={y != null ? `reference-line-${y}` : `reference-line-x-${x}`}
    />
  ),
}))

vi.mock('../hooks/useResponsive.js', () => ({
  useResponsive: () => ({ isMobile: false }),
}))

import MilestoneSkylineView from './MilestoneSkylineView.jsx'

const mergedSeries = [
  { date: '2024-01-01', investableCapital: 200000 },
  { date: '2025-01-01', investableCapital: 300000 },
  { date: '2026-01-01', investableCapital: 440000, projectedCapital: 450000 },
  { date: '2027-01-01', projectedCapital: 600000 },
]

const milestones = [
  { label: 'Half-Mil', amount: 500000, state: 'in-progress', isNestEgg: false },
  { label: 'Million', amount: 1000000, state: 'future', isNestEgg: false },
]

const nestEggMilestones = [
  ...milestones,
  { label: 'Nest Egg', amount: 1700000, state: 'future', isNestEgg: true },
]

describe('MilestoneSkylineView', () => {
  it('renders AreaChart container', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={milestones}
        investableCapital={440000}
        hasProjection={true}
      />
    )
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('renders a ReferenceLine for each milestone', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={milestones}
        investableCapital={440000}
        hasProjection={true}
      />
    )
    // recharts mock renders ReferenceLine as data-testid="reference-line-{y}"
    expect(screen.getByTestId('reference-line-500000')).toBeInTheDocument()
    expect(screen.getByTestId('reference-line-1000000')).toBeInTheDocument()
  })

  it('renders reference lines for nest egg milestones', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={nestEggMilestones}
        investableCapital={440000}
        hasProjection={true}
      />
    )
    expect(screen.getByTestId('reference-line-1700000')).toBeInTheDocument()
  })

  it('renders no-projection notice when hasProjection=false (EC-6)', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={milestones}
        investableCapital={440000}
        hasProjection={false}
      />
    )
    expect(
      screen.getByText(/Set expected return in Retirement Settings/)
    ).toBeInTheDocument()
  })

  it('does not render no-projection notice when hasProjection=true', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={milestones}
        investableCapital={440000}
        hasProjection={true}
      />
    )
    expect(
      screen.queryByText(/Set expected return in Retirement Settings/)
    ).not.toBeInTheDocument()
  })

  it('renders ResponsiveContainer', () => {
    render(
      <MilestoneSkylineView
        mergedSeries={mergedSeries}
        milestones={milestones}
        investableCapital={440000}
        hasProjection={true}
      />
    )
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })
})
