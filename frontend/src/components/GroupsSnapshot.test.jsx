import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import GroupsSnapshot from './GroupsSnapshot.jsx'
import { MOCK_SNAPSHOT } from '../test/fixtures.js'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

describe('GroupsSnapshot', () => {
  it('shows loading message when snapshot is null', () => {
    render(<GroupsSnapshot snapshot={null} />)
    expect(screen.getByText('Loading snapshot…')).toBeInTheDocument()
  })

  it('shows empty state when snapshot array is empty', () => {
    render(<GroupsSnapshot snapshot={[]} />)
    expect(screen.getByText(/No groups defined yet/)).toBeInTheDocument()
  })

  it('renders chart title', () => {
    render(<GroupsSnapshot snapshot={MOCK_SNAPSHOT} />)
    expect(screen.getByText('Current Snapshot')).toBeInTheDocument()
  })

  it('renders bar chart when snapshot has data', () => {
    render(<GroupsSnapshot snapshot={MOCK_SNAPSHOT} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders group names in the summary table', () => {
    render(<GroupsSnapshot snapshot={MOCK_SNAPSHOT} />)
    expect(screen.getAllByText('Liquid Cash').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Debt').length).toBeGreaterThan(0)
  })

  it('renders account counts in the summary table', () => {
    render(<GroupsSnapshot snapshot={MOCK_SNAPSHOT} />)
    // The count and "acct/accts" are split across text nodes by JSX conditional rendering,
    // so we use a custom function matcher that checks the element's full textContent.
    const norm = (el) => el.textContent.replace(/\s+/g, ' ').trim()
    expect(screen.getByText((_, el) => norm(el) === '2 accts')).toBeInTheDocument()
    expect(screen.getByText((_, el) => norm(el) === '1 acct')).toBeInTheDocument()
  })

  it('shows total pill', () => {
    render(<GroupsSnapshot snapshot={MOCK_SNAPSHOT} />)
    expect(screen.getByText(/Total:/)).toBeInTheDocument()
  })
})
