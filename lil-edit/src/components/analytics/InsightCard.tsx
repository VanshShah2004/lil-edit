import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

export type InsightTone = "info" | "good" | "warning" | "critical";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  action?: { label: string; to: string };
}

const TONE: Record<InsightTone, { border: string; bg: string; icon: string; Icon: typeof Lightbulb }> = {
  info: { border: "border-gray-200", bg: "bg-gray-50/70", icon: "#6B7280", Icon: Lightbulb },
  good: { border: "border-emerald-200", bg: "bg-emerald-50/60", icon: "#047857", Icon: TrendingUp },
  warning: { border: "border-amber-200", bg: "bg-amber-50/60", icon: "#B45309", Icon: TriangleAlert },
  critical: { border: "border-red-200", bg: "bg-red-50/60", icon: "#DC2626", Icon: TrendingDown },
};

export function InsightCard({ insight }: { insight: Insight }) {
  const t = TONE[insight.tone];
  const Icon = t.Icon;
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70">
          <Icon className="h-4 w-4" style={{ color: t.icon }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{insight.body}</p>
          {insight.action && (
            <Link
              to={insight.action.to}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900"
            >
              {insight.action.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function InsightGrid({ insights, empty }: { insights: Insight[]; empty?: ReactNode }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
        <Lightbulb className="mx-auto h-6 w-6 text-gray-300" />
        <p className="mt-2 text-xs text-gray-400">{empty ?? "No notable signals in this range yet."}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}
