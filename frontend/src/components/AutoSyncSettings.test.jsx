import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import AutoSyncSettings from './AutoSyncSettings.jsx'
import { MOCK_SETTINGS, mockFetch } from '../test/fixtures.js'

describe('AutoSyncSettings', () => {
  beforeEach(() => {
    mockFetch({ '/api/settings': MOCK_SETTINGS })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Auto Sync heading', () => {
    render(<AutoSyncSettings />)
    expect(screen.getByText('Auto Sync')).toBeInTheDocument()
  })

  it('renders the interval dropdown', () => {
    render(<AutoSyncSettings />)
    expect(screen.getByRole('combobox', { name: /sync interval/i })).toBeInTheDocument()
  })

  it('fetches settings on mount', async () => {
    render(<AutoSyncSettings />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/settings')
    })
  })

  it('shows stored interval from API', async () => {
    mockFetch({ '/api/settings': { sync_interval_hours: 6 } })
    render(<AutoSyncSettings />)
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /sync interval/i }).value).toBe('6')
    })
  })

  it('POSTs new interval when dropdown changes', async () => {
    render(<AutoSyncSettings />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/settings')
    })
    fireEvent.change(screen.getByRole('combobox', { name: /sync interval/i }), {
      target: { value: '4' },
    })
    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([url, opts]) => url === '/api/settings' && opts?.method === 'POST'
      )
      expect(postCall).toBeDefined()
      expect(JSON.parse(postCall[1].body).sync_interval_hours).toBe(4)
    })
  })

  it('reverts interval and shows error when save fails', async () => {
    // Initial GET returns interval=4; POST fails
    global.fetch = vi.fn((url, opts) => {
      if (!opts?.method || opts.method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sync_interval_hours: 4 }) })
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })
    })

    render(<AutoSyncSettings />)
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /sync interval/i }).value).toBe('4')
    })

    fireEvent.change(screen.getByRole('combobox', { name: /sync interval/i }), {
      target: { value: '12' },
    })

    await waitFor(() => {
      // Reverted back to previous value
      expect(screen.getByRole('combobox', { name: /sync interval/i }).value).toBe('4')
      // Error message displayed
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })
})
