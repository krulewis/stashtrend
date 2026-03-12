import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import BottomTabBar from './BottomTabBar.jsx'

function renderBottomTabBar(route = '/networth') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomTabBar />
    </MemoryRouter>
  )
}

describe('BottomTabBar', () => {
  it('renders all 7 tab items with correct labels', () => {
    renderBottomTabBar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Investments/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Account Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budgets/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Milestones/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sync Data/ })).toBeInTheDocument()
  })

  it('each tab item links to the correct href', () => {
    renderBottomTabBar()
    expect(screen.getByRole('link', { name: /Net Worth/ })).toHaveAttribute('href', '/networth')
    expect(screen.getByRole('link', { name: /Investments/ })).toHaveAttribute('href', '/investments')
    expect(screen.getByRole('link', { name: /Account Groups/ })).toHaveAttribute('href', '/groups')
    expect(screen.getByRole('link', { name: /Budgets/ })).toHaveAttribute('href', '/budgets')
    expect(screen.getByRole('link', { name: /Budget Builder/ })).toHaveAttribute('href', '/builder')
    expect(screen.getByRole('link', { name: /Milestones/ })).toHaveAttribute('href', '/milestones')
    expect(screen.getByRole('link', { name: /Sync Data/ })).toHaveAttribute('href', '/sync')
  })

  it('applies active class to the tab item matching the current route', () => {
    renderBottomTabBar('/groups')
    const groupsLink = screen.getByRole('link', { name: /Account Groups/ })
    expect(groupsLink.className).toMatch(/tabItemActive/)
  })

  it('does not apply active class to non-matching tab items', () => {
    renderBottomTabBar('/groups')
    const networthLink = screen.getByRole('link', { name: /Net Worth/ })
    expect(networthLink.className).not.toMatch(/tabItemActive/)
  })

  it('has aria-label "Mobile navigation"', () => {
    renderBottomTabBar()
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
  })
})
