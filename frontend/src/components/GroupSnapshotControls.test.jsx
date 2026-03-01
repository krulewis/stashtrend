import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import GroupSnapshotControls from './GroupSnapshotControls'

// Groups where 1 and 3 share an account — they conflict
const MOCK_GROUPS = [
  { id: 1, name: 'Liquid Cash',  color: '#6366f1', account_ids: ['acc1', 'acc2'] },
  { id: 2, name: 'Debt',         color: '#f87171', account_ids: ['acc3'] },
  { id: 3, name: 'Investments',  color: '#34d399', account_ids: ['acc2'] }, // shares acc2 with group 1
]

const NO_CONFLICTS   = { 1: new Set(), 2: new Set(), 3: new Set() }
const WITH_CONFLICTS = { 1: new Set([3]), 2: new Set(), 3: new Set([1]) }

const MOCK_CONFIGS = [
  { id: 1, name: 'Net Worth View', group_ids: [1, 2] },
]

const defaultProps = {
  groups:          MOCK_GROUPS,
  selectedGroupIds: new Set(),
  configs:         [],
  activeConfigId:  null,
  conflictMap:     NO_CONFLICTS,
  onGroupToggle:   vi.fn(),
  onSelectConfig:  vi.fn(),
  onSaveConfig:    vi.fn(),
  onDeleteConfig:  vi.fn(),
}

describe('GroupSnapshotControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Group chips ──────────────────────────────────────────────────────────

  describe('group chips', () => {
    it('renders one chip per group', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      expect(screen.getByRole('button', { name: /Liquid Cash/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Debt/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Investments/ })).toBeInTheDocument()
    })

    it('calls onGroupToggle with group id when chip is clicked', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /Liquid Cash/ }))
      expect(defaultProps.onGroupToggle).toHaveBeenCalledWith(1)
    })

    it('marks no chips as active when selectedGroupIds is an empty Set', () => {
      render(<GroupSnapshotControls {...defaultProps} selectedGroupIds={new Set()} />)
      MOCK_GROUPS.forEach((g) => {
        const chip = screen.getByRole('button', { name: new RegExp(g.name) })
        expect(chip).toHaveAttribute('aria-pressed', 'false')
      })
    })

    it('marks only selected chips as active when selectedGroupIds is a Set', () => {
      render(<GroupSnapshotControls {...defaultProps} selectedGroupIds={new Set([1])} />)
      expect(screen.getByRole('button', { name: /Liquid Cash/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /Debt/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /Investments/ })).toHaveAttribute('aria-pressed', 'false')
    })

    it('disables a chip when it conflicts with a currently selected group', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      expect(screen.getByRole('button', { name: /Investments/ })).toBeDisabled()
    })

    it('does not call onGroupToggle when a conflicted chip is clicked', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /Investments/ }))
      expect(defaultProps.onGroupToggle).not.toHaveBeenCalled()
    })

    it('shows a conflict tooltip title on disabled chips', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      const chip = screen.getByRole('button', { name: /Investments/ })
      expect(chip).toHaveAttribute('title', expect.stringMatching(/account/i))
    })

    it('names the conflicting group in the blocked chip tooltip', () => {
      // Investments (id=3) is blocked because Liquid Cash (id=1) is selected
      // The tooltip should name the conflicting group, not just say "an account"
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      const chip = screen.getByRole('button', { name: /Investments/ })
      expect(chip).toHaveAttribute('title', expect.stringContaining('Liquid Cash'))
    })

    it('does not show a title on chips that are not blocked', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      // Debt (id=2) has no conflicts — should have no title at all
      expect(screen.getByRole('button', { name: /Debt/ })).not.toHaveAttribute('title')
    })

    it('does not disable chips when selectedGroupIds is an empty Set (no group selected yet)', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set()}
          conflictMap={WITH_CONFLICTS}
        />
      )
      MOCK_GROUPS.forEach((g) => {
        const chip = screen.getByRole('button', { name: new RegExp(g.name) })
        expect(chip).not.toBeDisabled()
      })
    })

    // ── × deselect affordance ─────────────────────────────────────────────────

    it('renders an × inside selected chips', () => {
      render(<GroupSnapshotControls {...defaultProps} selectedGroupIds={new Set([1])} />)
      expect(screen.getByRole('button', { name: /Liquid Cash/ })).toHaveTextContent('×')
    })

    it('does not render an × inside unselected chips', () => {
      render(<GroupSnapshotControls {...defaultProps} selectedGroupIds={new Set([1])} />)
      expect(screen.getByRole('button', { name: /Debt/ })).not.toHaveTextContent('×')
    })

    // ── Bug 2 regression: deadlock when both conflicting groups are selected ──

    it('does not disable a selected chip even when its conflict partner is also selected', () => {
      // Bug: when both group 1 (Liquid Cash) and group 3 (Investments) are selected
      // and they conflict, the old isBlocked returned true for BOTH — making both
      // uncheckable. After fix, selected chips are never blocked.
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1, 3])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      expect(screen.getByRole('button', { name: /Liquid Cash/ })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: /Investments/ })).not.toBeDisabled()
    })

    it('calls onGroupToggle when a selected chip is clicked even if its conflict partner is selected', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          selectedGroupIds={new Set([1, 3])}
          conflictMap={WITH_CONFLICTS}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /Liquid Cash/ }))
      expect(defaultProps.onGroupToggle).toHaveBeenCalledWith(1)
    })
  })

  // ── Config pills ─────────────────────────────────────────────────────────

  describe('config pills', () => {
    it('renders a pill for each saved config', () => {
      render(<GroupSnapshotControls {...defaultProps} configs={MOCK_CONFIGS} />)
      expect(screen.getByRole('button', { name: /Net Worth View/ })).toBeInTheDocument()
    })

    it('calls onSelectConfig with the config object when a pill is clicked', () => {
      render(<GroupSnapshotControls {...defaultProps} configs={MOCK_CONFIGS} />)
      fireEvent.click(screen.getByRole('button', { name: /Net Worth View/ }))
      expect(defaultProps.onSelectConfig).toHaveBeenCalledWith(MOCK_CONFIGS[0])
    })

    it('marks the active config pill with aria-pressed true', () => {
      render(
        <GroupSnapshotControls
          {...defaultProps}
          configs={MOCK_CONFIGS}
          activeConfigId={1}
        />
      )
      expect(screen.getByRole('button', { name: /Net Worth View/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('renders no config pills when configs list is empty', () => {
      render(<GroupSnapshotControls {...defaultProps} configs={[]} />)
      expect(screen.queryByTestId('config-pill')).not.toBeInTheDocument()
    })
  })

  // ── Save config ──────────────────────────────────────────────────────────

  describe('save config', () => {
    it('renders a save button', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })

    it('shows a name input after clicking save button', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument()
    })

    it('calls onSaveConfig with the entered name on submit', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      const input = screen.getByPlaceholderText(/name/i)
      fireEvent.change(input, { target: { value: 'My Custom View' } })
      fireEvent.submit(input.closest('form'))
      expect(defaultProps.onSaveConfig).toHaveBeenCalledWith('My Custom View')
    })

    it('does not call onSaveConfig when name is empty', () => {
      render(<GroupSnapshotControls {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      const input = screen.getByPlaceholderText(/name/i)
      fireEvent.submit(input.closest('form'))
      expect(defaultProps.onSaveConfig).not.toHaveBeenCalled()
    })
  })
})
