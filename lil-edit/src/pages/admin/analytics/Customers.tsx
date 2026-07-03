import { useMemo } from "react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, DonutChart, RankedBars, TrendChart } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { inr, num, pct, shortDate } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type CustomersPayload } from "@/lib/analyticsApi";

type CustomerRow = CustomersPayload["top_customers"][number];
const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", unknown: "Unknown" };

export default function CustomersAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const query = useAnalytics<CustomersPayload>("customers", params);
  const d = query.data?.data;

  const columns: Column<CustomerRow>[] = useMemo(() => [
    { key: "name", header: "Customer", searchable: true, sortable: true,
      render: (r) => <div className="flex flex-col"><span className="font-medium text-gray-900">{r.name}</span><span className="text-[11px] text-gray-400">{r.email}</span></div> },
    { key: "orders", header: "Orders", align: "right", sortable: true, render: (r) => num(r.orders), csv: (r) => r.orders },
    { key: "spend", header: "Spend", align: "right", sortable: true, render: (r) => inr(r.spend), csv: (r) => r.spend },
    { key: "last_order", header: "Last order", align: "right", sortable: true, render: (r) => shortDate(r.last_order), csv: (r) => r.last_order },
  ], []);

  const newVsReturning = d ? [
    { label: "New", value: d.new_vs_returning.new_orders },
    { label: "Returning", value: d.new_vs_returning.returning_orders },
  ] : [];

  const filterBar = <FilterBar params={params} controls={controls} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Customers" description="Acquisition, loyalty and lifetime value." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={6} /><div className="mt-6 grid gap-4 lg:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Customer KPIs">
            <KpiGrid>
              <KpiCard label="Total customers" value={num(d.kpis.total_customers)} hint="All registered accounts" />
              <KpiCard label="New customers" value={num(d.kpis.new_customers)} current={d.kpis.new_customers} previous={d.previous.new_customers} hint="First-ever order in this range" />
              <KpiCard label="Returning" value={num(d.kpis.returning_customers)} hint="Buyers who had ordered before" />
              <KpiCard label="Repeat purchase rate" value={pct(d.kpis.repeat_purchase_rate)} />
              <KpiCard label="Lifetime value" value={inr(d.kpis.clv)} hint="All-time revenue ÷ all-time buyers" />
              <KpiCard label="Avg spend (period)" value={inr(d.kpis.avg_spend)} current={d.kpis.avg_spend} previous={d.previous.avg_spend} />
            </KpiGrid>
          </Section>

          <Section title="Growth & mix">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Customer growth" subtitle="New signups over time" className="lg:col-span-2">
                <TrendChart data={d.growth_series} series={[{ key: "signups", name: "Signups", color: "#0F766E" }]} height={220} valueFormat={(v) => num(v)} />
              </ChartCard>
              <ChartCard title="New vs returning" subtitle="Order split this period">
                {newVsReturning.some((x) => x.value > 0) ? (
                  <DonutChart data={newVsReturning} valueKey="value" labelKey="label" valueFormat={(v) => `${num(v)} orders`} />
                ) : <p className="py-10 text-center text-xs text-gray-400">No orders in this range.</p>}
              </ChartCard>
              <ChartCard title="Top customers by spend">
                {d.top_customers.length > 0 ? (
                  <RankedBars data={d.top_customers.map((c) => ({ ...c, name: c.name }))} valueKey="spend" labelKey="name" valueFormat={(v) => inr(v)} />
                ) : <p className="py-10 text-center text-xs text-gray-400">No customers in this range.</p>}
              </ChartCard>
            </div>
          </Section>

          <Section title="Buyer gender mix" hint="From profile gender; buyers who haven’t set one show as Unknown.">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50/60 text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 text-left font-semibold">Gender</th>
                    <th className="px-3 py-2 text-right font-semibold">Buyers</th>
                    <th className="px-3 py-2 text-right font-semibold">Orders</th>
                    <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                  </tr></thead>
                  <tbody>
                    {d.by_gender.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-400">No orders in this range.</td></tr>
                    ) : d.by_gender.map((g) => (
                      <tr key={g.gender} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2.5 font-medium text-gray-800">{GENDER_LABEL[g.gender] ?? g.gender}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.buyers)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.orders)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{inr(g.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTable columns={columns} rows={d.top_customers} getRowKey={(r) => r.user_id} searchPlaceholder="Search customers…" exportName="top-customers" pageSize={10} initialSort={{ key: "spend", dir: "desc" }} />
            </div>
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
