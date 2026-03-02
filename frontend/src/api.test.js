import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchJSON, postJSON, deleteGroup, fetchSetupStatus } from './api.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fetchJSON', () => {
  it('returns parsed JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    })
    const result = await fetchJSON('/api/test')
    expect(result).toEqual({ data: 'test' })
    expect(global.fetch).toHaveBeenCalledWith('/api/test')
  })

  it('throws on non-ok response with status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(fetchJSON('/api/missing')).rejects.toThrow('HTTP 404 from /api/missing')
  })
})

describe('postJSON (via mutateJSON)', () => {
  it('sends POST with JSON body and returns parsed response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    })
    const result = await postJSON('/api/items', { name: 'test' })
    expect(result).toEqual({ id: 1 })
    expect(global.fetch).toHaveBeenCalledWith('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    })
  })

  it('throws with error message from response body on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    })
    await expect(postJSON('/api/items', {})).rejects.toThrow('Validation failed')
  })

  it('falls back to HTTP status when response body has no error field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })
    await expect(postJSON('/api/items', {})).rejects.toThrow('HTTP 500')
  })

  it('handles unparseable error response body gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not JSON')),
    })
    await expect(postJSON('/api/items', {})).rejects.toThrow('HTTP 500')
  })
})

describe('deleteGroup', () => {
  it('sends DELETE without a body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ deleted: true }),
    })
    const result = await deleteGroup(42)
    expect(result).toEqual({ deleted: true })
    expect(global.fetch).toHaveBeenCalledWith('/api/groups/42', { method: 'DELETE' })
  })

  it('throws on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Group not found' }),
    })
    await expect(deleteGroup(99)).rejects.toThrow('Group not found')
  })
})

describe('fetchSetupStatus', () => {
  it('calls the setup status endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: true }),
    })
    const result = await fetchSetupStatus()
    expect(result).toEqual({ configured: true })
    expect(global.fetch).toHaveBeenCalledWith('/api/setup/status')
  })
})
