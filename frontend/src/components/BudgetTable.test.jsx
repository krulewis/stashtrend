import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetTable from './BudgetTable.jsx'
import { MOCK_BUDGET_HISTORY } from '../test/fixtures.js'

const { months, categories } = MOCK_BUDGET_HISTORY

describe('BudgetTable', () => {
  it('renders the section title', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Category Detail')).toBeInTheDocument()
  })

  it('renders month column headers', () => {
    render(<BudgetTable months={months} categories={categories} />)
    // Headers appear in both summary and detail tables
    expect(screen.getAllByText("Nov '25").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Dec '25").length).toBeGreaterThan(0)
  })

  it('renders actual / budget sub-label in column headers', () => {
    render(<BudgetTable months={months} categories={categories} />)
    const subLabels = screen.getAllByText('actual / budget')
    expect(subLabels.length).toBeGreaterThan(0)
  })

  it('renders Income section header', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Income')).toBeInTheDocument()
  })

  it('renders Expenses section header', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Expenses')).toBeInTheDocument()
  })

  it('renders income category name', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Paycheck')).toBeInTheDocument()
  })

  it('renders expense category names', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Restaurants')).toBeInTheDocument()
  })

  it('renders expense group header', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Food & Drink')).toBeInTheDocument()
  })

  it('renders Total Income row', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Total Income')).toBeInTheDocument()
  })

  it('renders Total Expenses row', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Total Expenses')).toBeInTheDocument()
  })

  it('renders Net row', () => {
    render(<BudgetTable months={months} categories={categories} />)
    expect(screen.getByText('Net')).toBeInTheDocument()
  })

  it('over-budget expense cells have the over class (actual > budget)', () => {
    const { container } = render(
      <BudgetTable months={months} categories={categories} />
    )
    const overCells = container.querySelectorAll('[class*="over"]')
    expect(overCells.length).toBeGreaterThan(0)
  })

  it('under-budget expense cells have the under class (actual < budget)', () => {
    const { container } = render(
      <BudgetTable months={months} categories={categories} />
    )
    const underCells = container.querySelectorAll('[class*="under"]')
    expect(underCells.length).toBeGreaterThan(0)
  })

  it('expense group header can be clicked to collapse rows', () => {
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
