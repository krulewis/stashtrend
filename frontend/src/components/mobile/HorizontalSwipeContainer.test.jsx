import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import HorizontalSwipeContainer from './HorizontalSwipeContainer.jsx'

// These tests MUST fail until HorizontalSwipeContainer.jsx is implemented.
// HorizontalSwipeContainer is a CSS scroll-snap wrapper for two view panes
// with inline dot tab indicators.

// jsdom does not implement scrollTo — stub it so the useEffect in
// HorizontalSwipeContainer does not throw on mount.
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
})

function renderContainer(props = {}) {
  return render(
    <HorizontalSwipeContainer
      activeIndex={0}
      onIndexChange={vi.fn()}
      labels={['Month detail view', 'Monthly summary view']}
      {...props}
    >
      <div data-testid="pane-0">Month Detail</div>
      <div data-testid="pane-1">Monthly Summary</div>
    </HorizontalSwipeContainer>
  )
}

describe('HorizontalSwipeContainer', () => {
  // ── Renders both children ──────────────────────────────────────────────────

  it('renders the first child pane', () => {
    renderContainer()
    expect(screen.getByTestId('pane-0')).toBeInTheDocument()
  })

  it('renders the second child pane', () => {
    renderContainer()
    expect(screen.getByTestId('pane-1')).toBeInTheDocument()
  })

  it('renders both child pane text labels', () => {
    renderContainer()
    expect(screen.getByText('Month Detail')).toBeInTheDocument()
    expect(screen.getByText('Monthly Summary')).toBeInTheDocument()
  })

  // ── Pane role and ARIA ─────────────────────────────────────────────────────

  it('each pane has role="tabpanel"', () => {
    renderContainer()
    const panels = screen.getAllByRole('tabpanel')
    expect(panels).toHaveLength(2)
  })

  // ── Dot indicators (ViewIndicator) ─────────────────────────────────────────

  it('renders a tablist for dot indicators', () => {
    renderContainer()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('renders exactly two dot tab buttons', () => {
    renderContainer()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
  })

  it('first dot tab has aria-label "Month detail view"', () => {
    renderContainer()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-label')).toBe('Month detail view')
  })

  it('second dot tab has aria-label "Monthly summary view"', () => {
    renderContainer()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[1].getAttribute('aria-label')).toBe('Monthly summary view')
  })

  // ── Active index tracking ──────────────────────────────────────────────────

  it('first dot is aria-selected="true" when activeIndex=0', () => {
    renderContainer({ activeIndex: 0 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('second dot is aria-selected="true" when activeIndex=1', () => {
    renderContainer({ activeIndex: 1 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('first dot has active CSS class when activeIndex=0', () => {
    const { container } = renderContainer({ activeIndex: 0 })
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs[0].className).toMatch(/dotActive|active/i)
  })

  it('second dot does not have active CSS class when activeIndex=0', () => {
    const { container } = renderContainer({ activeIndex: 0 })
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs[1].className).not.toMatch(/dotActive|active/i)
  })

  // ── Dot click calls onIndexChange ──────────────────────────────────────────

  it('clicking the second dot calls onIndexChange with index 1', () => {
    const onIndexChange = vi.fn()
    renderContainer({ onIndexChange })
    const tabs = screen.getAllByRole('tab')
    fireEvent.click(tabs[1])
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('clicking the first dot calls onIndexChange with index 0', () => {
    const onIndexChange = vi.fn()
    renderContainer({ activeIndex: 1, onIndexChange })
    const tabs = screen.getAllByRole('tab')
    fireEvent.click(tabs[0])
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })

  // ── isLocked prop ──────────────────────────────────────────────────────────

  it('applies locked CSS class to the scroll container when isLocked=true', () => {
    const { container } = renderContainer({ isLocked: true })
    // The scroll container should have a "locked" or similar class
    const scrollContainer = container.querySelector('[class*="container"]')
    expect(scrollContainer).not.toBeNull()
    expect(scrollContainer.className).toMatch(/lock|locked/i)
  })

  it('does not apply locked CSS class when isLocked is not set', () => {
    const { container } = renderContainer()
    const scrollContainer = container.querySelector('[class*="container"]')
    expect(scrollContainer).not.toBeNull()
    expect(scrollContainer.className).not.toMatch(/lock|locked/i)
  })

  // ── labels prop ────────────────────────────────────────────────────────────

  it('uses labels[i] as aria-label on each dot tab when labels prop provided', () => {
    render(
      <HorizontalSwipeContainer
        activeIndex={0}
        onIndexChange={vi.fn()}
        labels={['Heatmap view', 'Month detail view', 'Monthly summary view']}
      >
        <div>Pane 0</div>
        <div>Pane 1</div>
        <div>Pane 2</div>
      </HorizontalSwipeContainer>
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-label')).toBe('Heatmap view')
    expect(tabs[1].getAttribute('aria-label')).toBe('Month detail view')
    expect(tabs[2].getAttribute('aria-label')).toBe('Monthly summary view')
  })

  it('falls back to "View N" aria-label when labels prop is omitted', () => {
    render(
      <HorizontalSwipeContainer
        activeIndex={0}
        onIndexChange={vi.fn()}
      >
        <div>Pane 0</div>
        <div>Pane 1</div>
      </HorizontalSwipeContainer>
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-label')).toBe('View 1')
    expect(tabs[1].getAttribute('aria-label')).toBe('View 2')
  })

  it('falls back to "View N" for indices beyond labels array length', () => {
    render(
      <HorizontalSwipeContainer
        activeIndex={0}
        onIndexChange={vi.fn()}
        labels={['Only one label']}
      >
        <div>Pane 0</div>
        <div>Pane 1</div>
      </HorizontalSwipeContainer>
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-label')).toBe('Only one label')
    expect(tabs[1].getAttribute('aria-label')).toBe('View 2')
  })
})
