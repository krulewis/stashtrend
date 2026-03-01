import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import SetupPage from './SetupPage.jsx'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SetupPage', () => {
  it('renders the "Connect to Monarch Money" heading', () => {
    render(<SetupPage onComplete={vi.fn()} />)
    expect(screen.getByText('Connect to Monarch Money')).toBeInTheDocument()
  })

  it('renders a password input field', () => {
    render(<SetupPage onComplete={vi.fn()} />)
    expect(screen.getByLabelText(/monarch api token/i)).toBeInTheDocument()
  })

  it('renders a Connect button', () => {
    render(<SetupPage onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('shows error message on failed token submission', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Token validation failed: Invalid token' }),
      })
    )

    render(<SetupPage onComplete={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/monarch api token/i), {
      target: { value: 'bad-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(screen.getByText(/Token validation failed/)).toBeInTheDocument()
    })
  })

  it('calls onComplete on successful token submission', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
    )

    const onComplete = vi.fn()
    render(<SetupPage onComplete={onComplete} />)
    fireEvent.change(screen.getByLabelText(/monarch api token/i), {
      target: { value: 'valid-token-abc123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce()
    })
  })
})
