import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ForecastingSetup from './ForecastingSetup.jsx'

const defaultProps = {
  onSave: vi.fn(),
  loading: false,
  error: null,
}

describe('ForecastingSetup', () => {
  it('renders title "Set Up Retirement Projections"', () => {
    render(<ForecastingSetup {...defaultProps} />)
    expect(screen.getByText('Set Up Retirement Projections')).toBeInTheDocument()
  })

  it('renders required fields: current age and target retirement age', () => {
    render(<ForecastingSetup {...defaultProps} />)
    expect(screen.getByLabelText('Current age')).toBeInTheDocument()
    expect(screen.getByLabelText('Target retirement age')).toBeInTheDocument()
  })

  it('shows validation error when ages are missing and save is clicked', () => {
    render(<ForecastingSetup {...defaultProps} />)
    fireEvent.click(screen.getByText('Save Settings'))
    expect(
      screen.getByText('Current age and target retirement age are required.')
    ).toBeInTheDocument()
  })

  it('shows validation error when target age <= current age', () => {
    render(<ForecastingSetup {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Current age'), { target: { value: '65' } })
    fireEvent.change(screen.getByLabelText('Target retirement age'), { target: { value: '40' } })
    fireEvent.click(screen.getByText('Save Settings'))
    expect(
      screen.getByText('Target retirement age must be greater than current age.')
    ).toBeInTheDocument()
  })

  it('renders advanced toggle that shows extra fields when clicked', () => {
    render(<ForecastingSetup {...defaultProps} />)
    expect(screen.queryByText('Expected annual return (%)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('▼ Advanced settings'))
    expect(screen.getByText('Expected annual return (%)')).toBeInTheDocument()
  })

  it('calls onSave with correct shape when form is valid', () => {
    const onSave = vi.fn()
    render(<ForecastingSetup {...defaultProps} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Current age'), { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('Target retirement age'), { target: { value: '65' } })
    fireEvent.click(screen.getByText('Save Settings'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        current_age: 35,
        target_retirement_age: 65,
      })
    )
  })

  it('disables save button when loading=true', () => {
    render(<ForecastingSetup {...defaultProps} loading={true} />)
    expect(screen.getByText('Saving…')).toBeDisabled()
  })

  it('shows error message when error prop provided', () => {
    const errorMsg = 'Failed to save settings. Please try again.'
    render(<ForecastingSetup {...defaultProps} error={errorMsg} />)
    expect(screen.getByText(errorMsg)).toBeInTheDocument()
  })
})
