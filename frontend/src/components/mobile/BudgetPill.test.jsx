import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetPill from './BudgetPill.jsx'

// These tests MUST fail until BudgetPill.jsx is implemented.
// BudgetPill renders a pill with color-coded zone styling based on actual vs budgeted.

describe('BudgetPill', () => {
  // ── Zone class application ─────────────────────────────────────────────────

  it('applies safe zone class when spending is below WARNING_THRESHOLD', () => {
    const { container } = render(<BudgetPill actual={100} budgeted={500} />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/safe/i)
  })

  it('applies warning zone class when spending is at or above WARNING_THRESHOLD but under 100%', () => {
    const { container } = render(<BudgetPill actual={90} budgeted={100} />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/warning/i)
  })

  it('applies over zone class when actual exceeds budgeted', () => {
    const { container } = render(<BudgetPill actual={110} budgeted={100} />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/over/i)
  })

  it('applies no-budget zone class when budgeted is null', () => {
    const { container } = render(<BudgetPill actual={50} budgeted={null} />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/noBudget/i)
  })

  it('applies no-data zone class when both actual and budgeted are null', () => {
    const { container } = render(<BudgetPill actual={null} budgeted={null} />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/noData/i)
  })

  // ── Display text ───────────────────────────────────────────────────────────

  it('displays "---" when zone is no-data', () => {
    render(<BudgetPill actual={null} budgeted={null} />)
    expect(screen.getByText('---')).toBeInTheDocument()
  })

  it('displays formatted actual with "/ ---" when zone is no-budget', () => {
    render(<BudgetPill actual={150} budgeted={null} />)
    expect(screen.getByText(/\$150.*\/\s*---/)).toBeInTheDocument()
  })

  it('displays formatted actual and budgeted when zone is safe', () => {
    render(<BudgetPill actual={100} budgeted={500} />)
    expect(screen.getByText(/\$100.*\/.*\$500/)).toBeInTheDocument()
  })

  it('displays formatted actual and budgeted when zone is warning', () => {
    render(<BudgetPill actual={90} budgeted={100} />)
    expect(screen.getByText(/\$90.*\/.*\$100/)).toBeInTheDocument()
  })

  it('displays formatted actual and budgeted when zone is over', () => {
    render(<BudgetPill actual={110} budgeted={100} />)
    expect(screen.getByText(/\$110.*\/.*\$100/)).toBeInTheDocument()
  })

  it('displays "---" for no-data even when called with undefined props', () => {
    render(<BudgetPill />)
    expect(screen.getByText('---')).toBeInTheDocument()
  })

  // ── ARIA label ─────────────────────────────────────────────────────────────

  it('has role="status" on the pill element', () => {
    render(<BudgetPill actual={100} budgeted={500} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has a descriptive aria-label for safe zone', () => {
    render(<BudgetPill actual={100} budgeted={500} />)
    const pill = screen.getByRole('status')
    expect(pill.getAttribute('aria-label')).toMatch(/within budget/i)
  })

  it('has a descriptive aria-label for over zone', () => {
    render(<BudgetPill actual={110} budgeted={100} />)
    const pill = screen.getByRole('status')
    expect(pill.getAttribute('aria-label')).toMatch(/over budget/i)
  })

  it('has aria-label "No budget data" for no-data zone', () => {
    render(<BudgetPill actual={null} budgeted={null} />)
    const pill = screen.getByRole('status')
    expect(pill.getAttribute('aria-label')).toBe('No budget data')
  })

  // ── Size modifier ──────────────────────────────────────────────────────────

  it('applies summary size class when size="summary"', () => {
    const { container } = render(<BudgetPill actual={100} budgeted={500} size="summary" />)
    const pill = container.firstChild
    expect(pill.className).toMatch(/summary/i)
  })

  it('does not apply summary size class when size is not specified', () => {
    const { container } = render(<BudgetPill actual={100} budgeted={500} />)
    const pill = container.firstChild
    expect(pill.className).not.toMatch(/summary/i)
  })

  // ── Shimmer loading state ──────────────────────────────────────────────────
  // The prop is `loading` (not `isLoading`) per BudgetPill.propTypes.

  it('renders shimmer placeholder element when loading prop is true', () => {
    const { container } = render(<BudgetPill loading />)
    // Shimmer placeholder has a specific CSS class; verify it is present
    const shimmer = container.querySelector('[class*="pillLoading"], [class*="shimmer"]')
    expect(shimmer).not.toBeNull()
  })

  it('does not render "---" text content when loading is true', () => {
    render(<BudgetPill loading />)
    expect(screen.queryByText('---')).not.toBeInTheDocument()
  })
})
