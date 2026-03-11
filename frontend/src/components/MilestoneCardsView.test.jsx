import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MilestoneCardsView from './MilestoneCardsView.jsx'

const achievedMilestone = {
  label: 'Half-Mil',
  amount: 500000,
  progress: 1,
  state: 'achieved',
  achievedDate: "Jan '24",
  projectedDate: null,
  isNestEgg: false,
}

const inProgressMilestone = {
  label: 'First Million',
  amount: 1000000,
  progress: 0.44,
  state: 'in-progress',
  achievedDate: null,
  projectedDate: "Mar '32",
  isNestEgg: false,
}

const futureMilestone = {
  label: 'Two Million',
  amount: 2000000,
  progress: 0.22,
  state: 'future',
  achievedDate: null,
  projectedDate: "Jun '40",
  isNestEgg: false,
}

const nestEggMilestone = {
  label: 'Nest Egg',
  amount: 1700000,
  progress: 0.26,
  state: 'future',
  achievedDate: null,
  projectedDate: "Dec '38",
  isNestEgg: true,
}

describe('MilestoneCardsView', () => {
  it('renders a card for each milestone', () => {
    render(<MilestoneCardsView milestones={[achievedMilestone, inProgressMilestone]} />)
    expect(screen.getByText('Half-Mil')).toBeInTheDocument()
    expect(screen.getByText('First Million')).toBeInTheDocument()
  })

  it('renders "✓ Achieved" pill for achieved state', () => {
    render(<MilestoneCardsView milestones={[achievedMilestone]} />)
    expect(screen.getByText('✓ Achieved')).toBeInTheDocument()
  })

  it('renders "◆ Next Goal" pill for in-progress state', () => {
    render(<MilestoneCardsView milestones={[inProgressMilestone]} />)
    expect(screen.getByText('◆ Next Goal')).toBeInTheDocument()
  })

  it('renders "→ In Progress" pill for future state', () => {
    render(<MilestoneCardsView milestones={[futureMilestone]} />)
    expect(screen.getByText('→ In Progress')).toBeInTheDocument()
  })

  it('renders progress bar with correct ARIA attributes', () => {
    render(<MilestoneCardsView milestones={[inProgressMilestone]} />)
    const progressbar = screen.getByRole('progressbar', { name: /First Million/ })
    expect(progressbar).toBeInTheDocument()
    expect(progressbar).toHaveAttribute('aria-valuenow', '44')
    expect(progressbar).toHaveAttribute('aria-valuemin', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders "Achieved" status line with date for achieved milestone', () => {
    render(<MilestoneCardsView milestones={[achievedMilestone]} />)
    // Multiple elements contain "Achieved" (pill + status line) — use getAllByText
    expect(screen.getAllByText(/Achieved/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Jan '24")).toBeInTheDocument()
  })

  it('renders projected date for in-progress milestone', () => {
    render(<MilestoneCardsView milestones={[inProgressMilestone]} />)
    expect(screen.getByText("Mar '32")).toBeInTheDocument()
  })

  it('renders "Set expected return for projections" nudge when no projectedDate (EC-6)', () => {
    const noProj = { ...inProgressMilestone, projectedDate: null }
    render(<MilestoneCardsView milestones={[noProj]} />)
    expect(screen.getByText(/Set expected return for projections/)).toBeInTheDocument()
  })

  it('renders "Nest Egg Target" eyebrow for nest egg card', () => {
    render(<MilestoneCardsView milestones={[nestEggMilestone]} />)
    expect(screen.getByText('Nest Egg Target')).toBeInTheDocument()
  })

  it('renders "Milestone" eyebrow for user-defined milestone', () => {
    render(<MilestoneCardsView milestones={[achievedMilestone]} />)
    expect(screen.getByText('Milestone')).toBeInTheDocument()
  })

  it('renders dollar amount for each card', () => {
    render(<MilestoneCardsView milestones={[achievedMilestone]} />)
    // fmtFull formats 500000 as "$500,000"
    expect(screen.getByText('$500,000')).toBeInTheDocument()
  })

  it('renders percentage for non-achieved milestones', () => {
    render(<MilestoneCardsView milestones={[inProgressMilestone]} />)
    expect(screen.getByText('44%')).toBeInTheDocument()
  })

  it('renders checkmark SVG (aria-hidden) for achieved milestone', () => {
    const { container } = render(<MilestoneCardsView milestones={[achievedMilestone]} />)
    const svg = container.querySelector('svg[aria-hidden="true"]')
    expect(svg).toBeInTheDocument()
  })

  it('renders empty grid with no milestones', () => {
    const { container } = render(<MilestoneCardsView milestones={[]} />)
    // Grid renders but is empty
    expect(container.firstChild).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
