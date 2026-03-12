import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the hook
vi.mock('../hooks/useMilestoneData.js', () => ({
  useMilestoneData: vi.fn(),
}))

// Mock child views
vi.mock('./MilestoneCardsView.jsx', () => ({
  default: () => <div data-testid="milestone-cards-view" />,
}))
vi.mock('./MilestoneSkylineView.jsx', () => ({
  default: () => <div data-testid="milestone-skyline-view" />,
}))

import { useMilestoneData } from '../hooks/useMilestoneData.js'
import MilestoneHeroCard from './MilestoneHeroCard.jsx'

const NOT_READY = {
  shouldRender: false,
  investableCapital: 0,
  rawInvestableCapital: 0,
  investableSeries: [],
  milestones: [],
  achievedCount: 0,
  totalCount: 0,
  projectionSeries: null,
  mergedSeries: [],
  nestEgg: null,
}

function makeReadyData(overrides = {}) {
  return {
    shouldRender: true,
    investableCapital: 440000,
    rawInvestableCapital: 440000,
    investableSeries: [],
    milestones: [
      { label: 'Half-Mil', amount: 500000, progress: 0.88, state: 'in-progress', achievedDate: null, projectedDate: "Jan '28", isNestEgg: false },
      { label: 'First Million', amount: 1000000, progress: 0.44, state: 'future', achievedDate: null, projectedDate: "Mar '32", isNestEgg: false },
    ],
    achievedCount: 1,
    totalCount: 2,
    projectionSeries: [{ date: '2026-01-01', projected_net_worth: 500000 }],
    mergedSeries: [],
    nestEgg: 1700000,
    ...overrides,
  }
}

describe('MilestoneHeroCard', () => {
  const defaultProps = {
    typeData: { series: [{ date: '2026-01-01', Retirement: 240000, Brokerage: 200000 }] },
    retirement: { exists: true, milestones: [{ label: 'Half-Mil', amount: 500000 }] },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null when shouldRender is false (EC-1, EC-2)', () => {
    useMilestoneData.mockReturnValue(NOT_READY)
    const { container } = render(<MilestoneHeroCard {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when retirement.exists is false', () => {
    useMilestoneData.mockReturnValue(NOT_READY)
    const { container } = render(
      <MilestoneHeroCard typeData={defaultProps.typeData} retirement={{ exists: false }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders hero card when shouldRender is true', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.getByTestId('milestone-hero-card')).toBeInTheDocument()
  })

  it('renders "Milestones" title', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.getByText('Milestones')).toBeInTheDocument()
  })

  it('renders "Investable Capital" eyebrow label', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.getByText('Investable Capital')).toBeInTheDocument()
  })

  it('renders count badge "1 of 2 achieved"', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.getByText('1 of 2 achieved')).toBeInTheDocument()
  })

  it('shows MilestoneCardsView by default (activeView=0)', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.getByTestId('milestone-cards-view')).toBeInTheDocument()
    expect(screen.queryByTestId('milestone-skyline-view')).not.toBeInTheDocument()
  })

  it('does not show MilestoneSkylineView by default', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    expect(screen.queryByTestId('milestone-skyline-view')).not.toBeInTheDocument()
  })

  it('clicking "Chart" button shows MilestoneSkylineView, hides MilestoneCardsView', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.queryByTestId('milestone-cards-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('milestone-skyline-view')).toBeInTheDocument()
  })

  it('clicking "Cards" button after switching to chart restores MilestoneCardsView', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(screen.getByTestId('milestone-cards-view')).toBeInTheDocument()
    expect(screen.queryByTestId('milestone-skyline-view')).not.toBeInTheDocument()
  })

  it('toggle buttons have correct aria-pressed attributes', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    const cardsBtn = screen.getByRole('button', { name: 'Cards' })
    const chartBtn = screen.getByRole('button', { name: 'Chart' })
    expect(cardsBtn).toHaveAttribute('aria-pressed', 'true')
    expect(chartBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('active button has aria-pressed="true", inactive has aria-pressed="false"', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pressing ArrowRight on "Cards" button switches to Chart view', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    const cardsBtn = screen.getByRole('button', { name: 'Cards' })
    fireEvent.keyDown(cardsBtn, { key: 'ArrowRight' })
    expect(screen.queryByTestId('milestone-cards-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('milestone-skyline-view')).toBeInTheDocument()
  })

  it('pressing ArrowLeft on "Chart" button switches to Cards view', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    const chartBtn = screen.getByRole('button', { name: 'Chart' })
    fireEvent.keyDown(chartBtn, { key: 'ArrowLeft' })
    expect(screen.getByTestId('milestone-cards-view')).toBeInTheDocument()
    expect(screen.queryByTestId('milestone-skyline-view')).not.toBeInTheDocument()
  })

  it('section has aria-labelledby pointing to title id', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    const section = screen.getByTestId('milestone-hero-card')
    expect(section).toHaveAttribute('aria-labelledby', 'milestone-hero-title')
    const title = document.getElementById('milestone-hero-title')
    expect(title).toBeInTheDocument()
    expect(title.textContent).toBe('Milestones')
  })

  it('view panels have role="region"', () => {
    useMilestoneData.mockReturnValue(makeReadyData())
    render(<MilestoneHeroCard {...defaultProps} />)
    const regions = screen.getAllByRole('region')
    expect(regions.length).toBeGreaterThanOrEqual(1)
  })
})
