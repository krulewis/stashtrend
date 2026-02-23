/**
 * useResponsive — returns breakpoint booleans that update on window resize.
 *
 * Breakpoints (mobile-first):
 *   isMobile  — viewport < 768px
 *   isTablet  — 768px ≤ viewport < 1024px
 *   isDesktop — viewport ≥ 1024px
 *
 * Use for chart dimensions (height, YAxis width) that must be JS props.
 * Static layout responsiveness is handled via CSS module media queries.
 */
import { useEffect, useState } from 'react'

const BP_TABLET  = 768
const BP_DESKTOP = 1024

function getBreakpoint() {
  const w = window.innerWidth
  return {
    isMobile:  w < BP_TABLET,
    isTablet:  w >= BP_TABLET && w < BP_DESKTOP,
    isDesktop: w >= BP_DESKTOP,
  }
}

export function useResponsive() {
  const [bp, setBp] = useState(getBreakpoint)

  useEffect(() => {
    let frame
    const handler = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBp(getBreakpoint()))
    }
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('resize', handler)
      cancelAnimationFrame(frame)
    }
  }, [])

  return bp
}
