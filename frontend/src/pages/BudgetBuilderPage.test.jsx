import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import BudgetBuilderPage from './BudgetBuilderPage.jsx'
import {
  MOCK_AI_CONFIG_UNCONFIGURED,
  MOCK_AI_CONFIG_CONFIGURED,
  MOCK_BUILDER_PROFILE_EMPTY,
  MOCK_BUILDER_REGIONAL_EMPTY,
  MOCK_BUILDER_PLANS_LIST,
  mockFetch,
} from '../test/fixtures.js'

describe('BudgetBuilderPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows AI not configured banner when AI is unconfigured', async () => {
    mockFetch({
      '/api/ai/config': MOCK_AI_CONFIG_UNCONFIGURED,
      '/api/budget-builder/profile': MOCK_BUILDER_PROFILE_EMPTY,
      '/api/budget-builder/regional': MOCK_BUILDER_REGIONAL_EMPTY,
      '/api/budget-builder/plans': { plans: [] },
    })
    render(<BudgetBuilderPage />)
    expect(await screen.findByText(/AI not configured/i)).toBeInTheDocument()
  })

  it('shows profile form when AI is configured', async () => {
    mockFetch({
      '/api/ai/config': MOCK_AI_CONFIG_CONFIGURED,
      '/api/budget-builder/profile': MOCK_BUILDER_PROFILE_EMPTY,
      '/api/budget-builder/regional': MOCK_BUILDER_REGIONAL_EMPTY,
      '/api/budget-builder/plans': { plans: [] },
    })
    render(<BudgetBuilderPage />)
    expect(await screen.findByLabelText(/Expected Monthly Income/i)).toBeInTheDocument()
  })

  it('renders 3-step workflow sections', async () => {
    mockFetch({
      '/api/ai/config': MOCK_AI_CONFIG_CONFIGURED,
      '/api/budget-builder/profile': MOCK_BUILDER_PROFILE_EMPTY,
      '/api/budget-builder/regional': MOCK_BUILDER_REGIONAL_EMPTY,
      '/api/budget-builder/plans': { plans: [] },
    })
    render(<BudgetBuilderPage />)
    expect(await screen.findByText(/Step 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 3/i)).toBeInTheDocument()
  })
})
