import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetGroup from './BudgetGroup.jsx'

// BudgetGroup renders a collapsible group header with an aggregate BudgetPill
// and, when expanded, a list of BudgetLineItem children.
// Collapse/expand is CSS-only (grid-template-rows), so category elements are
// always in the DOM — tests check aria-expanded and class names, not DOM presence.

// Minimal category items for testing
const ITEMS = [
  { category_id: 'cat_1', category_name: 'Groceries',   actual: 100, budgeted: 500 },
  { category_id: 'cat_2', category_name: 'Restaurants', actual: 90,  budgeted: 100 },
]

const ITEMS_TOTALS = {
  actual:   190,   // sum of all actual values
  budgeted: 600,   // sum of all budgeted values
}

function renderGroup(props = {}) {
  return render(
    <BudgetGroup
      groupName="Food"
      categories={ITEMS}
      {...props}
    />
  )
}

// Helper: get the group header element by its aria-controls attribute.
// The header div has role="button" and aria-controls="group-<name>-content".
function getGroupHeader(groupName = 'Food') {
  return screen.getByRole('button', { name: (_, el) =>
    el.getAttribute('aria-controls') === `group-${groupName}-content`
  })
}

describe('BudgetGroup', () => {
  // ── Initial render (collapsed) ─────────────────────────────────────────────

  it('renders the group name in the header', () => {
    renderGroup()
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('is collapsed by default — aria-expanded is false', () => {
    renderGroup()
    const header = getGroupHeader()
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders an aggregate pill in the header when collapsed', () => {
    renderGroup()
    // The header pill is the first role="status" element in the header div
    const header = getGroupHeader()
    const pill = header.querySelector('[role="status"]')
    expect(pill).not.toBeNull()
  })

  // ── Expand on click ────────────────────────────────────────────────────────

  it('expands when header is clicked — aria-expanded becomes true', () => {
    renderGroup()
    const header = getGroupHeader()
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('category names are in the DOM (CSS-only collapse)', () => {
    renderGroup()
    // Content is always rendered; CSS grid hides it when collapsed
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Restaurants')).toBeInTheDocument()
  })

  it('collapses again when header is clicked a second time', () => {
    renderGroup()
    const header = getGroupHeader()
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  // ── Aggregate pill totals ──────────────────────────────────────────────────

  it('passes summed actual and budgeted to the aggregate pill', () => {
    renderGroup()
    const header = getGroupHeader()
    const pill = header.querySelector('[role="status"]')
    const label = pill.getAttribute('aria-label') || ''
    // The aggregate pill reflects $190 actual and $600 budgeted
    expect(label.length).toBeGreaterThan(0)
    expect(label).toMatch(/190/)
    expect(label).toMatch(/600/)
  })

  // ── Chevron rotation ───────────────────────────────────────────────────────

  it('chevron element exists in the header', () => {
    const { container } = renderGroup()
    const chevron = container.querySelector('[class*="chevron"]')
    expect(chevron).not.toBeNull()
  })

  it('chevron has expanded class after header click', () => {
    const { container } = renderGroup()
    const header = getGroupHeader()
    fireEvent.click(header)
    const chevron = container.querySelector('[class*="chevron"]')
    expect(chevron.className).toMatch(/open|active|expanded/i)
  })

  it('chevron does not have open class before clicking', () => {
    const { container } = renderGroup()
    // The first chevron element is the group header chevron
    const chevron = container.querySelector('[class*="chevron"]')
    expect(chevron.className).not.toMatch(/open|active|expanded/i)
  })

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('header button has aria-expanded="false" when collapsed', () => {
    renderGroup()
    const header = getGroupHeader()
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('header button has aria-expanded="true" when expanded', () => {
    renderGroup()
    const header = getGroupHeader()
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('renders with an empty categories array without crashing', () => {
    render(<BudgetGroup groupName="Empty" categories={[]} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('shows no category rows when categories list is empty', () => {
    const { container } = render(<BudgetGroup groupName="Empty" categories={[]} />)
    // No BudgetLineItem rows should be rendered
    const rows = container.querySelectorAll('[class*="row"]')
    expect(rows.length).toBe(0)
  })
})
