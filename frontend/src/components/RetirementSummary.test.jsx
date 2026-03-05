import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RetirementSummary from './RetirementSummary.jsx'

describe('RetirementSummary', () => {
  it('renders without crashing when all props are null', () => {
    render(<RetirementSummary />)
    expect(screen.getByTestId('retirement-summary')).toBeTruthy()
  })

  it('shows dash for nestEgg when null', () => {
    render(<RetirementSummary nestEgg={null} />)
    expect(screen.getByTestId('nest-egg-value').textContent).toBe('—')
  })

  it('shows formatted dollar amount for nestEgg', () => {
    render(<RetirementSummary nestEgg={1700000} />)
    expect(screen.getByTestId('nest-egg-value').textContent).toContain('1,700,000')
  })

  it('shows dash for projectedAtRetirement when null', () => {
    render(<RetirementSummary projectedAtRetirement={null} />)
    expect(screen.getByTestId('projected-value').textContent).toBe('—')
  })

  it('shows formatted projectedAtRetirement when provided', () => {
    render(<RetirementSummary projectedAtRetirement={2500000} />)
    expect(screen.getByTestId('projected-value').textContent).toContain('2,500,000')
  })

  it('shows target year when provided', () => {
    render(<RetirementSummary targetYear={2056} />)
    expect(screen.getByTestId('target-year').textContent).toBe('2056')
  })

  it('shows On Track when projected >= nestEgg', () => {
    render(<RetirementSummary nestEgg={1700000} projectedAtRetirement={2000000} />)
    expect(screen.getByTestId('track-badge').textContent).toBe('On Track')
  })

  it('shows Off Track when projected < nestEgg', () => {
    render(<RetirementSummary nestEgg={1700000} projectedAtRetirement={1000000} />)
    expect(screen.getByTestId('track-badge').textContent).toBe('Off Track')
  })
})
