import { useMemo } from "react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, DonutChart, RankedBars, TrendChart } from "@/components/analytics/charts";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { inr, inrCompact } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type RevenuePayload } from "@/lib/analyticsApi";

export default function RevenueAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const query = useAnalytics<RevenuePayload>("revenue", params);
  const d = query.data?.data;

  const categoryOptions = useMemo(
    () => (d?.revenue_by_category ?? []).map((c) => c.category).filter((c) => c !== "uncategorised"),
    [d]
  );

  const filterBar = (
    <FilterBar params={params} controls={controls} showCategory showPayment categoryOptions={categoryOptions}
      onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />
  );

  return (
    <AnalyticsLayout title="Revenue" description="Where the money comes from, and how much you keep." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={6} /><div className="mt-6"><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Revenue KPIs">
            <KpiGrid>
              <KpiCard label="Gross revenue" value={inr(d.kpis.gross_revenue)} current={d.kpis.gross_revenue} previous={d.previous.gross_revenue} hint="Order subtotals before discounts" />
              <KpiCard label="Net revenue" value={inr(d.kpis.net_revenue)} current={d.kpis.net_revenue} previous={d.previous.net_revenue} hint="Amount charged (after discount, incl. shipping)" />
              <KpiCard label="Avg order value" value={inr(d.kpis.aov)} current={d.kpis.aov} previous={d.previous.aov} />
              <KpiCard label="Revenue / customer" value={inr(d.kpis.revenue_per_customer)} current={d.kpis.revenue_per_customer} previous={d.previous.revenue_per_customer} />
              <KpiCard label="Discounts given" value={inr(d.kpis.discounts_given)} current={d.kpis.discounts_given} previous={d.previous.discounts_given} higherIsBetter={false} />
              <KpiCard label="Shipping collected" value={inr(d.kpis.shipping_collected)} current={d.kpis.shipping_collected} previous={d.previous.shipping_collected} />
              <KpiCard label="Cancelled order value" value={inr(d.kpis.cancelled_value)} current={d.kpis.cancelled_value} previous={d.previous.cancelled_value} higherIsBetter={false} hint="Value of orders that were cancelled" />
            </KpiGrid>
          </Section>

          <Section title="Trends">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Revenue trend" subtitle="Gross, net & discount over time" className="lg:col-span-2">
                <TrendChart
                  data={d.revenue_series}
                  series={[
                    { key: "gross", name: "Gross", color: "#0F766E" },
                    { key: "net", name: "Net", color: "#2563EB" },
                    { key: "discount", name: "Discount", color: "#D97706" },
                  ]}
                  height={300}
                  valueFormat={(v) => inr(v)}
                />
                <Legend items={[["Gross", "#0F766E"], ["Net", "#2563EB"], ["Discount", "#D97706"]]} />
              </ChartCard>

              <ChartCard title="Revenue by category">
                {d.revenue_by_category.length > 0 ? (
                  <RankedBars data={d.revenue_by_category.map((c) => ({ ...c, name: c.category }))} valueKey="revenue" labelKey="name" valueFormat={(v) => inr(v)} colorByIndex />
                ) : <Empty />}
              </ChartCard>

              <ChartCard title="Revenue by payment method">
                {d.revenue_by_payment.length > 0 ? (
                  <DonutChart data={d.revenue_by_payment.map((p) => ({ ...p, method: p.method === "cod" ? "Cash on delivery" : "Online" }))} valueKey="revenue" labelKey="method" valueFormat={(v) => inrCompact(v)} />
                ) : <Empty />}
              </ChartCard>
            </div>
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
function Empty() {
  return <p className="py-10 text-center text-xs text-gray-400">No revenue in this range.</p>;
}
