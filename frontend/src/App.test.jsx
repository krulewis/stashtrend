import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from './App.jsx'
import { MOCK_STATS, MOCK_HISTORY, MOCK_ACCOUNTS, MOCK_SETUP_STATUS, mockFetch } from './test/fixtures.js'

// Mock child pages so their own fetch calls don't interfere with App-level tests
vi.mock('./pages/GroupsPage.jsx',       () => ({ default: () => <div data-testid="groups-page" /> }))
vi.mock('./pages/BudgetPage.jsx',       () => ({ default: () => <div data-testid="budget-page" /> }))
vi.mock('./pages/BudgetBuilderPage.jsx',() => ({ default: () => <div data-testid="builder-page" /> }))
vi.mock('./pages/SyncPage.jsx',        () => ({ default: () => <div data-testid="sync-page" /> }))
vi.mock('./pages/SetupPage.jsx',       () => ({ default: ({ onComplete }) => (
  <div data-testid="setup-page">
    <button onClick={onComplete}>Complete Setup</button>
  </div>
)}))
vi.mock('./pages/NetWorthPage.jsx',    () => ({ default: () => <div data-testid="networth-page" /> }))

// Helper: renders App inside MemoryRouter at the given initial route.
// App uses <Routes> and <NavLink> which require a router context.
// BrowserRouter is in main.jsx (not App.jsx), so tests supply MemoryRouter here.
function renderApp(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  )
}

describe('App', () => {
  beforeEach(() => {
    mockFetch({
      '/api/setup/status':     MOCK_SETUP_STATUS,
      '/api/networth/stats':   MOCK_STATS,
      '/api/networth/history': MOCK_HISTORY,
      '/api/accounts/summary': MOCK_ACCOUNTS,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the app name in the header', async () => {
    renderApp()
    expect(await screen.findByText('Stashtrend')).toBeInTheDocument()
  })

  // Both Sidebar and BottomTabBar render all 5 NAV_ITEMS as links.
  // Both components are in the DOM simultaneously (one hidden via CSS).
  // Use getAllByRole to find all instances and assert count.
  it('renders all nav links in sidebar and bottom tab bar', async () => {
    renderApp()
    await screen.findByText('Stashtrend') // wait for app to load past setup check

    // Each label appears twice: once in Sidebar, once in BottomTabBar
    expect(screen.getAllByRole('link', { name: /Net Worth/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Account Groups/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Budgets/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Budget Builder/ })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Sync Data/ })).toHaveLength(2)
  })

  it('shows Net Worth page by default (no other pages visible)', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('redirects / to /networth', async () => {
    renderApp('/')
    await waitFor(() => {
      expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    })
  })

  it('redirects unknown routes to /networth', async () => {
    renderApp('/bogus')
    await waitFor(() => {
      expect(screen.getByTestId('networth-page')).toBeInTheDocument()
    })
  })

  it('navigates to Account Groups when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    // Use within() to scope to the sidebar's nav element and avoid duplicate links
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Account Groups/ }))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('navigates to Sync Data when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Sync Data/ }))
    expect(screen.getByTestId('sync-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
  })

  it('navigates to Budgets when that link is clicked', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Budgets/ }))
    expect(screen.getByTestId('budget-page')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-page')).not.toBeInTheDocument()
  })

  it('can switch back from Groups to Net Worth', async () => {
    renderApp('/networth')
    await screen.findByText('Stashtrend')
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Account Groups/ }))
    expect(screen.getByTestId('groups-page')).toBeInTheDocument()
    fireEvent.click(within(sidebar).getByRole('link', { name: /Net Worth/ }))
    expect(screen.queryByTestId('groups-page')).not.toBeInTheDocument()
    expect(screen.getByTestId('networth-page')).toBeInTheDocument()
  })

  it('shows loading state while setup status is loading', () => {
    // Never-resolving fetch keeps configured=null
    global.fetch = vi.fn(() => new Promise(() => {}))
    renderApp()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('shows SetupPage when not configured', async () => {
    mockFetch({ '/api/setup/status': { configured: false } })
    renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    })
  })

  it('preserves deep-link route after completing setup', async () => {
    // User deep-links to /budgets before app is configured.
    // Setup gate shows SetupPage. After setup completes, /budgets route renders.
    mockFetch({ '/api/setup/status': { configured: false } })
    renderApp('/budgets')
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    })
    // Simulate completing setup
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
    await waitFor(() => {
      expect(screen.getByTestId('budget-page')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument()
  })
})
