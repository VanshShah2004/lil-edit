import { type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { ACCENT, computeDelta, deltaColor } from "./format";
import { NoDataYet } from "./states";

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  // Raw current/previous for the delta chip. Omit `previous` to hide the chip.
  current?: number | null;
  previous?: number | null;
  higherIsBetter?: boolean;
  // Optional sparkline (small, only where a trend adds meaning).
  spark?: number[];
  // Marks a metric that only accrues once tracking has data — renders a subtle
  // "No data yet" hint instead of a misleading 0 when current is null/0 and there
  // is no comparison.
  tracksLater?: boolean;
  hint?: string;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  current,
  previous,
  higherIsBetter = true,
  spark,
  tracksLater,
  hint,
  onClick,
}: KpiCardProps) {
  const hasComparison = previous != null;
  const delta = hasComparison ? computeDelta(current, previous, higherIsBetter) : null;
  const showNoData = tracksLater && (current == null || current === 0) && !hasComparison;

  const DirIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;

  const clickable = !!onClick;
  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={onClick}
      title={hint}
      className={cn(
        "group relative flex flex-col rounded-xl border border-gray-400 bg-white p-4 text-left transition-shadow",
        clickable && "cursor-pointer hover:border-gray-500 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-bold leading-none text-gray-900 tabular-nums">
          {showNoData ? <span className="text-lg text-gray-300">—</span> : value}
        </span>
        {spark && spark.length > 1 && !showNoData && (
          <div className="h-8 w-16 shrink-0 opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  fill={`url(#spark-${label.replace(/\s/g, "")})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {showNoData ? (
          <NoDataYet label={label} />
        ) : delta ? (
          <>
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums"
              style={{ color: deltaColor(delta) }}
            >
              <DirIcon className="h-3 w-3" />
              {delta.label}
            </span>
            <span className="text-[11px] text-gray-400">vs prev</span>
          </>
        ) : (
          <span className="text-[11px] text-gray-300">{hint ? "" : " "}</span>
        )}
      </div>
    </Wrapper>
  );
}
