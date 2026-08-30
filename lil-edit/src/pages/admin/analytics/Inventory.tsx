import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, RankedBars } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { inr, num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type InventoryPayload } from "@/lib/analyticsApi";

type LowRow = InventoryPayload["low_stock_rows"][number];

export default function InventoryAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<InventoryPayload>("inventory", params);
  const d = query.data?.data;

  const lowCols: Column<LowRow>[] = useMemo(() => [
    { key: "title", header: "Product", searchable: true, sortable: true, width: "min-w-[160px]",
      render: (r) => <span className="font-medium text-gray-900">{r.title || prettySlug(r.slug)}</span> },
    { key: "color", header: "Variant", searchable: true, render: (r) => <span className="text-gray-600">{r.color || "—"}</span> },
    { key: "sku", header: "SKU", searchable: true, render: (r) => <span className="font-mono text-[11px] text-gray-400">{r.sku}</span> },
    { key: "stock", header: "Stock", align: "right", sortable: true,
      render: (r) => <span className={r.stock === 0 ? "font-bold text-red-600" : r.stock <= 3 ? "font-semibold text-amber-600" : "text-gray-700"}>{num(r.stock)}</span>, csv: (r) => r.stock },
  ], []);

  const filterBar = <FilterBar params={params} controls={controls} showBucket={false} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Inventory" description="Stock health and how fast it turns. Velocity uses the selected range." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={6} /><div className="mt-6 grid gap-4 lg:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Inventory KPIs">
            <KpiGrid>
              <KpiCard label="Stock value" value={inr(d.kpis.stock_value)} hint="On-hand units × price (excludes unlimited)" />
              <KpiCard label="Units in stock" value={num(d.kpis.units_in_stock)} />
              <KpiCard label="Low stock" value={num(d.kpis.low_stock)} hint="Variants with 1–5 units" />
              <KpiCard label="Out of stock" value={num(d.kpis.out_of_stock)} hint="Tracked variants at 0" />
              <KpiCard label="Units sold" value={num(d.kpis.units_sold)} hint="In the selected range" />
              <KpiCard label="Sell-through" value={pct(d.kpis.sell_through_pct)} hint="Sold ÷ (sold + on-hand)" />
            </KpiGrid>
          </Section>

          <Section title="Velocity">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Fastest selling" subtitle="Units sold in range">
                {d.fastest_selling.length > 0 ? (
                  <RankedBars data={d.fastest_selling.map((p) => ({ ...p, name: p.title || prettySlug(p.slug) }))} valueKey="units" labelKey="name" valueFormat={(v) => `${num(v)} units`} />
                ) : <p className="py-10 text-center text-xs text-gray-400">No sales in this range.</p>}
              </ChartCard>
              <ChartCard title="Slowest movers" subtitle="Published stock, fewest sold">
                {d.slowest_selling.length > 0 ? (
                  <RankedBars data={d.slowest_selling.map((p) => ({ ...p, name: p.title || prettySlug(p.slug), inv: p.stock }))} valueKey="inv" labelKey="name" valueFormat={(v) => `${num(v)} in stock`} colorByIndex />
                ) : <p className="py-10 text-center text-xs text-gray-400">Nothing to show.</p>}
              </ChartCard>
            </div>
          </Section>

          <Section title="Low & out of stock" hint="Restock priorities — 0 in red, ≤3 in amber. Click a row for the product’s analytics.">
            <DataTable columns={lowCols} rows={d.low_stock_rows} getRowKey={(r) => r.sku}
              onRowClick={(r) => navigate(`/admin/settings-panel/analytics/product/${encodeURIComponent(r.slug)}${location.search}`)}
              searchPlaceholder="Search products / SKUs…" exportName="low-stock" pageSize={15} initialSort={{ key: "stock", dir: "asc" }}
              emptyMessage="No low-stock variants — inventory looks healthy." />
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
