import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BuilderRegionalData from './BuilderRegionalData.jsx'
import { MOCK_BUILDER_REGIONAL } from '../test/fixtures.js'

describe('BuilderRegionalData', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders empty state when regional is null', () => {
    render(
      <BuilderRegionalData regional={null} aiConfigured={true}
        loading={false} onSave={vi.fn()} onFetchAI={vi.fn()} />
    )
    expect(screen.getByText(/No regional data yet/i)).toBeInTheDocument()
  })

  it('renders regional data fields when loaded', () => {
    render(
      <BuilderRegionalData regional={MOCK_BUILDER_REGIONAL} aiConfigured={true}
        loading={false} onSave={vi.fn()} onFetchAI={vi.fn()} />
    )
    expect(screen.getByDisplayValue('$950/mo, up 3%')).toBeInTheDocument()
    expect(screen.getByDisplayValue('$2.89/gal')).toBeInTheDocument()
  })

  it('shows AI source badge', () => {
    render(
      <BuilderRegionalData regional={MOCK_BUILDER_REGIONAL} aiConfigured={true}
        loading={false} onSave={vi.fn()} onFetchAI={vi.fn()} />
    )
    expect(screen.getByText(/AI-generated/i)).toBeInTheDocument()
  })

  it('disables Fetch from AI when AI not configured', () => {
    render(
      <BuilderRegionalData regional={null} aiConfigured={false}
        loading={false} onSave={vi.fn()} onFetchAI={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /Fetch from AI/i })).toBeDisabled()
  })

  it('calls onFetchAI when button is clicked', () => {
    const onFetchAI = vi.fn()
    render(
      <BuilderRegionalData regional={null} aiConfigured={true}
        loading={false} onSave={onFetchAI} onFetchAI={onFetchAI} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Fetch from AI/i }))
    expect(onFetchAI).toHaveBeenCalled()
  })

  it('disables buttons while loading', () => {
    render(
      <BuilderRegionalData regional={MOCK_BUILDER_REGIONAL} aiConfigured={true}
        loading={true} onSave={vi.fn()} onFetchAI={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /Fetching/i })).toBeDisabled()
  })

  it('calls onSave with edited data', () => {
    const onSave = vi.fn()
    render(
      <BuilderRegionalData regional={MOCK_BUILDER_REGIONAL} aiConfigured={true}
        loading={false} onSave={onSave} onFetchAI={vi.fn()} />
    )
    const input = screen.getByDisplayValue('$950/mo, up 3%')
    fireEvent.change(input, { target: { value: '$1,000/mo' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))
    expect(onSave).toHaveBeenCalled()
    expect(onSave.mock.calls[0][0].food_cost_trend).toBe('$1,000/mo')
  })
})
