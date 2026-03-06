import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RetirementPanel from './RetirementPanel.jsx'
import { MOCK_RETIREMENT, MOCK_RETIREMENT_EMPTY, MOCK_TYPE_DATA } from '../test/fixtures.js'

describe('RetirementPanel', () => {
  it('renders without crashing when data is null', () => {
    render(<RetirementPanel data={null} onSave={() => {}} />)
    expect(screen.getByTestId('retirement-panel')).toBeTruthy()
  })

  it('renders without crashing when data.exists is false', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT_EMPTY} onSave={() => {}} />)
    expect(screen.getByTestId('retirement-panel')).toBeTruthy()
  })

  it('pre-populates fields from data prop', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} />)
    expect(screen.getByLabelText('Current age').value).toBe('35')
    expect(screen.getByLabelText('Target retirement age').value).toBe('65')
  })

  it('renders MilestoneEditor subcomponent', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} />)
    expect(screen.getByTestId('milestone-editor')).toBeTruthy()
  })

  it('renders RetirementSummary subcomponent', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} />)
    expect(screen.getByTestId('retirement-summary')).toBeTruthy()
  })

  it('shows investable capital from typeData Retirement + Brokerage', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} typeData={MOCK_TYPE_DATA} />)
    // Latest entry: Retirement=240000, Brokerage=60000 → 300000
    expect(screen.getByTestId('investable-capital-value').textContent).toContain('300,000')
  })

  it('shows projected at retirement when typeData and return pct are provided', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} typeData={MOCK_TYPE_DATA} />)
    // Should compute a projection value and render the projected-value row
    expect(screen.getByTestId('projected-value')).toBeTruthy()
  })

  it('does not show investable capital when typeData is absent', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} />)
    expect(screen.queryByTestId('investable-capital-value')).toBeNull()
  })

  it('advanced section hidden by default, visible after toggle', () => {
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={() => {}} />)
    // Withdrawal rate input should not be visible initially
    expect(screen.queryByLabelText(/withdrawal rate/i)).toBeNull()
    fireEvent.click(screen.getByText(/advanced settings/i))
    expect(screen.getByLabelText(/withdrawal rate/i)).toBeTruthy()
  })

  it('calls onSave with correct payload on save', () => {
    const onSave = vi.fn()
    render(<RetirementPanel data={MOCK_RETIREMENT} onSave={onSave} />)
    fireEvent.click(screen.getByText('Save Settings'))
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.current_age).toBe(35)
    expect(payload.target_retirement_age).toBe(65)
    expect(payload.milestones).toHaveLength(2)
  })

  it('shows "Saving…" when loading is true', () => {
    render(<RetirementPanel data={null} onSave={() => {}} loading={true} />)
    expect(screen.getByText('Saving…')).toBeTruthy()
  })

  it('save button is disabled while loading', () => {
    render(<RetirementPanel data={null} onSave={() => {}} loading={true} />)
    expect(screen.getByText('Saving…').disabled).toBe(true)
  })
})
