import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import styles from './SliderInput.module.css'

export default function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  ariaLabel,
}) {
  const [inputText, setInputText] = useState(format(value))
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) {
      setInputText(format(value))
    }
  }, [value, format])

  function handleTextChange(e) {
    setInputText(e.target.value)
  }

  function handleFocus(e) {
    isFocused.current = true
    e.target.select()
  }

  function commitText() {
    isFocused.current = false
    const raw = parseFloat(inputText.replace(/[^0-9.]/g, ''))
    if (isNaN(raw)) {
      setInputText(format(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, raw))
    const rounded = Math.round(clamped / step) * step
    onChange(rounded)
    setInputText(format(rounded))
  }

  function handleBlur() {
    commitText()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  function handleRangeChange(e) {
    onChange(Number(e.target.value))
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controlRow}>
        <input
          type="text"
          inputMode="decimal"
          className={styles.textInput}
          value={inputText}
          onChange={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
        />
        <input
          type="range"
          className={styles.slider}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={handleRangeChange}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  )
}

SliderInput.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number.isRequired,
  format: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired,
}
