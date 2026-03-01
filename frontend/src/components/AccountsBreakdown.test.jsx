import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AccountsBreakdown from './AccountsBreakdown.jsx'
import { MOCK_ACCOUNTS } from '../test/fixtures.js'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('AccountsBreakdown', () => {
  it('shows loading message when accounts is null', () => {
    render(<AccountsBreakdown accounts={null} />)
    expect(screen.getByText('Loading accounts…')).toBeInTheDocument()
  })

  it('renders the section title when accounts are provided', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    expect(screen.getByText('Account Breakdown')).toBeInTheDocument()
  })

  it('renders Assets and Liabilities section labels', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    expect(screen.getByText('Assets')).toBeInTheDocument()
    expect(screen.getByText('Liabilities')).toBeInTheDocument()
  })

  it('renders asset account type groups', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    // MOCK_ACCOUNTS has checking, savings, investment as assets
    expect(screen.getByText('checking')).toBeInTheDocument()
    expect(screen.getByText('savings')).toBeInTheDocument()
    expect(screen.getByText('investment')).toBeInTheDocument()
  })

  it('renders liability account type groups', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    expect(screen.getByText('mortgage')).toBeInTheDocument()
  })

  it('expands an account group to show individual accounts on click', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    // Account names are hidden until the group is expanded
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('checking'))
    expect(screen.getByText('Checking')).toBeInTheDocument()
  })

  it('collapses an expanded group on second click', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    fireEvent.click(screen.getByText('checking'))
    expect(screen.getByText('Checking')).toBeInTheDocument()
    fireEvent.click(screen.getByText('checking'))
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
  })

  it('shows institution name inside expanded group', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    fireEvent.click(screen.getByText('checking'))
    expect(screen.getByText('Chase')).toBeInTheDocument()
  })

  it('displays liabilities section total as a positive absolute value', () => {
    render(<AccountsBreakdown accounts={MOCK_ACCOUNTS} />)
    // MOCK_ACCOUNTS mortgage has current_balance: -200000; section total must be $200,000 (abs), not -$200,000
    expect(screen.getByText('$200,000')).toBeInTheDocument()
  })
})
