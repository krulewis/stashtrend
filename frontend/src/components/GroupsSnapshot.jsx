import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import styles from './GroupsSnapshot.module.css'
import { useResponsive } from '../hooks/useResponsive'
import GroupSnapshotControls from './GroupSnapshotControls.jsx'
import { fmtCompact, fmtFull, GRID_STROKE } from './chartUtils.jsx'

// Tooltip rendered by recharts — keep inline
const tooltipStyles = {
  wrap:  { background: '#1e2130', border: '1px solid #2d3348', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  name:  { color: '#f1f5f9', fontWeight: 600 },
  total: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 },
  meta:  { fontSize: 12, color: '#94a3b8' },
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={tooltipStyles.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
        <span style={tooltipStyles.name}>{d.name}</span>
      </div>
      <div style={tooltipStyles.total}>{fmtFull(d.total)}</div>
      <div style={tooltipStyles.meta}>{d.account_count} account{d.account_count !== 1 ? 's' : ''}</div>
    </div>
  )
}

const CustomBarLabel = ({ x, y, width, value }) => {
  if (!value || Math.abs(width) < 60) return null
  return (
    <text
      x={x + width / 2}
      y={y + 16}
      fill="rgba(255,255,255,0.75)"
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {fmtCompact(value)}
    </text>
  )
}

export default function GroupsSnapshot({
  snapshot,
  groups = [],
  selectedGroupIds = null,
  configs = [],
  activeConfigId = null,
  conflictMap = {},
  onGroupToggle,
  onSelectConfig,
  onSaveConfig,
  onDeleteConfig,
}) {
  const { isMobile } = useResponsive()

  const showControls = groups.length > 0

  if (!snapshot) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading snapshot…</div>
      </div>
    )
  }

  if (snapshot.length === 0 && groups.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Current Snapshot</h2>
        <div className={styles.emptyState}>
          No groups defined yet — create one to see it here.
        </div>
      </div>
    )
  }

  const data  = [...snapshot].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  const total = data.reduce((sum, d) => sum + (d.total || 0), 0)

  // Chart props not settable via CSS
  const chartHeight = isMobile ? 220 : 280
  const yAxisWidth  = isMobile ? 52  : 72

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Current Snapshot</h2>
        <div className={styles.totalPill}>
          Total: <span className={styles.totalAmt}>{fmtFull(total)}</span>
        </div>
      </div>

      {showControls && (
        <GroupSnapshotControls
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          configs={configs}
          activeConfigId={activeConfigId}
          conflictMap={conflictMap}
          onGroupToggle={onGroupToggle}
          onSelectConfig={onSelectConfig}
          onSaveConfig={onSaveConfig}
          onDeleteConfig={onDeleteConfig}
        />
      )}

      {snapshot.length === 0 ? (
        <div className={styles.emptyState}>
          No groups selected — click a group above to show it here.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data}
              margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={fmtCompact}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={yAxisWidth}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
                <LabelList content={<CustomBarLabel />} dataKey="total" position="insideTop" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Summary table */}
          <div className={styles.table}>
            {data.map((g) => (
              <div key={g.id} className={styles.tableRow}>
                <div className={styles.tableLeft}>
                  {/* dot background is data-driven */}
                  <div className={styles.dot} style={{ background: g.color }} />
                  <span className={styles.tableName}>{g.name}</span>
                  <span className={styles.tableAccounts}>{g.account_count} acct{g.account_count !== 1 ? 's' : ''}</span>
                </div>
                <div className={styles.tableRight}>
                  <span className={styles.tableAmt}>{fmtFull(g.total)}</span>
                  <span className={styles.tablePct}>
                    {total !== 0 ? `${((g.total / Math.abs(total)) * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
