import { useState } from "react";
import { CalendarDays, Check, ChevronDown, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRESETS, type AnalyticsParams, type Bucket, useAnalyticsParams } from "@/lib/analyticsApi";
import { shortDate } from "./format";
import { SegmentedSlider } from "./SegmentedSlider";
import { SelectField } from "./SelectField";

interface FilterBarProps {
  params: AnalyticsParams;
  controls: ReturnType<typeof useAnalyticsParams>;
  // Which contextual dimension filters this page supports.
  showCategory?: boolean;
  showPayment?: boolean;
  categoryOptions?: string[];
  // Bucket selector is hidden on pages whose charts don't bucket by time.
  showBucket?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  cached?: boolean;
}

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

// Mobile bucket control — a menu styled exactly like the Date range / Filters
// triggers elsewhere in this bar (same button chrome, same checkmark-list
// pattern), rather than a bare native <select> that looks inconsistent next to
// the rest of this platform's custom popovers.
function BucketMenu({ value, onChange, className }: { value: Bucket; onChange: (b: Bucket) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const active = BUCKETS.find((b) => b.key === value) ?? BUCKETS[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Group by: ${active.label}`}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-400 bg-white px-3 text-sm font-semibold text-gray-800 hover:border-gray-500",
            className
          )}
        >
          {active.label}
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              onChange(b.key);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50",
              value === b.key ? "font-semibold text-gray-900" : "text-gray-600"
            )}
          >
            {b.label}
            {value === b.key && <Check className="h-4 w-4" style={{ color: "#0F766E" }} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  params,
  controls,
  showCategory = false,
  showPayment = false,
  categoryOptions = [],
  showBucket = true,
  onRefresh,
  refreshing,
  cached,
}: FilterBarProps) {
  const { setPreset, setCustomRange, setBucket, setFilter, clearFilters } = controls;
  const [dateOpen, setDateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(params.from.slice(0, 10));
  const [customTo, setCustomTo] = useState(params.to.slice(0, 10));

  const activePreset = PRESETS.find((p) => p.key === params.preset);
  const rangeLabel = activePreset
    ? activePreset.label
    : `${shortDate(params.from)} – ${shortDate(params.to)}`;

  const activeFilterCount =
    (params.category ? 1 : 0) + (params.paymentMethod ? 1 : 0) + (params.couponCode ? 1 : 0);

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = new Date(customFrom);
    const to = new Date(customTo);
    to.setHours(23, 59, 59, 999); // inclusive end day
    if (to <= from) return;
    setCustomRange(from.toISOString(), to.toISOString(), params.bucket);
    setDateOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date range */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-400 bg-white px-3 text-sm font-semibold text-gray-800 hover:border-gray-500"
          >
            <CalendarDays className="h-4 w-4 text-gray-400" />
            {rangeLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={12} className="w-64 max-w-[calc(100vw-1.5rem)] p-2">
          <div className="space-y-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPreset(p.key);
                  setDateOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50",
                  params.preset === p.key ? "font-semibold text-gray-900" : "text-gray-600"
                )}
              >
                {p.label}
                {params.preset === p.key && <Check className="h-4 w-4" style={{ color: "#0F766E" }} />}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Custom range</p>
            {/* Stacked, not side-by-side: a native date input has a browser-enforced
                minimum width that w-full can't shrink below, so two of them in one
                row overflow the popover on both desktop and mobile. Stacking removes
                that collision outright. */}
            <div className="flex flex-col gap-2 px-1">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-gray-400">From</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full min-w-0 rounded-md border border-gray-400 px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-gray-400">To</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full min-w-0 rounded-md border border-gray-400 px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-500"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={applyCustom}
              className="mt-2 w-full rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
            >
              Apply range
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Compare caption — every KPI compares to the immediately-preceding window. */}
      <span className="hidden items-center gap-1 text-xs text-gray-400 sm:inline-flex">
        vs previous period
      </span>

      {/* Right-hand action cluster: bucket + filters + refresh. Grouped in ONE
          wrapper with a single `ml-auto` so they always sit flush against the
          row's right edge, and `shrink-0` keeps them an atomic block — if the
          row ever runs out of width, this whole cluster wraps to its own line
          together rather than the refresh button splitting away from the rest. */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        {/* Bucket. Mobile: a menu (a 3-way drag slider is fiddly at touch width).
            Desktop: the draggable segmented slider. Exactly one is ever visible —
            the other is `display:none` at that breakpoint, not unmounted. */}
        {showBucket && (
          <>
            <BucketMenu className="sm:hidden" value={params.bucket} onChange={setBucket} />
            <SegmentedSlider
              className="hidden sm:flex"
              options={BUCKETS}
              value={params.bucket}
              onChange={setBucket}
              accent="#111827"
              ariaLabel="Group by"
            />
          </>
        )}

        {/* Contextual dimension filters */}
        {(showCategory || showPayment) && (
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:border-gray-500",
                  activeFilterCount > 0 ? "border-gray-500 bg-gray-50 text-gray-900" : "border-gray-400 bg-white text-gray-700"
                )}
              >
                <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-gray-900 px-1.5 text-[11px] font-bold text-white">{activeFilterCount}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              {showPayment && (
                <div className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Payment method</p>
                  <div className="flex gap-1.5">
                    {[
                      { v: "", label: "All" },
                      { v: "online", label: "Online" },
                      { v: "cod", label: "COD" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setFilter("payment_method", o.v || null)}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-xs font-semibold",
                          (params.paymentMethod ?? "") === o.v
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-400 text-gray-600 hover:border-gray-500"
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showCategory && categoryOptions.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Category</p>
                  <SelectField
                    fullWidth
                    size="sm"
                    ariaLabel="Category"
                    value={params.category ?? ""}
                    onChange={(v) => setFilter("category", v || null)}
                    options={[{ value: "", label: "All categories" }, ...categoryOptions.map((c) => ({ value: c, label: c }))]}
                  />
                </div>
              )}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setFiltersOpen(false);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title={cached ? "Showing cached data — click to refresh" : "Refresh"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-400 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-800"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        )}
      </div>
    </div>
  );
}
