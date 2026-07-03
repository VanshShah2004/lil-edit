import { AlertCircle, Database, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Loading skeletons ────────────────────────────────────────────────────────
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200/70", className)} style={style} />;
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-400 bg-white p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-16" />
    </div>
  );
}

export function KpiGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-gray-400 bg-white p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-gray-400 bg-white p-5">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty / error / not-yet-tracking states ──────────────────────────────────
export function EmptyState({ title, hint, icon: Icon = Inbox }: { title: string; hint?: string; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-400 bg-white px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-gray-300" />
      <p className="mt-3 text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// Shown where a metric depends on data that only accumulates after the tracking
// layer ships (product views, live presence). Distinct from "no rows in range".
export function NoDataYet({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400" title={`${label} accrues once tracking has data in this range`}>
      <Database className="h-3 w-3" />
      No data yet
    </span>
  );
}

export function ErrorState({
  message,
  isMigration,
  onRetry,
}: {
  message: string;
  isMigration?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-6 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-amber-500" />
      <p className="mt-3 text-sm font-semibold text-gray-800">
        {isMigration ? "Analytics isn’t set up yet" : "Couldn’t load this data"}
      </p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{message}</p>
      {onRetry && !isMigration && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}

// True when the backend returned the "run the migration" 503 hint.
export function isMigrationError(message: string | undefined): boolean {
  return !!message && /migration|isn’t set up|isn't set up|SUPABASE_SERVICE_ROLE_KEY/i.test(message);
}
