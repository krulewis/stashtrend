import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BudgetBuilderPage from './BudgetBuilderPage.jsx'
import {
  MOCK_AI_CONFIG_UNCONFIGURED,
  MOCK_AI_CONFIG_CONFIGURED,
  MOCK_BUILDER_PROFILE,
  MOCK_BUILDER_PROFILE_EMPTY,
  MOCK_BUILDER_REGIONAL,
  MOCK_BUILDER_REGIONAL_EMPTY,
  MOCK_BUILDER_PLAN,
  MOCK_APPLY_RESULT,
  MOCK_APPLY_PARTIAL,
  mockFetch,
} from '../test/fixtures.js'

// Mock child components to expose their callback props as clickable buttons
vi.mock('../components/BuilderProfileForm.jsx', () => ({
  default: ({ onSave, loading }) => (
    <div data-testid="profile-form">
      <button onClick={() => onSave({ expected_income: 6000, location: 'Austin, TX' })}>
        Save Profile
      </button>
      {loading && <span>profile-loading</span>}
    </div>
  ),
}))

vi.mock('../components/BuilderRegionalData.jsx', () => ({
  default: ({ onSave, onFetchAI, loading, aiConfigured }) => (
    <div data-testid="regional-data">
      <button onClick={() => onSave({ food_cost_trend: '$900/mo' })}>Save Regional</button>
      <button onClick={onFetchAI} disabled={!aiConfigured}>Fetch from AI</button>
      {loading && <span>regional-loading</span>}
    </div>
  ),
}))

vi.mock('../components/BuilderResultsTable.jsx', () => ({
  default: ({ plan, onSavePlan, onApply, applyResult, loading }) => (
    <div data-testid="results-table">
      <span data-testid="plan-id">plan:{plan?.id}</span>
      <button onClick={onSavePlan}>Save Plan</button>
      <button onClick={onApply}>Apply Plan</button>
      {loading && <span>apply-loading</span>}
      {applyResult && <span data-testid="apply-result">applied:{applyResult.applied}</span>}
      {applyResult?.failed > 0 && <span data-testid="apply-failures">failed:{applyResult.failed}</span>}
    </div>
  ),
}))

function setupConfiguredMocks(overrides = {}) {
  mockFetch({
    '/api/ai/config':                MOCK_AI_CONFIG_CONFIGURED,
    '/api/budget-builder/profile':   MOCK_BUILDER_PROFILE_EMPTY,
    '/api/budget-builder/regional':  MOCK_BUILDER_REGIONAL_EMPTY,
    ...overrides,
  })
}

describe('BudgetBuilderPage — smoke tests', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows AI not configured banner when AI is unconfigured', async () => {
    mockFetch({
      '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED,
      '/api/budget-builder/profile': MOCK_BUILDER_PROFILE_EMPTY,
      '/api/budget-builder/regional': MOCK_BUILDER_REGIONAL_EMPTY,
    })
    render(<BudgetBuilderPage />)
    expect(await screen.findByText(/AI not configured/i)).toBeInTheDocument()
  })

  it('shows profile form when AI is configured', async () => {
    setupConfiguredMocks()
    render(<BudgetBuilderPage />)
    expect(await screen.findByTestId('profile-form')).toBeInTheDocument()
  })

  it('renders 3-step workflow sections', async () => {
    setupConfiguredMocks()
    render(<BudgetBuilderPage />)
    expect(await screen.findByText(/Step 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 3/i)).toBeInTheDocument()
  })
})

describe('BudgetBuilderPage — handleSaveProfile', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls saveBuilderProfile then re-fetches profile', async () => {
    let postCalled = false
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/profile') && opts?.method === 'POST') {
        postCalled = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/budget-builder/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
          postCalled ? MOCK_BUILDER_PROFILE : MOCK_BUILDER_PROFILE_EMPTY
        )})
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByTestId('profile-form')
    fireEvent.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      const profilePosts = global.fetch.mock.calls.filter(
        ([u, o]) => u.includes('/api/budget-builder/profile') && o?.method === 'POST'
      )
      expect(profilePosts).toHaveLength(1)
    })
  })

  it('surfaces error when saveBuilderProfile rejects', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/profile') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 400,
          json: () => Promise.resolve({ error: 'Validation failed' }),
        })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByTestId('profile-form')
    fireEvent.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      expect(screen.getByText(/Validation failed/)).toBeInTheDocument()
    })
  })
})

describe('BudgetBuilderPage — handleSaveRegional', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls saveBuilderRegional then re-fetches', async () => {
    let postCalled = false
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/regional') && opts?.method === 'POST' && !url.includes('/fetch')) {
        postCalled = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/budget-builder/regional')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(
          postCalled ? MOCK_BUILDER_REGIONAL : MOCK_BUILDER_REGIONAL_EMPTY
        )})
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByTestId('regional-data')
    fireEvent.click(screen.getByText('Save Regional'))

    await waitFor(() => {
      const regionalPosts = global.fetch.mock.calls.filter(
        ([u, o]) => u.includes('/api/budget-builder/regional') && o?.method === 'POST' && !u.includes('/fetch')
      )
      expect(regionalPosts).toHaveLength(1)
    })
  })
})

describe('BudgetBuilderPage — handleFetchRegionalAI', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls fetchRegionalFromAI and updates regional state', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/regional/fetch') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL) })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      if (url.includes('/api/budget-builder/regional')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByTestId('regional-data')
    fireEvent.click(screen.getByText('Fetch from AI'))

    await waitFor(() => {
      const fetchAICalls = global.fetch.mock.calls.filter(
        ([u]) => u.includes('/api/budget-builder/regional/fetch')
      )
      expect(fetchAICalls).toHaveLength(1)
    })
  })
})

describe('BudgetBuilderPage — handleGenerate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls generateBudgetPlan and shows results table', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/generate') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: MOCK_BUILDER_PLAN }) })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      if (url.includes('/api/budget-builder/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    fireEvent.click(screen.getByText('Generate'))

    await waitFor(() => {
      expect(screen.getByTestId('plan-id')).toHaveTextContent('plan:1')
    })
  })

  it('sends correct months_ahead when select is changed', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/generate') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: MOCK_BUILDER_PLAN }) })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      if (url.includes('/api/budget-builder/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')

    // Change months select to 6
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '6' } })
    fireEvent.click(screen.getByText('Generate'))

    await waitFor(() => {
      const genCall = global.fetch.mock.calls.find(
        ([u, o]) => u.includes('/api/budget-builder/generate') && o?.method === 'POST'
      )
      expect(genCall).toBeDefined()
      const body = JSON.parse(genCall[1].body)
      expect(body.months_ahead).toBe(6)
    })
  })

  it('disables Generate when AI is not configured', async () => {
    mockFetch({
      '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED,
      '/api/budget-builder/profile': MOCK_BUILDER_PROFILE_EMPTY,
      '/api/budget-builder/regional': MOCK_BUILDER_REGIONAL_EMPTY,
    })

    render(<BudgetBuilderPage />)
    await screen.findByText(/AI not configured/)
    expect(screen.getByText('Generate')).toBeDisabled()
  })

  it('surfaces error when generateBudgetPlan rejects', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/generate') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: false, status: 500,
          json: () => Promise.resolve({ error: 'Response was truncated' }),
        })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      if (url.includes('/api/budget-builder/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
    })

    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    fireEvent.click(screen.getByText('Generate'))

    await waitFor(() => {
      expect(screen.getByText(/Response was truncated/)).toBeInTheDocument()
    })
  })
})

describe('BudgetBuilderPage — handleApply', () => {
  afterEach(() => vi.restoreAllMocks())

  function setupWithPlan(applyResponse = MOCK_APPLY_RESULT) {
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/budget-builder/generate') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: MOCK_BUILDER_PLAN }) })
      }
      if (url.includes('/api/budget-builder/plans/1/apply') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(applyResponse) })
      }
      if (url.includes('/api/budget-builder/plans/1') && opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/ai/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_AI_CONFIG_CONFIGURED) })
      }
      if (url.includes('/api/budget-builder/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_PROFILE_EMPTY) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_BUILDER_REGIONAL_EMPTY) })
    })
  }

  it('calls applyBuilderPlan and shows result', async () => {
    setupWithPlan()
    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    fireEvent.click(screen.getByText('Generate'))
    await screen.findByTestId('results-table')

    fireEvent.click(screen.getByText('Apply Plan'))

    await waitFor(() => {
      expect(screen.getByTestId('apply-result')).toHaveTextContent('applied:6')
    })
  })

  it('shows partial failure detail', async () => {
    setupWithPlan(MOCK_APPLY_PARTIAL)
    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    fireEvent.click(screen.getByText('Generate'))
    await screen.findByTestId('results-table')

    fireEvent.click(screen.getByText('Apply Plan'))

    await waitFor(() => {
      expect(screen.getByTestId('apply-failures')).toHaveTextContent('failed:2')
    })
  })

  it('calls updateBuilderPlan on Save Plan', async () => {
    setupWithPlan()
    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    fireEvent.click(screen.getByText('Generate'))
    await screen.findByTestId('results-table')

    fireEvent.click(screen.getByText('Save Plan'))

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        ([u, o]) => u.includes('/api/budget-builder/plans/1') && o?.method === 'PUT'
      )
      expect(saveCalls).toHaveLength(1)
    })
  })
})

describe('BudgetBuilderPage — monthsAhead state', () => {
  afterEach(() => vi.restoreAllMocks())

  it('defaults monthsAhead select to 3', async () => {
    setupConfiguredMocks()
    render(<BudgetBuilderPage />)
    await screen.findByText('Generate')
    const select = screen.getByRole('combobox')
    expect(select.value).toBe('3')
  })
})
