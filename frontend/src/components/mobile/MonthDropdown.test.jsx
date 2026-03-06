import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import MonthDropdown from './MonthDropdown.jsx'

// These tests MUST fail until MonthDropdown.jsx is implemented.
// MonthDropdown is a combobox-pattern month selector with keyboard support.

const MONTHS = ['2025-12-01', '2025-11-01', '2025-10-01']
const SELECTED = '2025-12-01'

// jsdom does not implement scrollIntoView — stub it so the useEffect in
// MonthDropdown does not throw when the dropdown opens.
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

function renderDropdown(props = {}) {
  return render(
    <MonthDropdown
      months={MONTHS}
      selectedMonth={SELECTED}
      onSelect={vi.fn()}
      {...props}
    />
  )
}

describe('MonthDropdown', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initial closed state ───────────────────────────────────────────────────

  it('renders the trigger button', () => {
    renderDropdown()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('is closed by default — listbox is not visible', () => {
    renderDropdown()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('trigger button has aria-expanded="false" when closed', () => {
    renderDropdown()
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false')
  })

  it('trigger button shows the selected month label', () => {
    renderDropdown()
    // "2025-12-01" should render as "December 2025"
    expect(screen.getByRole('combobox').textContent).toMatch(/December 2025/i)
  })

  // ── Open on click ──────────────────────────────────────────────────────────

  it('opens the listbox when trigger is clicked', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('trigger has aria-expanded="true" when open', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true')
  })

  it('shows all month options in the listbox', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(MONTHS.length)
  })

  it('renders month labels as human-readable strings (not ISO dates)', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    // "December 2025" appears in both the trigger label and the listbox option
    // when the dropdown is open — use getAllByText to handle both matches.
    expect(screen.getAllByText(/December 2025/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/November 2025/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/October 2025/i).length).toBeGreaterThan(0)
  })

  // ── Month selection ────────────────────────────────────────────────────────

  it('calls onSelect with the correct month string when an option is clicked', () => {
    const onSelect = vi.fn()
    renderDropdown({ onSelect })
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText(/November 2025/i))
    expect(onSelect).toHaveBeenCalledWith('2025-11-01')
  })

  it('closes the listbox after an option is selected', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText(/November 2025/i))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('calls onSelect exactly once when an option is clicked', () => {
    const onSelect = vi.fn()
    renderDropdown({ onSelect })
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText(/November 2025/i))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  // ── Selected month highlighted ─────────────────────────────────────────────

  it('marks the currently selected month option as aria-selected="true"', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    const selectedOption = options.find(
      opt => opt.getAttribute('aria-selected') === 'true'
    )
    expect(selectedOption).not.toBeUndefined()
    expect(selectedOption.textContent).toMatch(/December 2025/i)
  })

  it('does not mark non-selected options as aria-selected', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    const nonSelectedOptions = options.filter(
      opt => opt.getAttribute('aria-selected') !== 'true'
    )
    expect(nonSelectedOptions.length).toBe(MONTHS.length - 1)
  })

  // ── Keyboard: Escape closes ────────────────────────────────────────────────

  it('closes the listbox when Escape is pressed', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('trigger button has aria-haspopup="listbox"', () => {
    renderDropdown()
    expect(screen.getByRole('combobox').getAttribute('aria-haspopup')).toBe('listbox')
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('renders without crashing when selectedMonth is null', () => {
    renderDropdown({ selectedMonth: null })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders without crashing when months array is empty', () => {
    renderDropdown({ months: [] })
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.queryAllByRole('option')
    expect(options).toHaveLength(0)
  })
})
