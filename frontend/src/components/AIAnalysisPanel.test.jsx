import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import AIAnalysisPanel from './AIAnalysisPanel'
import {
  MOCK_AI_CONFIG_UNCONFIGURED,
  MOCK_AI_CONFIG_CONFIGURED,
  mockFetch,
} from '../test/fixtures'

const MOCK_ANALYSIS = { analysis: 'You spent $3,200 on Food & Drink in November, 7% over budget.' }

describe('AIAnalysisPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders collapsed by default with expand button', () => {
    mockFetch({ '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED })
    render(<AIAnalysisPanel />)
    expect(screen.getByRole('button', { name: /Analyze with AI/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Run Analysis/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save & Analyze/i })).not.toBeInTheDocument()
  })

  it('expands panel when header button is clicked', async () => {
    mockFetch({ '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    // After expand, either config form or run button should appear
    await waitFor(() => {
      const form = screen.queryByRole('button', { name: /Save & Analyze/i })
      const run  = screen.queryByRole('button', { name: /Run Analysis/i })
      expect(form || run).toBeTruthy()
    })
  })

  it('shows config form when GET /api/ai/config returns unconfigured', async () => {
    mockFetch({ '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    expect(await screen.findByRole('button', { name: /Save & Analyze/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Provider/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument()
  })

  it('shows Run Analysis button when GET /api/ai/config returns configured', async () => {
    mockFetch({ '/api/ai/config': MOCK_AI_CONFIG_CONFIGURED })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    expect(await screen.findByRole('button', { name: /Run Analysis/i })).toBeInTheDocument()
    expect(screen.getByText('anthropic')).toBeInTheDocument()
    expect(screen.getByText('claude-opus-4-5')).toBeInTheDocument()
  })

  it('calls POST /api/ai/analyze on Run Analysis click and shows spinner', async () => {
    // Use a never-resolving analyze call to catch the spinner
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/ai/config') && (!opts || opts.method !== 'POST')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      // analyze hangs so we can assert spinner
      return new Promise(() => {})
    })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Run Analysis/i }))
    expect(await screen.findByText(/Analyzing/i)).toBeInTheDocument()
  })

  it('shows analysis text after POST /api/ai/analyze completes', async () => {
    mockFetch({
      '/api/ai/config':   MOCK_AI_CONFIG_CONFIGURED,
      '/api/ai/analyze':  MOCK_ANALYSIS,
    })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Run Analysis/i }))
    expect(await screen.findByText(/You spent/i)).toBeInTheDocument()
  })

  it('shows Reconfigure link after analysis completes', async () => {
    mockFetch({
      '/api/ai/config':   MOCK_AI_CONFIG_CONFIGURED,
      '/api/ai/analyze':  MOCK_ANALYSIS,
    })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Run Analysis/i }))
    await screen.findByText(/You spent/i)
    expect(screen.getByRole('button', { name: /Reconfigure/i })).toBeInTheDocument()
  })

  it('Re-run button triggers another analysis call', async () => {
    mockFetch({
      '/api/ai/config':   MOCK_AI_CONFIG_CONFIGURED,
      '/api/ai/analyze':  MOCK_ANALYSIS,
    })
    render(<AIAnalysisPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Run Analysis/i }))
    await screen.findByText(/You spent/i)

    const analyzeCalls = global.fetch.mock.calls.filter(c => c[0].includes('/api/ai/analyze'))
    expect(analyzeCalls.length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: /Re-run/i }))
    await waitFor(() => {
      const calls = global.fetch.mock.calls.filter(c => c[0].includes('/api/ai/analyze'))
      expect(calls.length).toBe(2)
    })
  })
})
