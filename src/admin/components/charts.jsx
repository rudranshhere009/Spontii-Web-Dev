import { useEffect, useId, useRef, useState } from 'react'
import { formatNumber } from '../format'

/*
 * Small single-series charts for the dashboard, drawn as inline SVG with the
 * app's theme tokens, so light and dark mode both work. One series per chart
 * (small multiples), so the title names it and no legend is needed. Every
 * chart has a hover readout and a table view with the same numbers.
 */

const HEIGHT = 168
const PAD = { top: 16, right: 12, bottom: 24, left: 40 }

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/* Rounds up to 1, 2 or 5 × 10^n so the top tick is a clean number. */
function niceMax(value) {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((multiple) => multiple * power >= value)
  return step * power
}

function compact(value) {
  if (value >= 10000) return `${Math.round(value / 1000)}K`
  return formatNumber(value)
}

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLabel = (day) => shortDate.format(new Date(`${day}T00:00:00Z`))

/* Column for bars: 4px rounded data end, square at the baseline. */
function columnPath(x, y, width, height) {
  if (height <= 0) return ''
  const r = Math.min(4, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

function Frame({ title, total, totalLabel, children, table, loading }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <figure className={`rounded-2xl border border-border bg-surface-2 p-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <figcaption className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {total != null && <p className="text-xs text-muted">{totalLabel}: <span className="font-semibold text-text">{formatNumber(total)}</span></p>}
        </div>
        <button type="button" onClick={() => setShowTable((value) => !value)} className="text-xs font-semibold text-muted hover:text-text">
          {showTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>
      {showTable ? table : children}
    </figure>
  )
}

function DataTableView({ dates, values }) {
  return (
    <div className="max-h-[168px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="py-1 font-semibold">Day</th>
            <th scope="col" className="py-1 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...dates].reverse().map((day, index) => (
            <tr key={day} className="border-t border-border/60">
              <td className="py-1">{dayLabel(day)}</td>
              <td className="py-1 text-right">{formatNumber(values[values.length - 1 - index])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Axes({ width, max, dates, x }) {
  const ticks = [0, max / 2, max]
  const plotBottom = HEIGHT - PAD.bottom
  const y = (value) => plotBottom - (value / max) * (plotBottom - PAD.top)
  const labelDays = [0, Math.floor((dates.length - 1) / 2), dates.length - 1]
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" strokeWidth="1" />
          <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {compact(tick)}
          </text>
        </g>
      ))}
      {labelDays.map((index, position) => (
        <text
          key={index}
          x={x(index)}
          y={HEIGHT - 6}
          fontSize="11"
          fill="var(--color-muted)"
          textAnchor={position === 0 ? 'start' : position === 2 ? 'end' : 'middle'}
        >
          {dayLabel(dates[index])}
        </text>
      ))}
    </g>
  )
}

function Tooltip({ left, day, value, unit }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs"
      style={{ left }}
    >
      <span className="font-extrabold tabular-nums">{formatNumber(value)}</span>
      <span className="ml-1.5 text-muted">{unit} · {dayLabel(day)}</span>
    </div>
  )
}

/* Daily counts as columns. Each column's full-height slot is its hover target. */
export function ColumnChart({ title, dates, values, unit, loading }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = niceMax(Math.max(...values, 0))
  const plotWidth = Math.max(width - PAD.left - PAD.right, 0)
  const slot = plotWidth / Math.max(values.length, 1)
  const barWidth = Math.max(Math.min(24, slot - 2), 1)
  const x = (index) => PAD.left + slot * index + slot / 2
  const plotBottom = HEIGHT - PAD.bottom
  const barHeight = (value) => (value / max) * (plotBottom - PAD.top)

  return (
    <Frame title={title} total={total} totalLabel={`Total, last ${values.length} days`} loading={loading} table={<DataTableView dates={dates} values={values} />}>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}: ${formatNumber(total)} over ${values.length} days`}>
            <Axes width={width} max={max} dates={dates} x={x} />
            {values.map((value, index) => (
              <g key={dates[index]}>
                <path
                  d={columnPath(x(index) - barWidth / 2, plotBottom - barHeight(value), barWidth, barHeight(value))}
                  fill="var(--color-mint)"
                  opacity={hover === null || hover === index ? 1 : 0.45}
                />
                <rect
                  x={PAD.left + slot * index}
                  y={PAD.top}
                  width={slot}
                  height={plotBottom - PAD.top}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                />
              </g>
            ))}
          </svg>
        )}
        {hover !== null && <Tooltip left={x(hover)} day={dates[hover]} value={values[hover]} unit={unit} />}
      </div>
    </Frame>
  )
}

/* A daily level (like active users) as a 2px line over a light wash, with a crosshair. */
export function LineChart({ title, dates, values, unit, loading }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const gradientId = useId()
  const max = niceMax(Math.max(...values, 0))
  const plotWidth = Math.max(width - PAD.left - PAD.right, 0)
  const step = plotWidth / Math.max(values.length - 1, 1)
  const x = (index) => PAD.left + step * index
  const plotBottom = HEIGHT - PAD.bottom
  const y = (value) => plotBottom - (value / max) * (plotBottom - PAD.top)
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const last = values.length - 1

  function onMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const index = Math.round((event.clientX - bounds.left - PAD.left) / step)
    setHover(Math.min(Math.max(index, 0), last))
  }

  return (
    <Frame title={title} total={values[last]} totalLabel="Today" loading={loading} table={<DataTableView dates={dates} values={values} />}>
      <div ref={ref} className="relative" onPointerMove={width ? onMove : undefined} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}: ${formatNumber(values[last])} today`}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-mint)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <Axes width={width} max={max} dates={dates} x={x} />
            <polygon points={`${x(0)},${plotBottom} ${points} ${x(last)},${plotBottom}`} fill={`url(#${gradientId})`} />
            <polyline points={points} fill="none" stroke="var(--color-mint)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={plotBottom} stroke="var(--color-muted)" strokeWidth="1" />
            )}
            <circle
              cx={x(hover ?? last)}
              cy={y(values[hover ?? last])}
              r="4"
              fill="var(--color-mint)"
              stroke="var(--color-surface-2)"
              strokeWidth="2"
            />
          </svg>
        )}
        {hover !== null && <Tooltip left={x(hover)} day={dates[hover]} value={values[hover]} unit={unit} />}
      </div>
    </Frame>
  )
}

/* Ranked horizontal bars with the value at the tip; labels stay in text colors. */
export function BarList({ title, items, unit, empty = 'No data yet.' }) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <figure className="rounded-2xl border border-border bg-surface-2 p-4">
      <figcaption className="mb-3 text-sm font-bold">{title}</figcaption>
      {!items.length && <p className="py-6 text-center text-sm text-muted">{empty}</p>}
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.label} title={`${item.label}: ${formatNumber(item.value)} ${unit}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-semibold">{item.label}</span>
              <span className="tabular-nums text-muted">{formatNumber(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-text/[0.06]">
              <div className="h-2 rounded-full bg-mint" style={{ width: `${Math.max((item.value / max) * 100, item.value ? 2 : 0)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  )
}
