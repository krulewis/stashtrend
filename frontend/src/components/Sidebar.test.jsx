import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import Sidebar from './Sidebar.jsx'

// Helper: render Sidebar in MemoryRouter at the given route.
function renderSidebar(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders all 7 nav items with correct labels', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Investments/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budgets/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Milestones/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('each nav item links to the correct href', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toHaveAttribute('href', '/networth')
    expect(screen.getByRole('link', { name: /Investments/ })).toHaveAttribute('href', '/investments')
    expect(screen.getByRole('link', { name: /Account Groups/ })).toHaveAttribute('href', '/groups')
    expect(screen.getByRole('link', { name: /Budgets/ })).toHaveAttribute('href', '/budgets')
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toHaveAttribute('href', '/builder')
    expect(screen.getByRole('link', { name: /Milestones/ })).toHaveAttribute('href', '/milestones')
    expect(screen.getByRole('link', { name: /Sync Data/ })).toHaveAttribute('href', '/sync')
  })

  it('applies active class to the nav item matching the current route', () => {
    renderSidebar('/budgets')
    const budgetsLink = screen.getByRole('link', { name: /Budgets/ })
    // NavLink adds active class automatically when route matches
    expect(budgetsLink.className).toMatch(/navItemActive/)
  })

  it('does not apply active class to non-matching nav items', () => {
    renderSidebar('/budgets')
    const networthLink = screen.getByRole('link', { name: /Net Worth/ })
    const syncLink     = screen.getByRole('link', { name: /Sync Data/ })
    expect(networthLink.className).not.toMatch(/navItemActive/)
    expect(syncLink.className).not.toMatch(/navItemActive/)
  })

  it('has aria-label "Main navigation"', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })
})
