import { type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, GRID, INK, INK_SOFT, SERIES, compact, shortDate } from "./format";
import { slugify, useHideable } from "./customize";

// Chart rows are loosely typed — payload fields can be null (e.g. a variant with
// no colour hex, a product with no conversion). Recharts tolerates nulls at
// runtime; the wrappers coerce where they read numeric values.
type Datum = Record<string, string | number | null | undefined>;

// ─── Titled chart container ───────────────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  right,
  children,
  className,
  hideId,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  // Override the slug auto-derived from `title` (only if two charts share a title).
  hideId?: string;
}) {
  const { hidden, handlers, jiggleClass, badge } = useHideable(hideId ?? slugify(title), title);
  if (hidden) return null;
  return (
    <div {...handlers} className={`rounded-xl border border-gray-400 bg-white p-5 ${className ?? ""} ${jiggleClass}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
      {badge}
    </div>
  );
}

// ─── Shared tooltip ───────────────────────────────────────────────────────────
interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  labelFormat?: (l: string | number) => string;
  valueFormat?: (v: number, key?: string) => string;
}

function ChartTooltip({ active, label, payload, labelFormat, valueFormat }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-400 bg-white px-3 py-2 shadow-lg">
      {label != null && (
        <p className="mb-1 text-[11px] font-semibold text-gray-500">
          {labelFormat ? labelFormat(label) : String(label)}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-gray-900">
            {valueFormat ? valueFormat(p.value ?? 0, p.dataKey) : compact(p.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Trend chart (one axis; 1–3 series) ───────────────────────────────────────
export interface TrendSeries {
  key: string;
  name: string;
  color?: string;
  area?: boolean;
}

export function TrendChart({
  data,
  series,
  height = 280,
  valueFormat,
  xKey = "bucket",
  xIsDate = true,
}: {
  data: Datum[];
  series: TrendSeries[];
  height?: number;
  valueFormat?: (v: number, key?: string) => string;
  xKey?: string;
  xIsDate?: boolean;
}) {
  const gradientId = (k: string) => `grad-${k}-${series.map((s) => s.key).join("")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
        <defs>
          {series.map((s, i) => {
            const color = s.color ?? SERIES[i % SERIES.length];
            return (
              <linearGradient id={gradientId(s.key)} key={s.key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={s.area === false ? 0 : 0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={xIsDate ? (v) => shortDate(String(v)) : undefined}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => compact(Number(v))}
        />
        <Tooltip
          content={
            <ChartTooltip
              labelFormat={xIsDate ? (l) => shortDate(String(l)) : undefined}
              valueFormat={valueFormat}
            />
          }
          cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        {series.map((s, i) => {
          const color = s.color ?? SERIES[i % SERIES.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId(s.key)})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Horizontal ranked bars (top products / categories) ───────────────────────
// Horizontal so long product names stay readable — the professional choice for
// named categories over vertical bars.
export function RankedBars({
  data,
  valueKey,
  labelKey,
  height = 300,
  valueFormat = (v) => compact(v),
  colorByIndex = false,
}: {
  data: Datum[];
  valueKey: string;
  labelKey: string;
  height?: number;
  valueFormat?: (v: number) => string;
  colorByIndex?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} tickFormatter={(v) => compact(Number(v))} />
        <YAxis
          type="category"
          dataKey={labelKey}
          tick={{ fontSize: 11, fill: INK_SOFT }}
          tickLine={false}
          axisLine={false}
          width={130}
          tickFormatter={(v) => (String(v).length > 20 ? `${String(v).slice(0, 19)}…` : String(v))}
        />
        <Tooltip content={<ChartTooltip valueFormat={(v) => valueFormat(v)} />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={colorByIndex ? SERIES[i % SERIES.length] : SERIES[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Vertical bars (distributions — rating counts, etc.) ──────────────────────
export function ColumnBars({
  data,
  valueKey,
  labelKey,
  height = 260,
  color = SERIES[0],
  valueFormat = (v) => compact(v),
}: {
  data: Datum[];
  valueKey: string;
  labelKey: string;
  height?: number;
  color?: string;
  valueFormat?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={labelKey} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => compact(Number(v))} />
        <Tooltip content={<ChartTooltip valueFormat={(v) => valueFormat(v)} />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]} fill={color} maxBarSize={48} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Donut (revenue by category, new-vs-returning) ────────────────────────────
export function DonutChart({
  data,
  valueKey,
  labelKey,
  height = 280,
  valueFormat = (v) => compact(v),
}: {
  data: Datum[];
  valueKey: string;
  labelKey: string;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={height} className="max-w-[280px]">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={labelKey}
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormat={(v) => valueFormat(v)} />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend + values — identity is never colour-alone. */}
      <ul className="w-full space-y-1.5 sm:max-w-[240px]">
        {data.map((d, i) => {
          const v = Number(d[valueKey]) || 0;
          const share = total > 0 ? (v / total) * 100 : 0;
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
              <span className="truncate text-gray-600" style={{ color: INK }}>
                {String(d[labelKey])}
              </span>
              <span className="ml-auto shrink-0 font-semibold tabular-nums text-gray-900">{valueFormat(v)}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-gray-400">{share.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
