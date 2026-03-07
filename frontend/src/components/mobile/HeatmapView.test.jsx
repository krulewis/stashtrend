import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import HeatmapView from './HeatmapView.jsx'

const MONTHS_8 = [
  '2026-03-01', '2026-02-01', '2026-01-01', '2025-12-01',
  '2025-11-01', '2025-10-01', '2025-09-01', '2025-08-01',
]

const CATEGORIES = [
  {
    category_id: 'c1', category_name: 'Groceries', group_type: 'expense',
    group_name: 'Food',
    months: {
      '2026-01-01': { actual: 100, budgeted: 500 },
      '2026-02-01': { actual: 430, budgeted: 500 },
      '2026-03-01': { actual: 510, budgeted: 500 },
    },
  },
  {
    category_id: 'c2', category_name: 'Restaurants', group_type: 'expense',
    group_name: 'Food',
    months: { '2026-01-01': { actual: 90, budgeted: 100 } },
  },
  {
    category_id: 'c3', category_name: 'Salary', group_type: 'income',
    group_name: 'Income', months: {},
  },
  {
    category_id: 'c4', category_name: 'Rent', group_type: 'expense',
    group_name: 'Housing',
    months: { '2026-02-01': { actual: 1500, budgeted: 2000 } },
  },
]

const CUSTOM_GROUPS = {}

function renderHeatmap(props = {}) {
  const defaults = {
    categories: CATEGORIES,
    customGroups: CUSTOM_GROUPS,
    months: MONTHS_8,
  }
  return render(<HeatmapView {...{ ...defaults, ...props }} />)
}

describe('HeatmapView', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn()
  })

  it('renders the grid with role="grid"', () => {
    renderHeatmap()
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })

  it('renders column headers with role="columnheader"', () => {
    renderHeatmap()
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(6)
  })

  it('renders one row per expense group (excludes income)', () => {
    renderHeatmap()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Housing')).toBeInTheDocument()
    expect(screen.queryByText('Income')).not.toBeInTheDocument()
  })

  it('all groups start collapsed (aria-expanded=false on rowheader cells)', () => {
    renderHeatmap()
    const rowheaders = screen.getAllByRole('rowheader')
    const groupHeaders = rowheaders.filter(el => el.hasAttribute('aria-expanded'))
    expect(groupHeaders.length).toBeGreaterThanOrEqual(2)
    groupHeaders.forEach(header => {
      expect(header.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('clicking group rowheader toggles aria-expanded to true', () => {
    renderHeatmap()
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    fireEvent.click(groupHeaders[0])
    expect(groupHeaders[0].getAttribute('aria-expanded')).toBe('true')
  })

  it('clicking expanded group rowheader collapses it (aria-expanded back to false)', () => {
    renderHeatmap()
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    fireEvent.click(groupHeaders[0])
    expect(groupHeaders[0].getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(groupHeaders[0])
    expect(groupHeaders[0].getAttribute('aria-expanded')).toBe('false')
  })

  it('category rows are in DOM even when collapsed (CSS-only collapse)', () => {
    renderHeatmap()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
  })

  it('renders WindowPicker when months.length > 6', () => {
    renderHeatmap()
    expect(screen.getByRole('combobox', { name: /select 6-month window/i })).toBeInTheDocument()
  })

  it('renders WindowPicker even when months.length <= 6', () => {
    renderHeatmap({ months: MONTHS_8.slice(0, 5) })
    expect(screen.getByRole('combobox', { name: /select 6-month window/i })).toBeInTheDocument()
  })

  it('dot has correct aria-label for safe zone category', () => {
    renderHeatmap()
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    fireEvent.click(groupHeaders[0])
    const safeDot = screen.getByLabelText(/Groceries.*January 2026.*within budget/i)
    expect(safeDot).toBeInTheDocument()
  })

  it('dot has correct aria-label for no-data month', () => {
    renderHeatmap()
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    fireEvent.click(groupHeaders[0])
    const noDataDot = screen.getByLabelText(/Restaurants.*February 2026.*no data/i)
    expect(noDataDot).toBeInTheDocument()
  })

  it('dot has correct aria-label for no-budget category', () => {
    const noBudgetCategories = [
      ...CATEGORIES,
      {
        category_id: 'c5', category_name: 'Misc', group_type: 'expense',
        group_name: 'Other',
        months: { '2026-02-01': { actual: 75, budgeted: null } },
      },
    ]
    renderHeatmap({ categories: noBudgetCategories })
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    // Find the "Other" group and expand it
    const otherHeader = groupHeaders.find(el => el.textContent.includes('Other'))
    fireEvent.click(otherHeader)
    const noBudgetDot = screen.getByLabelText(/Misc.*February 2026.*spent, no budget set/i)
    expect(noBudgetDot).toBeInTheDocument()
  })

  it('renders "No expense groups to display" when categories is empty', () => {
    renderHeatmap({ categories: [] })
    expect(screen.getByText(/No expense groups to display/i)).toBeInTheDocument()
  })

  it('group header aggregate dot accounts for both categories in Food group', () => {
    renderHeatmap()
    // In Jan 2026: c1 actual=100 budget=500, c2 actual=90 budget=100
    // Total actual=190, total budgeted=600 -> ratio=0.317 -> 'safe' -> "within budget"
    const aggregateDot = screen.getByLabelText(/Food.*January 2026.*within budget/i)
    expect(aggregateDot).toBeInTheDocument()
  })

  it('renders the legend with 5 items', () => {
    renderHeatmap()
    const legend = screen.getByRole('group', { name: /dot color legend/i })
    expect(legend).toBeInTheDocument()
    expect(screen.getByText('Under 85%')).toBeInTheDocument()
    expect(screen.getByText('85 \u2013 100%')).toBeInTheDocument()
    expect(screen.getByText('Over 100%')).toBeInTheDocument()
    expect(screen.getByText('No budget')).toBeInTheDocument()
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('legend is always visible regardless of group expand state', () => {
    renderHeatmap()
    expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
    const groupHeaders = screen.getAllByRole('rowheader')
      .filter(el => el.hasAttribute('aria-expanded'))
    fireEvent.click(groupHeaders[0])
    expect(screen.getByRole('group', { name: /dot color legend/i })).toBeInTheDocument()
  })
})
