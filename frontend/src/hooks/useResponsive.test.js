import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useResponsive } from './useResponsive.js'

function setWidth(width) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

describe('useResponsive', () => {
  let rafCallback
  let rafSpy
  let cafSpy

  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })
    cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns isMobile=true when viewport < 768px', () => {
    setWidth(375)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isDesktop).toBe(false)
  })

  it('returns isTablet=true when viewport is 768–1023px', () => {
    setWidth(900)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(true)
    expect(result.current.isDesktop).toBe(false)
  })

  it('returns isDesktop=true when viewport >= 1024px', () => {
    setWidth(1440)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isDesktop).toBe(true)
  })

  it('updates breakpoint on window resize', () => {
    setWidth(1440)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isDesktop).toBe(true)

    act(() => {
      setWidth(375)
      window.dispatchEvent(new Event('resize'))
      rafCallback?.()
    })

    expect(result.current.isMobile).toBe(true)
    expect(result.current.isDesktop).toBe(false)
  })

  it('removes resize listener and cancels RAF on unmount', () => {
    setWidth(1440)
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useResponsive())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(cafSpy).toHaveBeenCalled()
  })

  it('exact boundary: 768px is tablet not mobile', () => {
    setWidth(768)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(true)
  })

  it('exact boundary: 1024px is desktop not tablet', () => {
    setWidth(1024)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isDesktop).toBe(true)
  })
})
