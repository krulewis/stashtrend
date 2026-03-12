import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SliderInput from './SliderInput.jsx'

const defaultProps = {
  label: 'Test Slider',
  value: 50,
  onChange: vi.fn(),
  min: 0,
  max: 100,
  step: 1,
  format: (v) => `${v}%`,
  ariaLabel: 'Test slider input',
}

describe('SliderInput', () => {
  it('renders label text', () => {
    render(<SliderInput {...defaultProps} />)
    expect(screen.getByText('Test Slider')).toBeInTheDocument()
  })

  it('renders text input with formatted value', () => {
    render(<SliderInput {...defaultProps} />)
    const textInput = screen.getAllByRole('textbox')[0]
    expect(textInput).toHaveValue('50%')
  })

  it('renders range slider', () => {
    render(<SliderInput {...defaultProps} />)
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('type', 'range')
  })

  it('calls onChange when slider changes', () => {
    const onChange = vi.fn()
    render(<SliderInput {...defaultProps} onChange={onChange} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '75' } })
    expect(onChange).toHaveBeenCalledWith(75)
  })

  it('commits text value on blur clamped to min/max', () => {
    const onChange = vi.fn()
    render(<SliderInput {...defaultProps} onChange={onChange} />)
    const textInput = screen.getAllByRole('textbox')[0]
    fireEvent.focus(textInput)
    fireEvent.change(textInput, { target: { value: '150' } })
    fireEvent.blur(textInput)
    // 150 is above max=100, so should be clamped to 100
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('formats display value using format function', () => {
    const format = (v) => `$${v.toLocaleString()}`
    render(<SliderInput {...defaultProps} value={2000} format={format} />)
    const textInput = screen.getAllByRole('textbox')[0]
    expect(textInput).toHaveValue('$2,000')
  })

  it('reverts to current value when invalid text is entered and blurred', () => {
    const onChange = vi.fn()
    render(<SliderInput {...defaultProps} onChange={onChange} />)
    const textInput = screen.getAllByRole('textbox')[0]
    fireEvent.focus(textInput)
    fireEvent.change(textInput, { target: { value: 'abc' } })
    fireEvent.blur(textInput)
    // NaN input — onChange should not be called, input reverts to formatted current value
    expect(onChange).not.toHaveBeenCalled()
    expect(textInput).toHaveValue('50%')
  })
})
