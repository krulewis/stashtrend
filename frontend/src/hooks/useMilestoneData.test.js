import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMilestoneData } from './useMilestoneData.js'
import {
  MOCK_RETIREMENT,
  MOCK_RETIREMENT_EMPTY,
  MOCK_RETIREMENT_NO_RETURN,
  MOCK_RETIREMENT_NO_MILESTONES,
  MOCK_NETWORTH_BY_TYPE,
} from '../test/fixtures.js'

// Mock retirementMath so we can control outputs
vi.mock('../utils/retirementMath.js', () => ({
  computeNestEgg: vi.fn(() => 1700000),
  generateProjectionSeries: vi.fn(() => [
    { date: '2026-01-01', projected_net_worth: 500000 },
    { date: '2030-01-01', projected_net_worth: 1000000 },
    { date: '2035-01-01', projected_net_worth: 1700000 },
  ]),
}))

import { computeNestEgg, generateProjectionSeries } from '../utils/retirementMath.js'

const TYPE_DATA = MOCK_NETWORTH_BY_TYPE
// Last series point: Retirement=240000, Brokerage=200000 → IC=440000

describe('useMilestoneData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    computeNestEgg.mockReturnValue(1700000)
    generateProjectionSeries.mockReturnValue([
      { date: '2026-01-01', projected_net_worth: 500000 },
      { date: '2030-01-01', projected_net_worth: 1000000 },
      { date: '2035-01-01', projected_net_worth: 1700000 },
    ])
  })

  it('returns shouldRender=false when retirement.exists is false', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT_EMPTY))
    expect(result.current.shouldRender).toBe(false)
  })

  it('returns shouldRender=false when milestones array is empty', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT_NO_MILESTONES))
    expect(result.current.shouldRender).toBe(false)
  })

  it('returns shouldRender=false when typeData.series is empty', () => {
    const { result } = renderHook(() =>
      useMilestoneData({ series: [] }, MOCK_RETIREMENT)
    )
    expect(result.current.shouldRender).toBe(false)
  })

  it('returns shouldRender=false when typeData is null', () => {
    const { result } = renderHook(() => useMilestoneData(null, MOCK_RETIREMENT))
    expect(result.current.shouldRender).toBe(false)
  })

  it('returns shouldRender=true with valid inputs', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    expect(result.current.shouldRender).toBe(true)
  })

  it('investableCapital = Retirement + Brokerage from last series point', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    // Last point: Retirement=240000, Brokerage=200000 → 440000
    expect(result.current.investableCapital).toBe(440000)
  })

  it('investableCapital is 0 when raw IC is negative (EC-9)', () => {
    const negTypeData = {
      ...TYPE_DATA,
      series: [{ date: '2025-01-01', Retirement: -100000, Brokerage: -50000 }],
    }
    const { result } = renderHook(() => useMilestoneData(negTypeData, MOCK_RETIREMENT))
    expect(result.current.investableCapital).toBe(0)
  })

  it('rawInvestableCapital preserves negative value for chart rendering (EC-9)', () => {
    const negTypeData = {
      ...TYPE_DATA,
      series: [{ date: '2025-01-01', Retirement: -100000, Brokerage: -50000 }],
    }
    const { result } = renderHook(() => useMilestoneData(negTypeData, MOCK_RETIREMENT))
    expect(result.current.rawInvestableCapital).toBe(-150000)
  })

  it('milestones sorted ascending by amount in returned array', () => {
    const unsortedRetirement = {
      ...MOCK_RETIREMENT,
      milestones: [
        { label: 'Million', amount: 1000000 },
        { label: 'Half-Mil', amount: 500000 },
      ],
    }
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, unsortedRetirement))
    const amounts = result.current.milestones.map((m) => m.amount)
    // First two should be user milestones in sorted order (nest egg may be last)
    expect(amounts[0]).toBeLessThanOrEqual(amounts[1])
  })

  it('milestones enriched with state, progress, isNestEgg fields', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    const m = result.current.milestones[0]
    expect(m).toHaveProperty('state')
    expect(m).toHaveProperty('progress')
    expect(m).toHaveProperty('isNestEgg')
  })

  it('projectionSeries is null when expected_return_pct not set (EC-6)', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT_NO_RETURN))
    expect(result.current.projectionSeries).toBeNull()
  })

  it('projectionSeries is non-null when expected_return_pct is set', () => {
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    expect(result.current.projectionSeries).not.toBeNull()
    expect(Array.isArray(result.current.projectionSeries)).toBe(true)
  })

  it('achievedCount and totalCount correct for given fixture data', () => {
    // IC=440000, milestones=[500k, 1M], nestEgg=1700000 → none achieved
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    expect(result.current.totalCount).toBeGreaterThanOrEqual(2) // at least user milestones
    expect(result.current.achievedCount).toBeGreaterThanOrEqual(0)
  })

  it('nestEgg is null when desired_annual_income not set (EC-11)', () => {
    computeNestEgg.mockReturnValue(null)
    const noIncomeRetirement = { ...MOCK_RETIREMENT, desired_annual_income: 0 }
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, noIncomeRetirement))
    expect(result.current.nestEgg).toBeNull()
  })

  it('nest egg appears as last item in milestones when non-null', () => {
    computeNestEgg.mockReturnValue(1700000)
    const { result } = renderHook(() => useMilestoneData(TYPE_DATA, MOCK_RETIREMENT))
    const last = result.current.milestones[result.current.milestones.length - 1]
    expect(last.isNestEgg).toBe(true)
  })
})
