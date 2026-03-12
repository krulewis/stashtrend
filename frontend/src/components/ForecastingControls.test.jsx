import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ForecastingControls from './ForecastingControls.jsx'

const defaultProps = {
  contribution: 2000,
  returnRate: 7.0,
  onContributionChange: vi.fn(),
  onReturnRateChange: vi.fn(),
  onReset: vi.fn(),
  contributionMax: 10000,
  defaultsNote: null,
  cagrWarning: null,
}

describe('ForecastingControls', () => {
  it('renders "Monthly Contribution" slider label', () => {
    render(<ForecastingControls {...defaultProps} />)
    expect(screen.getByText('Monthly Contribution')).toBeInTheDocument()
  })

  it('renders "Annual Return Rate" slider label', () => {
    render(<ForecastingControls {...defaultProps} />)
    expect(screen.getByText('Annual Return Rate')).toBeInTheDocument()
  })

  it('renders reset button that calls onReset when clicked', () => {
    const onReset = vi.fn()
    render(<ForecastingControls {...defaultProps} onReset={onReset} />)
    fireEvent.click(screen.getByText('Reset'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders defaults note when provided', () => {
    const note = 'Based on your 3-year CAGR of 8.2%'
    render(<ForecastingControls {...defaultProps} defaultsNote={note} />)
    expect(screen.getByText(note)).toBeInTheDocument()
  })

  it('renders CAGR warning when provided', () => {
    const warning = 'Your return rate differs significantly from your historical CAGR.'
    render(<ForecastingControls {...defaultProps} cagrWarning={warning} />)
    expect(screen.getByText(warning)).toBeInTheDocument()
  })

  it('does not render defaults note when null', () => {
    render(<ForecastingControls {...defaultProps} defaultsNote={null} />)
    // No note paragraph should appear — verify by checking text is absent
    expect(screen.queryByText(/CAGR/)).not.toBeInTheDocument()
  })
})
