import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import InvestmentAccountsTable from './InvestmentAccountsTable.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const MOCK_ACCOUNTS = [
  {
    id: '1',
    name: '401k Plan',
    institution: 'Fidelity',
    type: 'retirement',
    bucket: 'Retirement',
    current_value: 250000,
    total_return_dollars: 50000,
    total_return_pct: 25.0,
    cagr_pct: 8.5,
    allocation_weight_pct: 62.5,
  },
  {
    id: '2',
    name: 'Taxable',
    institution: 'Schwab',
    type: 'brokerage',
    bucket: 'Brokerage',
    current_value: 150000,
    total_return_dollars: 20000,
    total_return_pct: 15.4,
    cagr_pct: 6.2,
    allocation_weight_pct: 37.5,
  },
]

describe('InvestmentAccountsTable', () => {
  it('renders account names when given accounts', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('401k Plan')).toBeInTheDocument()
    expect(screen.getByText('Taxable')).toBeInTheDocument()
  })

  it('renders empty state message when accounts is empty array', () => {
    render(<InvestmentAccountsTable accounts={[]} loading={false} />)
    expect(screen.getByText('No investment accounts found.')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(<InvestmentAccountsTable accounts={[]} loading={true} />)
    const shimmerCells = container.querySelectorAll('[class*="shimmerCell"]')
    expect(shimmerCells.length).toBeGreaterThan(0)
  })

  it('renders group header "Retirement" for retirement accounts', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('Retirement')).toBeInTheDocument()
  })

  it('renders group header "Brokerage" for non-retirement accounts', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('Brokerage')).toBeInTheDocument()
  })

  it('renders footer totals row', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('handles null total_return_dollars by showing N/A', () => {
    const accounts = [
      {
        id: '3',
        name: 'No Return Account',
        institution: 'Vanguard',
        bucket: 'Retirement',
        current_value: 100000,
        total_return_dollars: null,
        total_return_pct: null,
        cagr_pct: null,
        allocation_weight_pct: null,
      },
    ]
    render(<InvestmentAccountsTable accounts={accounts} loading={false} />)
    const naElements = screen.getAllByText('N/A')
    expect(naElements.length).toBeGreaterThan(0)
  })

  it('sorts by column when a header is clicked', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    // Click the "Value" column header (default sort is current_value desc, switching to asc)
    const valueHeader = screen.getByRole('columnheader', { name: /Value/ })
    fireEvent.click(valueHeader)
    // After clicking Value column a second time the sort direction should flip
    expect(valueHeader).toHaveAttribute('aria-sort', 'ascending')
  })

  it('renders institution names', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('Fidelity')).toBeInTheDocument()
    expect(screen.getByText('Schwab')).toBeInTheDocument()
  })

  it('renders the table title "Accounts"', () => {
    render(<InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} />)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
  })
})
