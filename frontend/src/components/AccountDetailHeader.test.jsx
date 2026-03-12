import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AccountDetailHeader from './AccountDetailHeader.jsx'

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}))

const MOCK_ACCOUNT = {
  id: '1',
  name: 'Test 401k',
  institution: 'Fidelity',
  bucket: 'Retirement',
  last_synced_at: new Date().toISOString(),
}

const MOCK_TOTALS = {
  current_value: 250000,
  total_cost_basis: 200000,
  unrealized_gain_loss_dollars: 50000,
  unrealized_gain_loss_pct: 25.0,
  holdings_count: 15,
}

describe('AccountDetailHeader', () => {
  it('renders account name', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('Test 401k')).toBeInTheDocument()
  })

  it('renders institution name', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText(/Fidelity/)).toBeInTheDocument()
  })

  it('renders back link pointing to /investments', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    const link = screen.getByRole('link', { name: /← Investments/ })
    expect(link).toHaveAttribute('href', '/investments')
  })

  it('renders CURRENT VALUE metric label', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('CURRENT VALUE')).toBeInTheDocument()
  })

  it('renders TOTAL RETURN metric label', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('TOTAL RETURN')).toBeInTheDocument()
  })

  it('renders COST BASIS metric label', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('COST BASIS')).toBeInTheDocument()
  })

  it('renders HOLDINGS metric label with position count', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('HOLDINGS')).toBeInTheDocument()
    expect(screen.getByText('15 positions')).toBeInTheDocument()
  })

  it('does not show stale badge when last_synced_at is recent', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('shows stale badge when last_synced_at is more than 24 hours ago', () => {
    const staleAccount = {
      ...MOCK_ACCOUNT,
      last_synced_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    }
    render(<AccountDetailHeader account={staleAccount} totals={MOCK_TOTALS} />)
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })

  it('shows N/A for null unrealized gain/loss dollars', () => {
    const totalsNoGain = {
      ...MOCK_TOTALS,
      unrealized_gain_loss_dollars: null,
      unrealized_gain_loss_pct: null,
    }
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={totalsNoGain} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders bucket badge', () => {
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={MOCK_TOTALS} />)
    expect(screen.getByText('Retirement')).toBeInTheDocument()
  })

  it('shows N/A for null cost basis', () => {
    const totalsNoBasis = {
      ...MOCK_TOTALS,
      total_cost_basis: null,
    }
    render(<AccountDetailHeader account={MOCK_ACCOUNT} totals={totalsNoBasis} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })
})
