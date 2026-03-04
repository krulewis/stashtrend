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

  it('formats net worth as USD currency on the first card', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    // $500,000 appears only on the Net Worth Today card
    expect(screen.getByText('$500,000')).toBeInTheDocument()
  })

  it('shows delta as hero value on MoM and YoY cards', () => {
    render(<StatsCards stats={MOCK_STATS} />)
    // MoM card hero = +$5,000, YoY card hero = +$50,000
    expect(screen.getByText('+$5,000')).toBeInTheDocument()
    expect(screen.getByText('+$50,000')).toBeInTheDocument()
  })

  it('shows negative delta as hero value with minus sign', () => {
    const negStats = {
      current: { net_worth: 500000 },
      mom: { change: -5000, pct_change: -1.0 },
      yoy: { change: -50000, pct_change: -11.1 },
    }
    render(<StatsCards stats={negStats} />)
    expect(screen.getByText('-$5,000')).toBeInTheDocument()
    expect(screen.getByText('-$50,000')).toBeInTheDocument()
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
