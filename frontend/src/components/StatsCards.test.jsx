import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatsCards from './StatsCards.jsx'
import { MOCK_STATS } from '../test/fixtures.js'

describe('StatsCards', () => {
  it('renders skeleton placeholder cards when stats is null', () => {
    render(<StatsCards stats={null} />)
    // Labels only appear when real data is loaded
    expect(screen.queryByText('Net Worth Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Month-over-Month')).not.toBeInTheDocument()
    expect(screen.queryByText('Year-over-Year')).not.toBeInTheDocument()
  })

  it('renders all three card labels when stats is provided', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    expect(screen.getByText('Net Worth Today')).toBeInTheDocument()
    expect(screen.getByText('Month-over-Month')).toBeInTheDocument()
    expect(screen.getByText('Year-over-Year')).toBeInTheDocument()
  })

  it('formats net worth as USD currency', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    // $500,000 appears in all three cards (current net worth)
    expect(screen.getAllByText('$500,000').length).toBeGreaterThanOrEqual(1)
  })

  it('shows upward arrow for positive MoM and YoY changes', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    const arrows = screen.getAllByText('▲')
    expect(arrows.length).toBe(2) // one for MoM, one for YoY
  })

  it('shows downward arrow for negative changes', () => {
    const negStats = {
      current: { net_worth: 500000 },
      mom: { change: -5000, pct_change: -1.0 },
      yoy: { change: -50000, pct_change: -11.1 },
    }
    render(<StatsCards stats={negStats} />)
    const arrows = screen.getAllByText('▼')
    expect(arrows.length).toBe(2)
  })

  it('shows "vs last month" and "vs last year" sublabels', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    expect(screen.getByText(/vs last month/)).toBeInTheDocument()
    expect(screen.getByText(/vs last year/)).toBeInTheDocument()
  })

  it('shows formatted percentage change', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    expect(screen.getByText(/\+1\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/\+11\.1%/)).toBeInTheDocument()
  })
})
