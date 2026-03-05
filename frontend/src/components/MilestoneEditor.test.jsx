import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MilestoneEditor from './MilestoneEditor.jsx'

describe('MilestoneEditor', () => {
  it('renders empty state when milestones is empty', () => {
    render(<MilestoneEditor milestones={[]} onChange={() => {}} />)
    expect(screen.getByText(/no milestones yet/i)).toBeTruthy()
  })

  it('renders one row per milestone', () => {
    const ms = [
      { label: 'Half-Mil', amount: 500000 },
      { label: 'First Million', amount: 1000000 },
    ]
    render(<MilestoneEditor milestones={ms} onChange={() => {}} />)
    expect(screen.getAllByLabelText(/milestone \d+ amount/i)).toHaveLength(2)
  })

  it('clicking "+ Add" calls onChange with new item appended', () => {
    const onChange = vi.fn()
    render(<MilestoneEditor milestones={[{ label: 'A', amount: 100 }]} onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add'))
    expect(onChange).toHaveBeenCalledWith([
      { label: 'A', amount: 100 },
      { amount: '', label: '' },
    ])
  })

  it('clicking remove calls onChange with that item removed', () => {
    const onChange = vi.fn()
    const ms = [
      { label: 'A', amount: 100 },
      { label: 'B', amount: 200 },
    ]
    render(<MilestoneEditor milestones={ms} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Remove milestone 1'))
    expect(onChange).toHaveBeenCalledWith([{ label: 'B', amount: 200 }])
  })

  it('editing amount calls onChange with updated value', () => {
    const onChange = vi.fn()
    render(<MilestoneEditor milestones={[{ label: 'A', amount: 100 }]} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Milestone 1 amount'), { target: { value: '999' } })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0][0][0].amount).toBe('999')
  })

  it('editing label calls onChange with updated value', () => {
    const onChange = vi.fn()
    render(<MilestoneEditor milestones={[{ label: 'A', amount: 100 }]} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Milestone 1 label'), { target: { value: 'New Label' } })
    expect(onChange.mock.calls[0][0][0].label).toBe('New Label')
  })

  it('add button is disabled when milestones.length >= 20', () => {
    const ms = Array.from({ length: 20 }, (_, i) => ({ label: `M${i}`, amount: i * 100 }))
    render(<MilestoneEditor milestones={ms} onChange={() => {}} />)
    expect(screen.getByText('+ Add').disabled).toBe(true)
  })

  it('has info tooltip with correct aria-label', () => {
    render(<MilestoneEditor milestones={[]} onChange={() => {}} />)
    expect(screen.getByLabelText('Milestone info')).toBeTruthy()
  })
})
