import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ForecastingSummary from './ForecastingSummary.jsx'

const onTrackProps = {
  investableCapital: 300000,
  nestEgg: 1700000,
  projectedAtRetirement: 2000000,
  targetYear: 2056,
  neededContribution: 1800,
  currentContribution: 2000,
  onEditSettings: vi.fn(),
  hasSettings: true,
}

const offTrackProps = {
  ...onTrackProps,
  projectedAtRetirement: 1500000,
  neededContribution: 2500,
}

describe('ForecastingSummary', () => {
  it('renders on-track badge when projected >= nestEgg', () => {
    render(<ForecastingSummary {...onTrackProps} />)
    expect(screen.getByText('✓ On Track')).toBeInTheDocument()
  })

  it('renders off-track badge when projected < nestEgg', () => {
    render(<ForecastingSummary {...offTrackProps} />)
    expect(screen.getByText('Off Track')).toBeInTheDocument()
  })

  it('renders 4 metric cards', () => {
    render(<ForecastingSummary {...onTrackProps} />)
    expect(screen.getByText('Investable Capital Today')).toBeInTheDocument()
    expect(screen.getByText('Nest Egg Needed')).toBeInTheDocument()
    expect(screen.getByText('Projected at Retirement')).toBeInTheDocument()
    expect(screen.getByText('Target Year')).toBeInTheDocument()
  })

  it('renders gap analysis positive text when on track', () => {
    render(<ForecastingSummary {...onTrackProps} />)
    expect(screen.getByText(/ahead of your target/)).toBeInTheDocument()
  })

  it('renders gap analysis negative text when off track', () => {
    render(<ForecastingSummary {...offTrackProps} />)
    expect(screen.getByText(/more\./)).toBeInTheDocument()
  })

  it('renders setup prompt when hasSettings=false', () => {
    render(<ForecastingSummary {...onTrackProps} hasSettings={false} nestEgg={null} projectedAtRetirement={null} />)
    expect(screen.getByText(/retirement settings/)).toBeInTheDocument()
  })

  it('renders edit settings button that calls onEditSettings', () => {
    const onEditSettings = vi.fn()
    render(<ForecastingSummary {...onTrackProps} onEditSettings={onEditSettings} />)
    fireEvent.click(screen.getByText('Edit Retirement Settings'))
    expect(onEditSettings).toHaveBeenCalledTimes(1)
  })

  it("renders '—' for null metric values", () => {
    render(
      <ForecastingSummary
        {...onTrackProps}
        investableCapital={null}
        nestEgg={null}
        projectedAtRetirement={null}
        targetYear={null}
      />
    )
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })
})
