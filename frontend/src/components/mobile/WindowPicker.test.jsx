import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import WindowPicker from './WindowPicker.jsx'

const DISPLAY_MONTHS_6 = [
  '2025-10-01', '2025-11-01', '2025-12-01',
  '2026-01-01', '2026-02-01', '2026-03-01',
]

function renderPicker(overrides = {}) {
  const defaults = {
    displayMonths: DISPLAY_MONTHS_6,
    canGoOlder: true,
    canGoNewer: true,
    onGoOlder: vi.fn(),
    onGoNewer: vi.fn(),
    hidden: false,
  }
  const props = { ...defaults, ...overrides }
  return { ...render(<WindowPicker {...props} />), props }
}

describe('WindowPicker', () => {
  it('renders nothing when hidden=true', () => {
    const { container } = renderPicker({ hidden: true })
    expect(container.firstChild).toBeNull()
  })

  it('renders 6 month labels when hidden=false', () => {
    renderPicker()
    expect(screen.getByText('Oct 25')).toBeInTheDocument()
    expect(screen.getByText('Nov 25')).toBeInTheDocument()
    expect(screen.getByText('Dec 25')).toBeInTheDocument()
    expect(screen.getByText('Jan 26')).toBeInTheDocument()
    expect(screen.getByText('Feb 26')).toBeInTheDocument()
    expect(screen.getByText('Mar 26')).toBeInTheDocument()
  })

  it('renders displayMonths in left-to-right (oldest-first) order', () => {
    renderPicker()
    const labels = screen.getAllByText(/\w{3} \d{2}/)
    const texts = labels.map(el => el.textContent)
    expect(texts).toEqual(['Oct 25', 'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26'])
  })

  it('left arrow (older) button is disabled when canGoOlder=false', () => {
    renderPicker({ canGoOlder: false })
    expect(screen.getByLabelText('Show older months')).toBeDisabled()
  })

  it('right arrow (newer) button is disabled when canGoNewer=false', () => {
    renderPicker({ canGoNewer: false })
    expect(screen.getByLabelText('Show newer months')).toBeDisabled()
  })

  it('left arrow click calls onGoOlder', () => {
    const onGoOlder = vi.fn()
    const onGoNewer = vi.fn()
    renderPicker({ canGoOlder: true, onGoOlder, onGoNewer })
    fireEvent.click(screen.getByLabelText('Show older months'))
    expect(onGoOlder).toHaveBeenCalledOnce()
    expect(onGoNewer).not.toHaveBeenCalled()
  })

  it('right arrow click calls onGoNewer', () => {
    const onGoOlder = vi.fn()
    const onGoNewer = vi.fn()
    renderPicker({ canGoNewer: true, onGoOlder, onGoNewer })
    fireEvent.click(screen.getByLabelText('Show newer months'))
    expect(onGoNewer).toHaveBeenCalledOnce()
    expect(onGoOlder).not.toHaveBeenCalled()
  })

  it('both arrows enabled when canGoOlder and canGoNewer are both true', () => {
    renderPicker({ canGoOlder: true, canGoNewer: true })
    expect(screen.getByLabelText('Show older months')).not.toBeDisabled()
    expect(screen.getByLabelText('Show newer months')).not.toBeDisabled()
  })

  it('left arrow is not clickable when disabled (canGoOlder=false)', () => {
    const onGoOlder = vi.fn()
    renderPicker({ canGoOlder: false, onGoOlder })
    fireEvent.click(screen.getByLabelText('Show older months'))
    expect(onGoOlder).not.toHaveBeenCalled()
  })

  it('right arrow is not clickable when disabled (canGoNewer=false)', () => {
    const onGoNewer = vi.fn()
    renderPicker({ canGoNewer: false, onGoNewer })
    fireEvent.click(screen.getByLabelText('Show newer months'))
    expect(onGoNewer).not.toHaveBeenCalled()
  })
})
