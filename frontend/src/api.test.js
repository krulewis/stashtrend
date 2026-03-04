import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchJSON, postJSON, deleteGroup, fetchSetupStatus,
  fetchNetworthStats, fetchNetworthHistory, fetchNetworthByType, fetchAccountsSummary,
  fetchGroups, fetchGroupsHistory, fetchGroupsSnapshot, fetchGroupsConfigs,
  createGroup, updateGroup, saveGroupsConfigs,
  fetchBudgetHistory,
  fetchAiConfig, saveAiConfig, runAiAnalysis,
  fetchSyncHistory, fetchSyncLastStatus, fetchSyncStatus, startSync,
  fetchSettings, saveSettings, setupToken,
  fetchBuilderProfile, saveBuilderProfile,
  fetchBuilderRegional, saveBuilderRegional, fetchRegionalFromAI,
  generateBudgetPlan, fetchBuilderPlans, fetchBuilderPlan,
  updateBuilderPlan, deleteBuilderPlan, applyBuilderPlan,
} from './api.js'

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

// ── API endpoint contracts — URL and method correctness ─────────────────

describe('GET endpoint contracts', () => {
  it.each([
    ['fetchNetworthStats',   () => fetchNetworthStats(),         '/api/networth/stats'],
    ['fetchNetworthHistory', () => fetchNetworthHistory(),       '/api/networth/history'],
    ['fetchNetworthByType',  () => fetchNetworthByType(),        '/api/networth/by-type'],
    ['fetchAccountsSummary', () => fetchAccountsSummary(),       '/api/accounts/summary'],
    ['fetchGroups',          () => fetchGroups(),                '/api/groups'],
    ['fetchGroupsHistory',   () => fetchGroupsHistory(),        '/api/groups/history'],
    ['fetchGroupsSnapshot',  () => fetchGroupsSnapshot(),       '/api/groups/snapshot'],
    ['fetchGroupsConfigs',   () => fetchGroupsConfigs(),        '/api/groups/configs'],
    ['fetchBudgetHistory',   () => fetchBudgetHistory(6),       '/api/budgets/history?months=6'],
    ['fetchAiConfig',        () => fetchAiConfig(),             '/api/ai/config'],
    ['fetchSyncHistory',     () => fetchSyncHistory(),          '/api/sync/history'],
    ['fetchSyncLastStatus',  () => fetchSyncLastStatus(),       '/api/sync/last-status'],
    ['fetchSyncStatus',      () => fetchSyncStatus('job-123'),  '/api/sync/status/job-123'],
    ['fetchSettings',        () => fetchSettings(),             '/api/settings'],
    ['fetchBuilderProfile',  () => fetchBuilderProfile(),       '/api/budget-builder/profile'],
    ['fetchBuilderRegional', () => fetchBuilderRegional(),      '/api/budget-builder/regional'],
    ['fetchBuilderPlans',    () => fetchBuilderPlans(),         '/api/budget-builder/plans'],
    ['fetchBuilderPlan',     () => fetchBuilderPlan(1),         '/api/budget-builder/plans/1'],
  ])('%s calls GET %s', async (_name, invoke, expectedUrl) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    await invoke()
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl)
  })
})

describe('Mutating endpoint contracts', () => {
  it.each([
    ['createGroup',       () => createGroup({ name: 'X' }),            'POST',   '/api/groups'],
    ['updateGroup',       () => updateGroup(1, { name: 'X' }),         'PUT',    '/api/groups/1'],
    ['saveGroupsConfigs', () => saveGroupsConfigs({ configs: [] }),    'POST',   '/api/groups/configs'],
    ['saveAiConfig',      () => saveAiConfig({ provider: 'x' }),       'POST',   '/api/ai/config'],
    ['runAiAnalysis',     () => runAiAnalysis(),                        'POST',   '/api/ai/analyze'],
    ['startSync',         () => startSync(['accounts'], false),         'POST',   '/api/sync/start'],
    ['saveSettings',      () => saveSettings({ interval: 6 }),          'POST',   '/api/settings'],
    ['setupToken',        () => setupToken('tok_123'),                  'POST',   '/api/setup/token'],
    ['saveBuilderProfile',  () => saveBuilderProfile({ income: 6000 }), 'POST', '/api/budget-builder/profile'],
    ['saveBuilderRegional', () => saveBuilderRegional({ food: '$9' }),   'POST', '/api/budget-builder/regional'],
    ['fetchRegionalFromAI', () => fetchRegionalFromAI(),                 'POST', '/api/budget-builder/regional/fetch'],
    ['generateBudgetPlan',  () => generateBudgetPlan({ months_ahead: 3 }), 'POST', '/api/budget-builder/generate'],
    ['updateBuilderPlan',   () => updateBuilderPlan(1, { name: 'X' }),  'PUT',  '/api/budget-builder/plans/1'],
    ['deleteBuilderPlan',   () => deleteBuilderPlan(1),                 'DELETE', '/api/budget-builder/plans/1'],
    ['applyBuilderPlan',    () => applyBuilderPlan(1),                  'POST',  '/api/budget-builder/plans/1/apply'],
  ])('%s sends %s to %s', async (_name, invoke, method, expectedUrl) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    await invoke()
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ method }))
  })
})
