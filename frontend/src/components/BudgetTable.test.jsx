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
    const overCells = container.querySelectorAll('span[class*="over"]')
    expect(overCells.length).toBeGreaterThan(0)
  })

  it('under-budget expense cells have the under class (actual < budget)', () => {
    const { container } = render(
      <BudgetTable months={months} categories={categories} />
    )
    const underCells = container.querySelectorAll('span[class*="under"]')
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

  describe('progress bars', () => {
    it('renders a progressbar for over-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBeGreaterThan(0)
    })

    it('renders a progressbar for under-budget expense cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      // Groceries Dec: 489/500 = 97.8% → Math.round = 98
      const bar = container.querySelector('[role="progressbar"][aria-valuenow="98"]')
      expect(bar).toBeTruthy()
    })

    it('does not render a progressbar for income cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const paycheckRow = screen.getByText('Paycheck').closest('tr')
      const bars = paycheckRow.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBe(0)
    })

    it('does not render a progressbar when budgeted is null', () => {
      const sparseCategories = [
        {
          category_id: 'cat_sparse',
          category_name: 'Sparse',
          group_name: 'Other',
          group_type: 'expense',
          months: {
            '2025-11-01': { budgeted: 200, actual: 100, variance: 100 },
            // '2025-12-01' deliberately missing
          },
        },
      ]
      const { container } = render(
        <BudgetTable months={months} categories={sparseCategories} />
      )
      const allBars = container.querySelectorAll('[role="progressbar"]')
      expect(allBars.length).toBe(1)
    })

    it('bar width is capped at 100% for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(overBars).find(
        el => el.getAttribute('aria-label')?.includes('105')
      )
      expect(groceriesNovBar).toBeTruthy()
      expect(groceriesNovBar.style.width).toBe('100%')
    })

    it('bar width reflects actual spend percentage for under-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const bar = container.querySelector('[role="progressbar"][aria-valuenow="98"]')
      expect(bar).toBeTruthy()
      expect(bar.style.width).toBe('98%')
    })

    it('applies barOver class for over-budget cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      expect(overBars.length).toBeGreaterThan(0)
    })

    it('applies barWarn class for 85–100% spend cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const warnBars = container.querySelectorAll('[role="progressbar"][class*="barWarn"]')
      expect(warnBars.length).toBeGreaterThan(0)
    })

    it('applies barSafe class for under 85% spend cells', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const safeBars = container.querySelectorAll('[role="progressbar"][class*="barSafe"]')
      expect(safeBars.length).toBeGreaterThan(0)
    })

    it('ARIA attributes are correct on progressbar elements', () => {
      const { container } = render(<BudgetTable months={months} categories={categories} />)
      const overBars = container.querySelectorAll('[role="progressbar"][class*="barOver"]')
      const groceriesNovBar = Array.from(overBars).find(
        el => el.getAttribute('aria-label')?.includes('105')
      )
      expect(groceriesNovBar).toBeTruthy()
      expect(groceriesNovBar.getAttribute('aria-valuenow')).toBe('100')
      expect(groceriesNovBar.getAttribute('aria-valuemin')).toBe('0')
      expect(groceriesNovBar.getAttribute('aria-valuemax')).toBe('100')
      expect(groceriesNovBar.getAttribute('aria-label')).toMatch(/105% of budget spent/)
    })

    it('does not render a progressbar when budgeted is zero', () => {
      const zeroCategories = [
        {
          category_id: 'cat_zero',
          category_name: 'Unbudgeted',
          group_name: 'Other',
          group_type: 'expense',
          months: {
            '2025-11-01': { budgeted: 0, actual: 50, variance: -50 },
          },
        },
      ]
      const { container } = render(
        <BudgetTable months={months} categories={zeroCategories} />
      )
      const bars = container.querySelectorAll('[role="progressbar"]')
      expect(bars.length).toBe(0)
    })
  })
})
