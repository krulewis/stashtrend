import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MOCK_NETWORTH_BY_TYPE } from '../test/fixtures.js'

// Mock recharts — renders children as plain divs
vi.mock('recharts', () => ({
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Legend: () => <div data-testid="legend" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ReferenceLine: ({ y, label }) => (
    <div data-testid={`milestone-${y}`} data-label={label?.value ?? ''}></div>
  ),
}))

// Mock hooks and sibling components
vi.mock('../hooks/useResponsive.js', () => ({
  useResponsive: () => ({ isMobile: false }),
}))
vi.mock('./RangeSelector.jsx', () => ({
  default: ({ ranges, activeRange }) => (
    <div data-testid="range-selector" data-active={activeRange}>
      {ranges.map((r) => r.label).join(',')}
    </div>
  ),
}))

// Spy on downsample to verify it's called
const downsampleSpy = vi.fn((data) => data)
vi.mock('./chartUtils.jsx', async () => {
  const actual = await vi.importActual('./chartUtils.jsx')
  return {
    ...actual,
    downsample: (...args) => downsampleSpy(...args),
  }
})

// Import after mocks
import TypeStackedChart from './TypeStackedChart.jsx'

describe('TypeStackedChart', () => {
  beforeEach(() => {
    downsampleSpy.mockClear()
  })

  it('shows loading state when data is null', () => {
    render(<TypeStackedChart data={null} />)
    expect(screen.getByText(/Loading type breakdown/)).toBeInTheDocument()
  })

  it('renders "Net Worth by Type" title', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    expect(screen.getByText('Net Worth by Type')).toBeInTheDocument()
  })

  it('renders CAGR table with all 6 bucket rows', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    for (const bucket of MOCK_NETWORTH_BY_TYPE.bucket_order) {
      expect(screen.getByText(bucket)).toBeInTheDocument()
    }
  })

  it('renders null CAGR as "--" with muted color', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    // Real Estate, Debt, Other all have null CAGR for all periods
    const dashes = screen.getAllByText('--')
    expect(dashes.length).toBeGreaterThanOrEqual(9) // 3 buckets × 3 periods
    // Check muted styling via CSS module class (cagrNull)
    expect(dashes[0].className).toMatch(/cagrNull/)
  })

  it('renders positive CAGR with green color', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    // Retirement 1Y = 9.1 → "+9.1%"
    const positiveCell = screen.getByText('+9.1%')
    expect(positiveCell).toHaveStyle({ color: '#2ECC8A' })
  })

  it('renders range selector with default All selected', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    const selector = screen.getByTestId('range-selector')
    expect(selector).toHaveAttribute('data-active', 'All')
  })

  it('has "Estimated CAGR" caveat text with tooltip', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    expect(screen.getByText('Estimated CAGR')).toBeInTheDocument()
    // The info icon has a title attribute with caveat text
    const infoIcon = screen.getByTitle('Estimated CAGR — actual returns may differ.')
    expect(infoIcon).toBeInTheDocument()
  })

  it('calls downsample before rendering chart', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    expect(downsampleSpy).toHaveBeenCalled()
  })

  it('renders ReferenceLine for each milestone', () => {
    const milestones = [
      { label: 'Half-Mil', amount: 500000 },
      { label: 'Million', amount: 1000000 },
    ]
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} milestones={milestones} />)
    expect(screen.getByTestId('milestone-500000')).toBeInTheDocument()
    expect(screen.getByTestId('milestone-1000000')).toBeInTheDocument()
  })

  it('renders no ReferenceLine when milestones is null', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} milestones={null} />)
    expect(screen.queryByTestId(/^milestone-/)).not.toBeInTheDocument()
  })

  it('renders no ReferenceLine when milestones is empty', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} milestones={[]} />)
    expect(screen.queryByTestId(/^milestone-/)).not.toBeInTheDocument()
  })

  it('renders column headers for CAGR periods', () => {
    render(<TypeStackedChart data={MOCK_NETWORTH_BY_TYPE} />)
    expect(screen.getByText('1Y')).toBeInTheDocument()
    expect(screen.getByText('3Y')).toBeInTheDocument()
    expect(screen.getByText('5Y')).toBeInTheDocument()
  })
})
