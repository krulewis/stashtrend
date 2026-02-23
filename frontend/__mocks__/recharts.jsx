/**
 * Recharts mock — replaces all chart components with lightweight stubs.
 * Recharts relies on DOM measurements (getBoundingClientRect, ResizeObserver)
 * that aren't available in jsdom, so we replace the whole library.
 *
 * Container components (AreaChart, BarChart, etc.) render their children so
 * that child elements like Cell and LabelList can still be exercised.
 *
 * Usage in a test file:
 *   vi.mock('recharts')  // picks up this file automatically
 */

export const ResponsiveContainer = ({ children }) => (
  <div data-testid="responsive-container">{children}</div>
)

export const AreaChart      = ({ children }) => <div data-testid="area-chart">{children}</div>
export const LineChart      = ({ children }) => <div data-testid="line-chart">{children}</div>
export const BarChart       = ({ children }) => <div data-testid="bar-chart">{children}</div>
export const PieChart       = ({ children }) => <div data-testid="pie-chart">{children}</div>
export const ComposedChart  = ({ children }) => <div data-testid="composed-chart">{children}</div>

// Non-container chart elements — render nothing, just satisfy imports
export const Area         = () => null
export const Line         = () => null
export const Bar          = ({ children }) => <>{children}</>
export const Pie          = ({ children }) => <>{children}</>
export const Cell         = () => null
export const XAxis        = () => null
export const YAxis        = () => null
export const CartesianGrid = () => null
export const Tooltip      = () => null
export const Legend       = () => null
export const LabelList    = () => null
