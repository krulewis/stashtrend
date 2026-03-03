import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import RangeSelector from './RangeSelector.jsx'

const RANGES = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: null },
]

describe('RangeSelector', () => {
  it('renders a button for each range', () => {
    render(<RangeSelector ranges={RANGES} activeRange="3M" onSelect={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByText('3M')).toBeInTheDocument()
    expect(screen.getByText('6M')).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('calls onSelect with the clicked button label', () => {
    const onSelect = vi.fn()
    render(<RangeSelector ranges={RANGES} activeRange="3M" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('6M'))
    expect(onSelect).toHaveBeenCalledWith('6M')
  })

  it('calls onSelect when clicking the already-active button', () => {
    const onSelect = vi.fn()
    render(<RangeSelector ranges={RANGES} activeRange="3M" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('3M'))
    expect(onSelect).toHaveBeenCalledWith('3M')
  })

  it('renders zero buttons for an empty ranges array', () => {
    render(<RangeSelector ranges={[]} activeRange="" onSelect={() => {}} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders without crashing when className is omitted', () => {
    render(<RangeSelector ranges={RANGES} activeRange="All" onSelect={() => {}} />)
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('accepts a custom className prop', () => {
    const { container } = render(
      <RangeSelector ranges={RANGES} activeRange="3M" onSelect={() => {}} className="custom" />
    )
    expect(container.firstChild.className).toContain('custom')
  })
})
