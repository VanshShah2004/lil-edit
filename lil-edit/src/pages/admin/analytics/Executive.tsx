import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, DonutChart, RankedBars, TrendChart } from "@/components/analytics/charts";
import { InsightGrid } from "@/components/analytics/InsightCard";
import { executiveInsights } from "@/components/analytics/insights";
import { ReorderGroup, Widget, slugify, useHideable } from "@/components/analytics/customize";
import {
  ChartSkeleton,
  ErrorState,
  KpiGridSkeleton,
  isMigrationError,
} from "@/components/analytics/states";
import { inr, inrCompact, num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type ExecutivePayload } from "@/lib/analyticsApi";

export default function ExecutiveDashboard() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<ExecutivePayload>("executive", params);
  const d = query.data?.data;

  const categoryOptions = useMemo(
    () => (d?.revenue_by_category ?? []).map((c) => c.category).filter((c) => c !== "uncategorised"),
    [d]
  );

  const insights = useMemo(() => {
    if (!d) return [];
    return executiveInsights(d.kpis, d.previous, d.top_products_by_revenue?.[0]);
  }, [d]);

  const filterBar = (
    <FilterBar params={params} controls={controls} showCategory showPayment categoryOptions={categoryOptions} />
  );

  // Refresh sits next to the "Executive overview" title itself (the AnalyticsLayout
  // title row's `actions` slot), not inside the filter bar below it.
  const actions = (
    <button
      type="button"
      onClick={() => query.refetch()}
      title={query.data?.meta.cached ? "Showing cached data — click to refresh" : "Refresh"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-400 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-800"
    >
      <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
    </button>
  );

  return (
    <AnalyticsLayout title="Executive overview" description="The health of the business at a glance." filterBar={filterBar} actions={actions} customizeKey="executive">
      {query.isError ? (
        <ErrorState
          message={query.error.message}
          isMigration={isMigrationError(query.error.message)}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading || !d ? (
        <>
          <KpiGridSkeleton count={10} />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </>
      ) : (
        <>
          {/* ── Money ─────────────────────────────────────────────────────── */}
          <Section title="Revenue & orders">
            <KpiGrid groupKey="exec-money">
              <KpiCard label="Gross revenue" value={inr(d.kpis.gross_revenue)} current={d.kpis.gross_revenue} previous={d.previous.gross_revenue} hint="Sum of order subtotals before discounts (excludes cancelled)" />
              <KpiCard label="Net revenue" value={inr(d.kpis.net_revenue)} current={d.kpis.net_revenue} previous={d.previous.net_revenue} hint="Amount actually charged (excludes cancelled)" />
              <KpiCard label="Orders" value={num(d.kpis.orders)} current={d.kpis.orders} previous={d.previous.orders} />
              <KpiCard label="Avg order value" value={inr(d.kpis.aov)} current={d.kpis.aov} previous={d.previous.aov} />
              <KpiCard label="Units sold" value={num(d.kpis.units_sold)} current={d.kpis.units_sold} previous={d.previous.units_sold} />
              <GrowthCard label="Revenue growth" current={d.kpis.net_revenue} previous={d.previous.net_revenue} />
              <GrowthCard label="Order growth" current={d.kpis.orders} previous={d.previous.orders} />
              <KpiCard label="Discounts given" value={inr(d.kpis.discounts_given)} current={d.kpis.discounts_given} previous={d.previous.discounts_given} higherIsBetter={false} />
              <KpiCard label="Cancellation rate" value={pct(d.kpis.cancellation_rate)} current={d.kpis.cancellation_rate} previous={d.previous.cancellation_rate} higherIsBetter={false} hint="Share of placed orders that were cancelled" />
              <KpiCard label="Repeat purchase rate" value={pct(d.kpis.repeat_purchase_rate)} current={d.kpis.repeat_purchase_rate} hint="Buyers this period with 2+ lifetime orders" />
            </KpiGrid>
          </Section>

          {/* ── Customers & engagement ────────────────────────────────────── */}
          <Section title="Customers & engagement">
            <KpiGrid groupKey="exec-engagement">
              <KpiCard label="Customers" value={num(d.kpis.customers)} current={d.kpis.customers} previous={d.previous.customers} onClick={() => navigate(`/admin/settings-panel/analytics/customers${location.search}`)} />
              <KpiCard label="New customers" value={num(d.kpis.new_customers)} current={d.kpis.new_customers} previous={d.previous.new_customers} />
              <GrowthCard label="Customer growth" current={d.kpis.customers} previous={d.previous.customers} />
              <KpiCard label="Product views" value={num(d.kpis.product_views)} current={d.kpis.product_views} previous={d.previous.product_views} tracksLater onClick={() => navigate(`/admin/settings-panel/analytics/products${location.search}`)} />
              <KpiCard label="Active visitors" value={num(d.kpis.active_users)} current={d.kpis.active_users} previous={d.previous.active_users} tracksLater hint="Distinct visitors who viewed a product" />
              <KpiCard label="Conversion rate" value={pct(d.kpis.conversion_rate)} current={d.kpis.conversion_rate} previous={d.previous.conversion_rate} tracksLater hint="Orders ÷ distinct visitors" />
              <KpiCard label="Cart adds" value={num(d.kpis.cart_adds)} current={d.kpis.cart_adds} previous={d.previous.cart_adds} onClick={() => navigate(`/admin/settings-panel/analytics/cart${location.search}`)} />
              <KpiCard label="Wishlist adds" value={num(d.kpis.wishlist_adds)} current={d.kpis.wishlist_adds} previous={d.previous.wishlist_adds} onClick={() => navigate(`/admin/settings-panel/analytics/wishlist${location.search}`)} />
            </KpiGrid>
          </Section>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          <Section title="Trends">
            <ReorderGroup groupKey="exec-trends" className="grid gap-4 lg:grid-cols-2">
              {/* Revenue & orders are different scales — shown as small multiples
                  (two synced charts) rather than a dual-axis chart. */}
              <ChartCard title="Revenue & orders over time" subtitle="Two scales — shown separately, shared timeline">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Net revenue</p>
                  <TrendChart
                    data={d.revenue_orders_series}
                    series={[{ key: "revenue", name: "Revenue", color: "#0F766E" }]}
                    height={140}
                    valueFormat={(v) => inr(v)}
                  />
                  <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Orders</p>
                  <TrendChart
                    data={d.revenue_orders_series}
                    series={[{ key: "orders", name: "Orders", color: "#2563EB" }]}
                    height={110}
                    valueFormat={(v) => num(v)}
                  />
                </div>
              </ChartCard>

              <ChartCard title="Revenue by category" subtitle="Share of net revenue this period">
                {d.revenue_by_category.length > 0 ? (
                  <DonutChart data={d.revenue_by_category} valueKey="revenue" labelKey="category" valueFormat={(v) => inrCompact(v)} />
                ) : (
                  <p className="py-10 text-center text-xs text-gray-400">No sales in this range.</p>
                )}
              </ChartCard>

              <ChartCard title="Top 10 products by revenue">
                {d.top_products_by_revenue.length > 0 ? (
                  <RankedBars
                    data={d.top_products_by_revenue.map((p) => ({ ...p, name: p.title || prettySlug(p.slug) }))}
                    valueKey="revenue"
                    labelKey="name"
                    valueFormat={(v) => inr(v)}
                  />
                ) : (
                  <p className="py-10 text-center text-xs text-gray-400">No sales in this range.</p>
                )}
              </ChartCard>

              <ChartCard title="Best sellers by units">
                {d.best_sellers.length > 0 ? (
                  <RankedBars
                    data={d.best_sellers.map((p) => ({ ...p, name: p.title || prettySlug(p.slug) }))}
                    valueKey="units"
                    labelKey="name"
                    valueFormat={(v) => `${num(v)} units`}
                  />
                ) : (
                  <p className="py-10 text-center text-xs text-gray-400">No sales in this range.</p>
                )}
              </ChartCard>
            </ReorderGroup>
          </Section>

          {/* ── AI-style insights (rule-based) ────────────────────────────── */}
          {/* One hideable unit — the individual insight cards are dynamic/rule-based,
              so per-card hiding wouldn't be meaningful. */}
          <Widget id="insights" label="Insights">
            <Section title="Insights">
              <InsightGrid insights={insights} empty="Nothing notable this period — steady as she goes." />
            </Section>
          </Widget>
        </>
      )}
    </AnalyticsLayout>
  );
}

// A KPI card whose VALUE is the period-over-period growth %, coloured by direction.
function GrowthCard({ label, current, previous }: { label: string; current?: number | null; previous?: number | null }) {
  const { hidden, handlers, jiggleClass, badge, placeholder } = useHideable(slugify(label), label, {
    placeholderMinH: "min-h-[104px]",
  });
  const cur = current ?? 0;
  const prev = previous ?? 0;
  const change = prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;
  const up = (change ?? 0) >= 0;
  if (hidden) return placeholder;
  return (
    <div {...handlers} className={cn("flex flex-col rounded-xl border border-gray-400 bg-white p-4", jiggleClass)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <div className="mt-2 flex items-center gap-1">
        {change == null ? (
          <span className="text-2xl font-bold text-gray-300">—</span>
        ) : (
          <>
            {up ? (
              <ArrowUpRight className="h-5 w-5" style={{ color: "#047857" }} />
            ) : (
              <ArrowDownRight className="h-5 w-5" style={{ color: "#DC2626" }} />
            )}
            <span className="text-2xl font-bold tabular-nums" style={{ color: up ? "#047857" : "#DC2626" }}>
              {change > 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          </>
        )}
      </div>
      <span className="mt-2 text-[11px] text-gray-400">vs previous period</span>
      {badge}
    </div>
  );
}
