import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WindowPicker from './WindowPicker.jsx'

// months[] sorted most-recent-first, 8 months available
const MONTHS_8 = [
  '2026-03-01', '2026-02-01', '2026-01-01', '2025-12-01',
  '2025-11-01', '2025-10-01', '2025-09-01', '2025-08-01',
]

// windowStart=2 means the window covers months[2..6]:
//   months[2]='2026-01-01' (newest), months[6]='2025-09-01' (oldest)
// selectedMonthKey = months[windowStart + windowSize - 1] = months[6] = '2025-09-01'
function renderPicker(overrides = {}) {
  const defaults = {
    months: MONTHS_8,
    windowStart: 2,
    windowSize: 5,
    onWindowStartChange: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  return { ...render(<WindowPicker {...props} />), props }
}

describe('WindowPicker', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn()
  })

  it('renders trigger with role="combobox" and aria-label', () => {
    renderPicker()
    expect(screen.getByRole('combobox', { name: /select 5-month window/i })).toBeInTheDocument()
  })

  it('trigger shows the date range of the current window', () => {
    renderPicker()
    // windowStart=2, windowSize=5:
    //   oldest = months[6] = '2025-09-01' → "Sep 2025"
    //   newest = months[2] = '2026-01-01' → "Jan 2026"
    expect(screen.getByRole('combobox')).toHaveTextContent(/Sep 2025/)
    expect(screen.getByRole('combobox')).toHaveTextContent(/Jan 2026/)
  })

  it('trigger has aria-expanded=false when closed', () => {
    renderPicker()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking trigger opens the month grid panel', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('month grid renders month abbreviations for the grid year', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    // Panel opens on the year of the oldest window month (2025 for windowStart=2)
    expect(screen.getByRole('option', { name: /Jan/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dec/ })).toBeInTheDocument()
  })

  it('applies aria-selected to the oldest month in the current window', () => {
    // windowStart=2, windowSize=5: selectedMonthKey = months[6] = '2025-09-01' → Sep
    // Finding 1 fix: selection marks the OLDEST month, not months[windowStart]
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    const selectedOptions = options.filter(o => o.getAttribute('aria-selected') === 'true')
    expect(selectedOptions).toHaveLength(1)
    expect(selectedOptions[0]).toHaveTextContent('Sep')
  })

  it('clicking an available month calls onWindowStartChange with correct index', () => {
    // Finding 1 fix: handleSelect computes newStart = Math.max(0, idx - (windowSize - 1))
    // Nov 2025 is at index 4 in MONTHS_8.
    // newStart = Math.max(0, 4 - (5 - 1)) = Math.max(0, 4 - 4) = Math.max(0, 0) = 0
    // So onWindowStartChange(0) is expected.
    const onWindowStartChange = vi.fn()
    renderPicker({ windowStart: 0, onWindowStartChange })
    fireEvent.click(screen.getByRole('combobox'))
    // windowStart=0 → oldest = months[4] = '2025-11-01' → grid opens on year 2025
    const options = screen.getAllByRole('option')
    const novOption = options.find(o => o.textContent === 'Nov')
    fireEvent.click(novOption)
    expect(onWindowStartChange).toHaveBeenCalledWith(0)
  })

  it('closes the panel after selecting a month', () => {
    renderPicker({ windowStart: 0 })
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    const novOption = options.find(o => o.textContent === 'Nov')
    fireEvent.click(novOption)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('pressing Escape closes the panel without changing selection', () => {
    const onWindowStartChange = vi.fn()
    renderPicker({ onWindowStartChange })
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onWindowStartChange).not.toHaveBeenCalled()
  })

  it('months not in the available dataset have aria-disabled attribute', () => {
    // Finding 2 fix: aria-disabled="true" is present for disabled months;
    //               aria-disabled is absent (not "false") for enabled months.
    renderPicker({
      // most-recent-first: Feb 2026 is newest, Sep 2025 is oldest
      months: ['2026-02-01', '2026-01-01', '2025-12-01',
               '2025-11-01', '2025-10-01', '2025-09-01'],
      windowStart: 0,
      windowSize: 5,
    })
    fireEvent.click(screen.getByRole('combobox'))
    // Grid opens on 2025. Jan–Aug 2025 are not in the months array → disabled.
    const options = screen.getAllByRole('option')
    const janOption = options.find(o => o.textContent === 'Jan')
    expect(janOption).toHaveAttribute('aria-disabled', 'true')
    // Sep 2025 is available → aria-disabled attribute must NOT be present
    const sepOption = options.find(o => o.textContent === 'Sep')
    expect(sepOption).not.toHaveAttribute('aria-disabled')
  })

  it('closes panel when clicking outside the component', () => {
    // Finding 7: click-outside test was missing from initial plan
    renderPicker()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
