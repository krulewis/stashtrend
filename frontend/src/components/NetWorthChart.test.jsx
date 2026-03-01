import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import NetWorthChart from './NetWorthChart.jsx'
import { MOCK_HISTORY } from '../test/fixtures.js'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('NetWorthChart', () => {
  it('shows loading message when history is null', () => {
    render(<NetWorthChart history={null} />)
    expect(screen.getByText('Loading chart data…')).toBeInTheDocument()
  })

  it('renders chart container when history is provided', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    expect(screen.queryByText('Loading chart data…')).not.toBeInTheDocument()
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders all six range buttons', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    ;['1M', '3M', '6M', '1Y', '2Y', 'All'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('renders the assets/liabilities breakdown toggle', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    expect(screen.getByText(/Show assets \/ liabilities/)).toBeInTheDocument()
  })

  it('breakdown checkbox is unchecked by default', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
  })

  it('checking the breakdown checkbox toggles it on', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('clicking a range button does not crash', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    fireEvent.click(screen.getByText('3M'))
    fireEvent.click(screen.getByText('All'))
    // If no error was thrown and chart is still present, the test passes
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders chart title', () => {
    render(<NetWorthChart history={MOCK_HISTORY} />)
    expect(screen.getByText('Net Worth Over Time')).toBeInTheDocument()
  })
})
