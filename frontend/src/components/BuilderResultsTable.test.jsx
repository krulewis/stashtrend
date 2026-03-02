import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BuilderResultsTable from './BuilderResultsTable.jsx'
import { MOCK_BUILDER_PLAN, MOCK_APPLY_RESULT, MOCK_APPLY_PARTIAL } from '../test/fixtures.js'

describe('BuilderResultsTable', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when plan is null', () => {
    const { container } = render(
      <BuilderResultsTable plan={null} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    expect(container.textContent).toBe('')
  })

  it('renders table with grouped categories', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    expect(screen.getByText('Food & Drink')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Restaurants')).toBeInTheDocument()
  })

  it('renders AI summary', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    expect(screen.getByText(/Budget \$5,100\/mo/i)).toBeInTheDocument()
  })

  it('renders editable cells that call onCellEdit', () => {
    const onCellEdit = vi.fn()
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={onCellEdit} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    // Find a cell with value 525 (Groceries, Apr)
    const cell = screen.getByDisplayValue('525')
    fireEvent.change(cell, { target: { value: '550' } })
    fireEvent.blur(cell)
    expect(onCellEdit).toHaveBeenCalledWith('cat_1', '2026-04-01', 550)
  })

  it('shows rationale tooltip on hover', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    const groceryRow = screen.getByText('Groceries').closest('tr')
    expect(groceryRow).toHaveAttribute('title', '6-mo avg $510 + 3% inflation')
  })

  it('calls onSavePlan when Save Plan is clicked', () => {
    const onSavePlan = vi.fn()
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={onSavePlan} onApply={vi.fn()} applyResult={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Save Plan/i }))
    expect(onSavePlan).toHaveBeenCalled()
  })

  it('shows confirmation dialog when Apply is clicked', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Apply to Monarch/i }))
    expect(screen.getByText(/Confirm Apply/i)).toBeInTheDocument()
  })

  it('shows success result after apply', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={MOCK_APPLY_RESULT} />
    )
    expect(screen.getByText(/6 applied/i)).toBeInTheDocument()
  })

  it('shows partial failure result after apply', () => {
    render(
      <BuilderResultsTable plan={MOCK_BUILDER_PLAN} historicalData={{}} loading={false}
        onCellEdit={vi.fn()} onSavePlan={vi.fn()} onApply={vi.fn()} applyResult={MOCK_APPLY_PARTIAL} />
    )
    expect(screen.getByText(/4 applied/i)).toBeInTheDocument()
    expect(screen.getByText(/2 failed/i)).toBeInTheDocument()
  })
})
