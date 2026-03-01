/** Shared utilities for recharts-based chart components. */
import { CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'

export const fmtCompact = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(n)

export const fmtFull = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n)

export const formatDateLabel = (d) => {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

/** Format a budget month string (e.g. "2025-11-01") as "Nov '25" for table headers. */
export const fmtBudgetMonth = (m) => {
  const d = new Date(m + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.toLocaleDateString('en-US', { year: '2-digit' })
  return `${month} '${year}`
}

/** Format an ISO timestamp as "Jan 1, 2024, 3:45 PM" (no seconds). */
export function fmtDatetime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return iso }
}

/** Format an ISO timestamp with seconds — "Jan 1, 3:45:00 PM" (sync job detail). */
export function fmtDatetimeSecs(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

export function filterByRange(data, months) {
  if (!months || !data.length) return data
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return data.filter((d) => d.date >= cutoffStr)
}

export function downsample(data, maxPoints = 200) {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

export const AXIS_TICK = { fill: '#64748b', fontSize: 11 }
export const GRID_STROKE = '#2d3348'

function formatSeconds(secs) {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

/** Duration string for a completed run — returns '—' when finishedAt is absent. */
export function durationFinal(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return '—'
  return formatSeconds(Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000))
}

/** Duration string for an in-progress run — falls back to elapsed time when finishedAt is absent. */
export function durationElapsed(startedAt, finishedAt) {
  if (!startedAt) return null
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  return formatSeconds(Math.round((end - new Date(startedAt).getTime()) / 1000))
}

/**
 * Shared tooltip wrapper style for recharts custom tooltips.
 * Uses raw hex because SVG/canvas tooltip backdrops don't support CSS vars.
 */
export const TOOLTIP_STYLE = {
  background: '#1e2130',
  border: '1px solid #2d3348',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#f1f5f9',
  fontSize: 13,
}

/** Raw hex values for recharts SVG attributes (CSS variables don't work in SVG attrs). */
export const COLOR_ACCENT   = '#6366f1'
export const COLOR_POSITIVE = '#34d399'
export const COLOR_NEGATIVE = '#f87171'
export const COLOR_AMBER    = '#f59e0b'

/** Range options shared by both time-series charts; NetWorthChart prepends '1M'. */
export const COMMON_RANGES = [
  { label: '3M',  months: 3  },
  { label: '6M',  months: 6  },
  { label: '1Y',  months: 12 },
  { label: '2Y',  months: 24 },
  { label: 'All', months: null },
]

/**
 * Returns the standard grid + axis + tooltip recharts children shared by
 * GroupsTimeChart and NetWorthChart.
 *
 * NOTE: recharts spreads its children via React.Children.forEach which handles
 * arrays returned by helper functions correctly (verified with recharts 2.x).
 * If upgrading recharts, verify this pattern still works before bumping the version.
 *
 * @param {object} opts
 * @param {number} opts.yAxisWidth  - pixel width for the YAxis (responsive)
 * @param {function} opts.tooltip   - JSX for the Tooltip `content` prop
 */
export function sharedChartElements({ yAxisWidth, tooltip }) {
  return [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />,
    <XAxis
      key="xaxis"
      dataKey="date"
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      tickFormatter={formatDateLabel}
      interval="preserveStartEnd"
    />,
    <YAxis
      key="yaxis"
      tickFormatter={fmtCompact}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      width={yAxisWidth}
    />,
    <Tooltip key="tooltip" content={tooltip} />,
  ]
}
