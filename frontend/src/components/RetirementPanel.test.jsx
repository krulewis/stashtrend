import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RetirementPanel from './RetirementPanel.jsx'
import { MOCK_RETIREMENT, MOCK_RETIREMENT_EMPTY } from '../test/fixtures.js'

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
