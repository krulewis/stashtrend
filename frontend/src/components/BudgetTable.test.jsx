import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetTable from './BudgetTable'
import { MOCK_BUDGET_HISTORY } from '../test/fixtures'

const { months, categories } = MOCK_BUDGET_HISTORY

describe('BudgetTable', () => {
  it('renders the section title', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Category Detail')).toBeInTheDocument()
  })

  it('renders category names', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Restaurants')).toBeInTheDocument()
  })

  it('renders group header', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Food & Drink')).toBeInTheDocument()
  })

  it('renders month column headers', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText("Nov '25")).toBeInTheDocument()
    expect(screen.getByText("Dec '25")).toBeInTheDocument()
  })

  it('over-budget cells have the over class (actual > budget)', () => {
    const { container } = render(
      <BudgetTable months={months} categories={categories} />
    )
    const overCells = container.querySelectorAll('[class*="over"]')
    expect(overCells.length).toBeGreaterThan(0)
  })

  it('under-budget cells have the under class (actual < budget)', () => {
    const { container } = render(
      <BudgetTable months={months} categories={categories} />
    )
    const underCells = container.querySelectorAll('[class*="under"]')
    expect(underCells.length).toBeGreaterThan(0)
  })

  it('group header can be clicked to collapse rows', () => {
    render(<BudgetTable months={months} categories={categories} />)
    const groupHeader = screen.getByText('Food & Drink').closest('tr')
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    fireEvent.click(groupHeader)
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument()
  })

  it('returns null when no data provided', () => {
    const { container } = render(<BudgetTable months={null} categories={null} />)
    expect(container.firstChild).toBeNull()
  })
})
