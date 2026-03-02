import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import GroupsTimeChart from './GroupsTimeChart.jsx'
import { MOCK_HISTORY_DATA } from '../test/fixtures.js'

vi.mock('recharts', () => ({
  LineChart:           ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line:                () => null,
  ResponsiveContainer: ({ height, children }) => (
    <div data-testid="responsive-container" data-height={String(height)}>{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis:         () => null,
  YAxis:         () => null,
  Tooltip:       () => null,
}))
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('GroupsTimeChart', () => {
  it('shows loading message when historyData is null', () => {
    render(<GroupsTimeChart historyData={null} />)
    expect(screen.getByText('Loading chart…')).toBeInTheDocument()
  })

  it('shows empty state when there are no groups', () => {
    render(<GroupsTimeChart historyData={{ series: [], groups_meta: {} }} />)
    expect(screen.getByText(/Create groups below/)).toBeInTheDocument()
  })

  it('renders a chip button for each group', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    expect(screen.getByText('Liquid Cash')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
  })

  it('shows "select groups" hint when no chip is selected', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    expect(screen.getByText(/Select one or more groups above/)).toBeInTheDocument()
  })

  it('hides the "select groups" hint after a chip is clicked', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    fireEvent.click(screen.getByText('Liquid Cash'))
    expect(screen.queryByText(/Select one or more groups above/)).not.toBeInTheDocument()
  })

  it('shows the chart after a chip is selected', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    fireEvent.click(screen.getByText('Liquid Cash'))
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('deselects a chip on second click and returns to hint', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    fireEvent.click(screen.getByText('Liquid Cash'))
    fireEvent.click(screen.getByText('Liquid Cash'))
    expect(screen.getByText(/Select one or more groups above/)).toBeInTheDocument()
  })

  it('renders all range buttons', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    ;['3M', '6M', '1Y', '2Y', 'All'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('renders chart title', () => {
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    expect(screen.getByText('Group Balances Over Time')).toBeInTheDocument()
  })

  // ── Chart height (desktop = 380px when isDesktop: true) ───────────────────

  it('applies 380px chart height on desktop', () => {
    // useResponsive mock returns { isMobile: false, isDesktop: true }
    // Before the feature: chartHeight = isMobile ? 220 : 300  → 300
    // After the feature:  chartHeight = isMobile ? 220 : isDesktop ? 380 : 300  → 380
    render(<GroupsTimeChart historyData={MOCK_HISTORY_DATA} />)
    fireEvent.click(screen.getByText('Liquid Cash'))
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-height', '380')
  })
})
