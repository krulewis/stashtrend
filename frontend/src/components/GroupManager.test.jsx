import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import GroupManager from './GroupManager.jsx'
import { MOCK_GROUPS, MOCK_ACCOUNTS, mockFetch } from '../test/fixtures.js'

const onGroupsChanged = vi.fn()

describe('GroupManager', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    onGroupsChanged.mockClear()
  })

  describe('empty state', () => {
    it('shows empty state message when no groups exist', () => {
      render(<GroupManager groups={[]} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      expect(screen.getByText('No groups yet')).toBeInTheDocument()
    })

    it('shows "Create your first group" button in empty state', () => {
      render(<GroupManager groups={[]} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      expect(screen.getByText('Create your first group')).toBeInTheDocument()
    })

    it('opens the new group form when "Create your first group" is clicked', () => {
      render(<GroupManager groups={[]} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getByText('Create your first group'))
      expect(screen.getByText('New Group')).toBeInTheDocument()
    })
  })

  describe('group list', () => {
    it('renders group names in the list', () => {
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      expect(screen.getByText('Liquid Cash')).toBeInTheDocument()
      expect(screen.getByText('Debt')).toBeInTheDocument()
    })

    it('shows account count for each group', () => {
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      expect(screen.getByText('2 accounts')).toBeInTheDocument()
      expect(screen.getByText('1 accounts')).toBeInTheDocument()
    })

    it('opens edit form when edit button is clicked', () => {
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      const editButtons = screen.getAllByTitle('Edit')
      fireEvent.click(editButtons[0])
      expect(screen.getByText('Edit Group')).toBeInTheDocument()
    })

    it('pre-fills the group name in the edit form', () => {
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getAllByTitle('Edit')[0])
      expect(screen.getByDisplayValue('Liquid Cash')).toBeInTheDocument()
    })
  })

  describe('new group form', () => {
    beforeEach(() => {
      render(<GroupManager groups={[]} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getByText('+ New Group'))
    })

    it('shows the new group form title', () => {
      expect(screen.getByText('New Group')).toBeInTheDocument()
    })

    it('disables Save button when name is empty', () => {
      const saveBtn = screen.getByText('Create Group')
      expect(saveBtn).toBeDisabled()
    })

    it('enables Save button after name is entered', () => {
      fireEvent.change(screen.getByPlaceholderText(/e.g. Liquid Assets/), {
        target: { value: 'My New Group' },
      })
      expect(screen.getByText('Create Group')).not.toBeDisabled()
    })

    it('renders account list in picker', () => {
      expect(screen.getByText('Checking')).toBeInTheDocument()
      expect(screen.getByText('Savings')).toBeInTheDocument()
    })

    it('filters accounts by search input', () => {
      fireEvent.change(screen.getByPlaceholderText('Search accounts…'), {
        target: { value: 'Mortgage' },
      })
      expect(screen.getByText('Mortgage')).toBeInTheDocument()
      expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    })

    it('closes the form when Cancel is clicked', () => {
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText('New Group')).not.toBeInTheDocument()
    })

    it('calls onGroupsChanged and closes form on successful save', async () => {
      mockFetch({ '/api/groups': { id: 3, name: 'Test', color: '#6366f1', account_ids: [] } })
      fireEvent.change(screen.getByPlaceholderText(/e.g. Liquid Assets/), {
        target: { value: 'Test Group' },
      })
      fireEvent.click(screen.getByText('Create Group'))
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledOnce()
      })
    })
  })

  describe('delete', () => {
    it('calls onGroupsChanged after successful delete', async () => {
      mockFetch({ '/api/groups/1': {} })
      window.confirm = vi.fn(() => true)
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getAllByTitle('Delete')[0])
      await waitFor(() => {
        expect(onGroupsChanged).toHaveBeenCalledOnce()
      })
    })

    it('does not delete when confirm dialog is cancelled', async () => {
      window.confirm = vi.fn(() => false)
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getAllByTitle('Delete')[0])
      expect(onGroupsChanged).not.toHaveBeenCalled()
    })

    it('shows an error message when DELETE fails', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Server error' }) })
      )
      window.confirm = vi.fn(() => true)
      render(<GroupManager groups={MOCK_GROUPS} accounts={MOCK_ACCOUNTS} onGroupsChanged={onGroupsChanged} />)
      fireEvent.click(screen.getAllByTitle('Delete')[0])
      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })
  })
})
