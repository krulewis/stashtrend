import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BuilderProfileForm from './BuilderProfileForm.jsx'
import { MOCK_BUILDER_PROFILE } from '../test/fixtures.js'

describe('BuilderProfileForm', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders empty form when profile is null', () => {
    render(<BuilderProfileForm profile={null} loading={false} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/Expected Monthly Income/i)).toHaveValue(null)
    expect(screen.getByLabelText(/Location/i)).toHaveValue('')
  })

  it('renders prefilled form with existing profile', () => {
    render(<BuilderProfileForm profile={MOCK_BUILDER_PROFILE} loading={false} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/Expected Monthly Income/i)).toHaveValue(6000)
    expect(screen.getByLabelText(/Location/i)).toHaveValue('Austin, TX')
    expect(screen.getByLabelText(/Number of Children/i)).toHaveValue(2)
  })

  it('calls onSave with form data when Save is clicked', async () => {
    const onSave = vi.fn()
    render(<BuilderProfileForm profile={null} loading={false} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/Expected Monthly Income/i), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: 'Denver, CO' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Profile/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.expected_income).toBe(5000)
    expect(saved.location).toBe('Denver, CO')
  })

  it('disables save button when loading', () => {
    render(<BuilderProfileForm profile={null} loading={true} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled()
  })

  it('renders housing type radio buttons', () => {
    render(<BuilderProfileForm profile={MOCK_BUILDER_PROFILE} loading={false} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/Rent/i)).toBeChecked()
    expect(screen.getByLabelText(/Own/i)).not.toBeChecked()
  })
})
