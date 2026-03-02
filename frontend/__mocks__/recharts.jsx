/** Lightweight recharts stubs for jsdom tests. */

export const ResponsiveContainer = ({ height, children }) => (
  <div data-testid="responsive-container" data-height={height != null ? String(height) : undefined}>{children}</div>
)

export const AreaChart      = ({ children }) => <div data-testid="area-chart">{children}</div>
export const LineChart      = ({ children }) => <div data-testid="line-chart">{children}</div>
export const BarChart       = ({ children }) => <div data-testid="bar-chart">{children}</div>
export const PieChart       = ({ children }) => <div data-testid="pie-chart">{children}</div>
export const ComposedChart  = ({ children }) => <div data-testid="composed-chart">{children}</div>

// Non-container chart elements
export const Area         = () => null
export const Line         = () => null
export const Bar          = ({ dataKey, children }) => <div data-testid={dataKey ? `bar-${dataKey}` : undefined}>{children}</div>
export const Pie          = ({ children }) => <>{children}</>
export const Cell         = () => null
export const XAxis        = () => null
export const YAxis        = () => null
export const CartesianGrid = () => null
export const Tooltip      = () => null
export const Legend       = () => null
export const LabelList    = () => null
