import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Star } from "lucide-react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, RankedBars, TrendChart } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, TableSkeleton, isMigrationError } from "@/components/analytics/states";
import { inr, num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type ProductsPayload, type ProductTableRow } from "@/lib/analyticsApi";

export default function ProductsAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<ProductsPayload>("products", params);
  const d = query.data?.data;

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    (d?.products_table ?? []).forEach((r) => r.category && set.add(r.category));
    return [...set].sort();
  }, [d]);

  const columns: Column<ProductTableRow>[] = useMemo(
    () => [
      { key: "title", header: "Product", searchable: true, sortable: true, width: "min-w-[180px]",
        render: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">{r.title || prettySlug(r.slug)}</span>
            <span className="text-[11px] text-gray-400">{r.category}</span>
          </div>
        ) },
      { key: "revenue", header: "Revenue", align: "right", sortable: true, render: (r) => inr(r.revenue), csv: (r) => r.revenue },
      { key: "units", header: "Units", align: "right", sortable: true, render: (r) => num(r.units), csv: (r) => r.units },
      { key: "views", header: "Views", align: "right", sortable: true, render: (r) => (r.views ? num(r.views) : "—"), csv: (r) => r.views },
      { key: "cart_adds", header: "Cart", align: "right", sortable: true, render: (r) => num(r.cart_adds), csv: (r) => r.cart_adds },
      { key: "wishlist_adds", header: "Wishlist", align: "right", sortable: true, render: (r) => num(r.wishlist_adds), csv: (r) => r.wishlist_adds },
      { key: "conversion", header: "Conv.", align: "right", sortable: true, sortValue: (r) => r.conversion ?? -1,
        render: (r) => (r.conversion == null ? "—" : pct(r.conversion)), csv: (r) => r.conversion ?? "" },
      { key: "rating", header: "Rating", align: "right", sortable: true, sortValue: (r) => r.rating ?? -1,
        render: (r) => (r.rating == null ? "—" : <span className="inline-flex items-center gap-0.5">{r.rating.toFixed(1)}<Star className="h-3 w-3 fill-amber-400 text-amber-400" /></span>),
        csv: (r) => r.rating ?? "" },
      { key: "stock", header: "Stock", align: "right", sortable: true, render: (r) => (r.is_unlimited ? "∞" : num(r.stock)), csv: (r) => (r.is_unlimited ? "unlimited" : r.stock) },
      { key: "drill", header: "", align: "right", render: () => <ArrowUpRight className="h-4 w-4 text-gray-300" /> },
    ],
    []
  );

  const filterBar = (
    <FilterBar params={params} controls={controls} showCategory categoryOptions={categoryOptions}
      onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />
  );

  return (
    <AnalyticsLayout title="Products" description="Catalog-wide performance. Click any product for its full analytics." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={6} /><div className="mt-6"><ChartSkeleton /></div><div className="mt-6"><TableSkeleton /></div></>
      ) : (
        <>
          <Section title="Catalog KPIs">
            <KpiGrid>
              <KpiCard label="Products sold" value={num(d.kpis.products_sold)} current={d.kpis.products_sold} previous={d.previous.products_sold} hint="Distinct products with a sale" />
              <KpiCard label="Units sold" value={num(d.kpis.units_sold)} current={d.kpis.units_sold} previous={d.previous.units_sold} />
              <KpiCard label="Revenue" value={inr(d.kpis.revenue)} current={d.kpis.revenue} previous={d.previous.revenue} />
              <KpiCard label="Product views" value={num(d.kpis.product_views)} current={d.kpis.product_views} previous={d.previous.product_views} tracksLater />
              <KpiCard label="Cart adds" value={num(d.kpis.cart_adds)} current={d.kpis.cart_adds} />
              <KpiCard label="Wishlist adds" value={num(d.kpis.wishlist_adds)} current={d.kpis.wishlist_adds} />
              <KpiCard label="Avg rating" value={d.kpis.avg_rating == null ? "—" : `${d.kpis.avg_rating.toFixed(2)}★`} />
              <KpiCard label="Reviews" value={num(d.kpis.reviews)} />
            </KpiGrid>
          </Section>

          <Section title="Trends & leaders">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Product sales trend" subtitle="Units & revenue over time" className="lg:col-span-2">
                <TrendChart data={d.sales_series} series={[{ key: "revenue", name: "Revenue", color: "#0F766E" }]} height={220} valueFormat={(v) => inr(v)} />
              </ChartCard>
              <ChartCard title="Top selling products">
                {d.top_selling.length > 0 ? (
                  <RankedBars data={d.top_selling.map((p) => ({ ...p, name: p.title || prettySlug(p.slug) }))} valueKey="units" labelKey="name" valueFormat={(v) => `${num(v)} units`} />
                ) : <p className="py-10 text-center text-xs text-gray-400">No sales yet.</p>}
              </ChartCard>
              <ChartCard title="Most viewed products">
                {d.most_viewed.length > 0 ? (
                  <RankedBars data={d.most_viewed.map((p) => ({ ...p, name: p.title || prettySlug(p.slug) }))} valueKey="views" labelKey="name" valueFormat={(v) => `${num(v)} views`} colorByIndex />
                ) : <p className="py-10 text-center text-xs text-gray-400">No view data yet — tracking accrues from now.</p>}
              </ChartCard>
            </div>
          </Section>

          <Section title="All products" hint="Sortable, searchable, exportable. Click a row to drill in.">
            <DataTable
              columns={columns}
              rows={d.products_table}
              getRowKey={(r) => r.slug}
              onRowClick={(r) => navigate(`/admin/settings-panel/analytics/product/${encodeURIComponent(r.slug)}${location.search}`)}
              searchPlaceholder="Search products…"
              exportName="products-analytics"
              pageSize={15}
              initialSort={{ key: "revenue", dir: "desc" }}
            />
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
