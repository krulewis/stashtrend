/** Shared API utilities. Single source of truth for HTTP helpers and endpoints. */

export async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

async function mutateJSON(url, method, data) {
  const opts = { method }
  if (data !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(data)
  }
  const res = await fetch(url, opts)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export const postJSON = (url, body) => mutateJSON(url, 'POST', body)

// ── Net Worth ──────────────────────────────────────────────────────────────
export const fetchNetworthStats = () => fetchJSON('/api/networth/stats')
export const fetchNetworthHistory = () => fetchJSON('/api/networth/history')
export const fetchNetworthByType = () => fetchJSON('/api/networth/by-type')

// ── Accounts ───────────────────────────────────────────────────────────────
export const fetchAccountsSummary = () => fetchJSON('/api/accounts/summary')

// ── Groups ─────────────────────────────────────────────────────────────────
export const fetchGroups = () => fetchJSON('/api/groups')
export const fetchGroupsHistory = () => fetchJSON('/api/groups/history')
export const fetchGroupsSnapshot = () => fetchJSON('/api/groups/snapshot')
export const createGroup = (data) => mutateJSON('/api/groups', 'POST', data)
export const updateGroup = (id, data) => mutateJSON(`/api/groups/${id}`, 'PUT', data)
export const deleteGroup = (id) => mutateJSON(`/api/groups/${id}`, 'DELETE', undefined)
export const fetchGroupsConfigs = () => fetchJSON('/api/groups/configs')
export const saveGroupsConfigs = (data) => mutateJSON('/api/groups/configs', 'POST', data)

// ── Budget ─────────────────────────────────────────────────────────────────
export const fetchBudgetHistory = (months) => fetchJSON(`/api/budgets/history?months=${months}`)
export const fetchCustomGroups  = () => fetchJSON('/api/budgets/custom-groups')
export const saveCustomGroups   = (data) => postJSON('/api/budgets/custom-groups', data)

// ── AI ─────────────────────────────────────────────────────────────────────
export const fetchAiConfig = () => fetchJSON('/api/ai/config')
export const saveAiConfig = (data) => mutateJSON('/api/ai/config', 'POST', data)
export const runAiAnalysis = () => mutateJSON('/api/ai/analyze', 'POST', {})

// ── Sync ───────────────────────────────────────────────────────────────────
export const fetchSyncHistory = () => fetchJSON('/api/sync/history')
export const fetchSyncLastStatus = () => fetchJSON('/api/sync/last-status')
export const fetchSyncStatus = (jobId) => fetchJSON(`/api/sync/status/${jobId}`)
export const startSync = (entities, full) => mutateJSON('/api/sync/start', 'POST', { entities, full })

// ── Settings ───────────────────────────────────────────────────────────────
export const fetchSettings = () => fetchJSON('/api/settings')
export const saveSettings = (data) => mutateJSON('/api/settings', 'POST', data)

// ── Setup ──────────────────────────────────────────────────────────────────
export const fetchSetupStatus = () => fetchJSON('/api/setup/status')
export const setupToken = (token) => mutateJSON('/api/setup/token', 'POST', { token })

// ── Budget Builder ────────────────────────────────────────────────────────
export const fetchBuilderProfile = () => fetchJSON('/api/budget-builder/profile')
export const saveBuilderProfile = (data) => postJSON('/api/budget-builder/profile', data)
export const fetchBuilderRegional = () => fetchJSON('/api/budget-builder/regional')
export const saveBuilderRegional = (data) => postJSON('/api/budget-builder/regional', data)
export const fetchRegionalFromAI = () => postJSON('/api/budget-builder/regional/fetch', {})
export const generateBudgetPlan = (data) => postJSON('/api/budget-builder/generate', data)
export const fetchBuilderPlans = () => fetchJSON('/api/budget-builder/plans')
export const fetchBuilderPlan = (id) => fetchJSON(`/api/budget-builder/plans/${id}`)
export const updateBuilderPlan = (id, data) => mutateJSON(`/api/budget-builder/plans/${id}`, 'PUT', data)
export const deleteBuilderPlan = (id) => mutateJSON(`/api/budget-builder/plans/${id}`, 'DELETE', undefined)
export const applyBuilderPlan = (id) => postJSON(`/api/budget-builder/plans/${id}/apply`, {})

// ── Retirement / Milestones ───────────────────────────────────────────────
export const fetchRetirement = () => fetchJSON('/api/retirement')
export const saveRetirement = (data) => postJSON('/api/retirement', data)
