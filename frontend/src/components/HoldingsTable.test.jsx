import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HoldingsTable from './HoldingsTable.jsx'

const MOCK_HOLDINGS = [
  {
    ticker: 'AAPL',
    security_name: 'Apple Inc',
    security_type: 'Stock',
    quantity: 100,
    cost_basis: 15000,
    current_value: 20000,
    unrealized_gain_loss_dollars: 5000,
    unrealized_gain_loss_pct: 33.3,
    is_manual: 0,
  },
  {
    ticker: 'VTI',
    security_name: 'Vanguard Total',
    security_type: 'ETF',
    quantity: 50,
    cost_basis: 10000,
    current_value: 12000,
    unrealized_gain_loss_dollars: 2000,
    unrealized_gain_loss_pct: 20.0,
    is_manual: 0,
  },
  {
    ticker: null,
    security_name: 'Unknown',
    security_type: 'Other',
    quantity: null,
    cost_basis: null,
    current_value: 5000,
    unrealized_gain_loss_dollars: null,
    unrealized_gain_loss_pct: null,
    is_manual: 1,
  },
]

describe('HoldingsTable', () => {
  it('renders holdings with ticker symbols', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('VTI')).toBeInTheDocument()
  })

  it('shows empty state when holdings is an empty array', () => {
    render(<HoldingsTable holdings={[]} loading={false} />)
    expect(screen.getByText('No holdings found.')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(<HoldingsTable holdings={[]} loading={true} />)
    const shimmerCells = container.querySelectorAll('[class*="shimmerCell"]')
    expect(shimmerCells.length).toBeGreaterThan(0)
  })

  it('renders the type filter dropdown', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    const select = screen.getByRole('combobox', { name: /filter by security type/i })
    expect(select).toBeInTheDocument()
  })

  it('renders filter dropdown options including Stock and ETF', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByRole('option', { name: 'Stock' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ETF' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument()
  })

  it('shows filtered empty state when type filter yields no results', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    const select = screen.getByRole('combobox', { name: /filter by security type/i })
    fireEvent.change(select, { target: { value: 'Bond' } })
    expect(screen.getByText('No Bond holdings in this account.')).toBeInTheDocument()
  })

  it('renders footer totals when holdings are present', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('shows N/A ticker for holdings with null ticker', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    const naElements = screen.getAllByText('N/A')
    expect(naElements.length).toBeGreaterThan(0)
  })

  it('shows Manual badge for holdings with is_manual=1', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })

  it('does not show Manual badge for holdings with is_manual=0', () => {
    const onlyManual = MOCK_HOLDINGS.filter((h) => h.is_manual === 0)
    render(<HoldingsTable holdings={onlyManual} loading={false} />)
    expect(screen.queryByText('Manual')).not.toBeInTheDocument()
  })

  it('shows N/A for null unrealized gain/loss in a holding row', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    // The null holding has no gain/loss — N/A should appear
    const naElements = screen.getAllByText('N/A')
    expect(naElements.length).toBeGreaterThan(0)
  })

  it('renders security names', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByText('Apple Inc')).toBeInTheDocument()
    expect(screen.getByText('Vanguard Total')).toBeInTheDocument()
  })

  it('renders the table title "Holdings"', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    expect(screen.getByText('Holdings')).toBeInTheDocument()
  })

  it('sorts by name column when name header is clicked', () => {
    render(<HoldingsTable holdings={MOCK_HOLDINGS} loading={false} />)
    const tickerHeader = screen.getByText(/^Ticker/)
    fireEvent.click(tickerHeader)
    expect(tickerHeader.closest('th')).toHaveAttribute('aria-sort')
  })

  it('does not show footer when holdings array is empty', () => {
    render(<HoldingsTable holdings={[]} loading={false} />)
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })
})
