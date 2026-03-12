import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ForecastingPage from './ForecastingPage.jsx'
import {
  MOCK_NETWORTH_BY_TYPE,
  MOCK_RETIREMENT,
  MOCK_RETIREMENT_EMPTY,
  mockFetch,
} from '../test/fixtures.js'

// ── Mock child components ─────────────────────────────────────────────────────
vi.mock('../components/ForecastingChart.jsx',    () => ({ default: () => <div data-testid="forecasting-chart" /> }))
vi.mock('../components/ForecastingControls.jsx', () => ({ default: () => <div data-testid="forecasting-controls" /> }))
vi.mock('../components/ForecastingSummary.jsx',  () => ({
  default: (props) => (
    <div data-testid="forecasting-summary">
      <button onClick={props.onEditSettings}>Edit</button>
    </div>
  ),
}))
vi.mock('../components/ForecastingSetup.jsx',    () => ({ default: () => <div data-testid="forecasting-setup" /> }))
vi.mock('../components/MilestoneCardsView.jsx',  () => ({ default: () => <div data-testid="milestone-cards-view" /> }))
vi.mock('../components/RetirementPanel.jsx', () => ({
  default: vi.fn((props) => (
    <div
      data-testid="retirement-panel"
      data-loading={String(props.loading)}
      data-error={props.error || ''}
    >
      <button data-testid="retirement-save-btn" onClick={() => props.onSave({})}>Save</button>
    </div>
  )),
}))
vi.mock('../hooks/useMilestoneData.js', () => ({
  useMilestoneData: vi.fn(() => ({ shouldRender: true, milestones: [] })),
}))

// ── Import mocked modules for test manipulation ───────────────────────────────
import { useMilestoneData } from '../hooks/useMilestoneData.js'

// ── Default fetch routes ──────────────────────────────────────────────────────
function setupDefaultFetch(retirementOverride = MOCK_RETIREMENT) {
  mockFetch({
    '/api/networth/by-type': MOCK_NETWORTH_BY_TYPE,
    '/api/retirement':       retirementOverride,
  })
}

describe('ForecastingPage', () => {
  beforeEach(() => {
    setupDefaultFetch()
    vi.mocked(useMilestoneData).mockReturnValue({ shouldRender: true, milestones: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Loading and error states ──────────────────────────────────────────────

  it('shows loading state before data arrives', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<ForecastingPage />)
    expect(screen.getByTestId('forecasting-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('forecasting-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('forecasting-chart')).not.toBeInTheDocument()
  })

  it('renders error state when API fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Connection refused')))
    render(<ForecastingPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not connect/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('forecasting-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('forecasting-summary')).not.toBeInTheDocument()
  })

  // ── Page title ────────────────────────────────────────────────────────────

  it('renders page title "Milestones"', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.queryByTestId('forecasting-loading')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Milestones')
  })

  // ── Core sections render after data loads ─────────────────────────────────

  it('renders ForecastingSummary after data loads', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-summary')).toBeInTheDocument())
  })

  it('renders MilestoneCardsView when shouldRender is true', async () => {
    vi.mocked(useMilestoneData).mockReturnValue({ shouldRender: true, milestones: [] })
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('milestone-cards-view')).toBeInTheDocument())
  })

  it('does not render MilestoneCardsView when shouldRender is false', async () => {
    vi.mocked(useMilestoneData).mockReturnValue({ shouldRender: false, milestones: [] })
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-summary')).toBeInTheDocument())
    expect(screen.queryByTestId('milestone-cards-view')).not.toBeInTheDocument()
  })

  it('renders ForecastingChart after data loads', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-chart')).toBeInTheDocument())
  })

  it('renders ForecastingControls after data loads', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-controls')).toBeInTheDocument())
  })

  it('renders RetirementPanel after data loads', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('retirement-panel')).toBeInTheDocument())
  })

  // ── ForecastingSetup gate ─────────────────────────────────────────────────

  it('renders ForecastingSetup when retirement.exists is false', async () => {
    setupDefaultFetch(MOCK_RETIREMENT_EMPTY)
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-setup')).toBeInTheDocument())
  })

  it('does not render ForecastingSetup when retirement.exists is true', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-summary')).toBeInTheDocument())
    expect(screen.queryByTestId('forecasting-setup')).not.toBeInTheDocument()
  })

  // ── Section order ─────────────────────────────────────────────────────────

  it('section order: Summary before Chart', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-summary')).toBeInTheDocument())
    const summary = screen.getByTestId('forecasting-summary')
    const chart   = screen.getByTestId('forecasting-chart')
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means summary precedes chart
    expect(summary.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('section order: MilestoneCardsView between Summary and Chart', async () => {
    vi.mocked(useMilestoneData).mockReturnValue({ shouldRender: true, milestones: [] })
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('milestone-cards-view')).toBeInTheDocument())
    const summary  = screen.getByTestId('forecasting-summary')
    const cards    = screen.getByTestId('milestone-cards-view')
    const chart    = screen.getByTestId('forecasting-chart')
    expect(summary.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cards.compareDocumentPosition(chart)   & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('section order: Controls below Chart', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-controls')).toBeInTheDocument())
    const chart    = screen.getByTestId('forecasting-chart')
    const controls = screen.getByTestId('forecasting-controls')
    expect(chart.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('section order: RetirementPanel below Controls', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('retirement-panel')).toBeInTheDocument())
    const controls = screen.getByTestId('forecasting-controls')
    const panel    = screen.getByTestId('retirement-panel')
    expect(controls.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // ── handleEditSettings ────────────────────────────────────────────────────

  it('handleEditSettings calls scrollIntoView (not navigate)', async () => {
    const scrollMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollMock

    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('forecasting-summary')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  // ── handleSaveRetirement ──────────────────────────────────────────────────

  it('handleSaveRetirement calls saveRetirement then re-fetches retirement', async () => {
    const { saveRetirement, fetchRetirement } = await import('../api.js')
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('retirement-panel')).toBeInTheDocument())

    const initialFetchCount = global.fetch.mock.calls.length
    fireEvent.click(screen.getByTestId('retirement-save-btn'))

    await waitFor(() => {
      // After save, fetchRetirement is called again — fetch count grows by at least 1
      expect(global.fetch.mock.calls.length).toBeGreaterThan(initialFetchCount)
    })

    const urls = global.fetch.mock.calls.map((c) => c[0])
    // The re-fetch must hit /api/retirement
    expect(urls.filter((u) => u.includes('/api/retirement')).length).toBeGreaterThanOrEqual(2)
  })

  it('handleSaveRetirement sets retirementLoading during save', async () => {
    // Keep save in-flight so we can inspect the loading state
    let resolveSave
    const savePromise = new Promise((res) => { resolveSave = res })

    mockFetch({
      '/api/networth/by-type': MOCK_NETWORTH_BY_TYPE,
      '/api/retirement':       MOCK_RETIREMENT,
    })

    // Override only the POST /api/retirement call (saveRetirement) to be slow
    const originalFetch = global.fetch
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/retirement') && opts?.method === 'POST') {
        return savePromise.then(() => ({ ok: true, json: () => Promise.resolve({}) }))
      }
      return originalFetch(url, opts)
    })

    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('retirement-panel')).toBeInTheDocument())

    expect(screen.getByTestId('retirement-panel').dataset.loading).toBe('false')
    fireEvent.click(screen.getByTestId('retirement-save-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('retirement-panel').dataset.loading).toBe('true')
    })

    // Resolve the in-flight save
    await act(async () => { resolveSave() })
    await waitFor(() => {
      expect(screen.getByTestId('retirement-panel').dataset.loading).toBe('false')
    })
  })

  it('handleSaveRetirement sets retirementError on failure', async () => {
    mockFetch({
      '/api/networth/by-type': MOCK_NETWORTH_BY_TYPE,
      '/api/retirement':       MOCK_RETIREMENT,
    })

    // Override POST /api/retirement to reject
    const originalFetch = global.fetch
    global.fetch = vi.fn((url, opts) => {
      if (url.includes('/api/retirement') && opts?.method === 'POST') {
        return Promise.reject(new Error('Save failed'))
      }
      return originalFetch(url, opts)
    })

    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('retirement-panel')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('retirement-save-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('retirement-panel').dataset.error).toMatch(/Save failed/)
    })
  })

  // ── Refresh button ────────────────────────────────────────────────────────

  it('Refresh button re-fetches data', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.queryByTestId('forecasting-loading')).not.toBeInTheDocument())

    const callsBefore = global.fetch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore)
    })

    const allUrls = global.fetch.mock.calls.map((c) => c[0])
    const byTypeCount   = allUrls.filter((u) => u.includes('/api/networth/by-type')).length
    const retirementCount = allUrls.filter((u) => u.includes('/api/retirement')).length
    // Both URLs fetched at least twice (initial load + refresh)
    expect(byTypeCount).toBeGreaterThanOrEqual(2)
    expect(retirementCount).toBeGreaterThanOrEqual(2)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('shows invalid age warning when target age <= current age', async () => {
    // isRetirementTargetInvalid computes y independently (not via the `years` useMemo which
    // returns null for non-positive values), so it correctly returns true when target <= current.
    setupDefaultFetch({ ...MOCK_RETIREMENT, current_age: 65, target_retirement_age: 60 })
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('invalid-age-warning')).toBeInTheDocument())
    expect(screen.queryByTestId('forecasting-summary')).not.toBeInTheDocument()
    expect(screen.getByTestId('retirement-panel')).toBeInTheDocument()
  })

  it('shows no-investment-accounts empty state when investableCapital is null', async () => {
    // getInvestableCapital returns null only when typeData has no series entries at all
    // (series: [] triggers the `!typeData?.series?.length` guard → returns null).
    // A series with Cash/Debt but no Retirement/Brokerage returns 0, not null.
    const noSeriesTypeData = {
      ...MOCK_NETWORTH_BY_TYPE,
      series: [],
    }
    mockFetch({
      '/api/networth/by-type': noSeriesTypeData,
      '/api/retirement':       MOCK_RETIREMENT,
    })
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.getByTestId('no-investment-accounts')).toBeInTheDocument())
  })

  it('does not crash when retirement returns exists=false on initial load', async () => {
    setupDefaultFetch(MOCK_RETIREMENT_EMPTY)
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.queryByTestId('forecasting-loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('forecasting-setup')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ── Fetch count ───────────────────────────────────────────────────────────

  it('makes 2 fetch calls on mount (fetchNetworthByType + fetchRetirement)', async () => {
    render(<ForecastingPage />)
    await waitFor(() => expect(screen.queryByTestId('forecasting-loading')).not.toBeInTheDocument())
    expect(global.fetch.mock.calls.length).toBe(2)
    const urls = global.fetch.mock.calls.map((c) => c[0])
    expect(urls.some((u) => u.includes('/api/networth/by-type'))).toBe(true)
    expect(urls.some((u) => u.includes('/api/retirement'))).toBe(true)
  })
})
