import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, TrendChart } from "@/components/analytics/charts";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { num, pct } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type OrdersPayload } from "@/lib/analyticsApi";

// Format an "average hours" figure as h / d for readability.
function hours(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v < 1) return `${Math.round(v * 60)}m`;
  if (v < 48) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}d`;
}

export default function OrdersAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const query = useAnalytics<OrdersPayload>("orders", params);
  const d = query.data?.data;

  const filterBar = (
    <FilterBar params={params} controls={controls} showPayment
      onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />
  );

  return (
    <AnalyticsLayout title="Orders" description="Volume, fulfilment mix, and how fast orders move." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={8} /><div className="mt-6"><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Order status">
            <KpiGrid>
              <KpiCard label="Total orders" value={num(d.kpis.total_orders)} current={d.kpis.total_orders} previous={d.previous.total_orders} />
              <KpiCard label="Confirmed" value={num(d.kpis.confirmed)} hint="New orders awaiting processing" />
              <KpiCard label="Processing" value={num(d.kpis.processing)} />
              <KpiCard label="Shipped" value={num(d.kpis.shipped)} />
              <KpiCard label="Delivered" value={num(d.kpis.delivered)} current={d.kpis.delivered} previous={d.previous.delivered} />
              <KpiCard label="Cancelled" value={num(d.kpis.cancelled)} current={d.kpis.cancelled} previous={d.previous.cancelled} higherIsBetter={false} />
              <KpiCard label="Cancellation rate" value={pct(d.kpis.cancellation_rate)} current={d.kpis.cancellation_rate} previous={d.previous.cancellation_rate} higherIsBetter={false} />
              <KpiCard label="Avg items / order" value={d.kpis.avg_items_per_order?.toFixed(1) ?? "—"} />
            </KpiGrid>
          </Section>

          <Section title="Fulfilment speed & payment mix">
            <KpiGrid>
              <KpiCard label="Avg processing time" value={hours(d.kpis.avg_processing_hours)} hint="Confirmed → shipped" />
              <KpiCard label="Avg shipping time" value={hours(d.kpis.avg_shipping_hours)} hint="Shipped → delivered" />
              <KpiCard label="Online orders" value={num(d.kpis.online_orders)} />
              <KpiCard label="COD orders" value={num(d.kpis.cod_orders)} />
            </KpiGrid>
          </Section>

          <Section title="Order volume over time">
            <ChartCard title="Orders placed, delivered & cancelled">
              <TrendChart
                data={d.orders_series}
                series={[
                  { key: "placed", name: "Placed", color: "#0F766E" },
                  { key: "delivered", name: "Delivered", color: "#2563EB" },
                  { key: "cancelled", name: "Cancelled", color: "#DC2626" },
                ]}
                height={300}
                valueFormat={(v) => num(v)}
              />
              <div className="mt-3 flex flex-wrap gap-3">
                {[["Placed", "#0F766E"], ["Delivered", "#2563EB"], ["Cancelled", "#DC2626"]].map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: c }} />{l}
                  </span>
                ))}
              </div>
            </ChartCard>
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
