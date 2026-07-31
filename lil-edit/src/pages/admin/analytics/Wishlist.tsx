import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ErrorState, KpiGridSkeleton, TableSkeleton, isMigrationError } from "@/components/analytics/states";
import { num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type WishlistPayload } from "@/lib/analyticsApi";

type Row = WishlistPayload["table"][number];

export default function WishlistAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<WishlistPayload>("wishlist", params);
  const d = query.data?.data;

  const columns: Column<Row>[] = useMemo(() => [
    { key: "title", header: "Product", searchable: true, sortable: true, width: "min-w-[180px]",
      render: (r) => <span className="font-medium text-gray-900">{r.title || prettySlug(r.slug)}</span> },
    { key: "adds", header: "Adds", align: "right", sortable: true, render: (r) => num(r.adds), csv: (r) => r.adds },
    { key: "removes", header: "Removes", align: "right", sortable: true, render: (r) => num(r.removes), csv: (r) => r.removes },
    { key: "active", header: "Active", align: "right", sortable: true, render: (r) => num(r.active), csv: (r) => r.active, },
    { key: "moved_to_cart", header: "→ Cart", align: "right", sortable: true, render: (r) => num(r.moved_to_cart), csv: (r) => r.moved_to_cart },
    { key: "purchased", header: "→ Bought", align: "right", sortable: true, render: (r) => num(r.purchased), csv: (r) => r.purchased },
    { key: "conv", header: "Conv.", align: "right", sortable: true,
      sortValue: (r) => (r.adds ? r.purchased / r.adds : -1),
      render: (r) => (r.adds ? pct((r.purchased / r.adds) * 100) : "—"), csv: (r) => (r.adds ? ((r.purchased / r.adds) * 100).toFixed(1) : "") },
  ], []);

  const filterBar = <FilterBar params={params} controls={controls} showBucket={false} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Wishlist" description="What shoppers are saving for later — and whether it converts." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={5} /><div className="mt-6"><TableSkeleton /></div></>
      ) : (
        <>
          <Section title="Wishlist KPIs">
            <KpiGrid>
              <KpiCard label="Wishlist adds" value={num(d.kpis.adds)} current={d.kpis.adds} previous={d.previous.adds} />
              <KpiCard label="Distinct wishlisters" value={num(d.kpis.distinct_users)} current={d.kpis.distinct_users} previous={d.previous.distinct_users} />
              <KpiCard label="Removes" value={num(d.kpis.removes)} current={d.kpis.removes} previous={d.previous.removes} higherIsBetter={false} />
              <KpiCard label="Wishlist → purchase" value={pct(d.kpis.conversion_pct)} hint="Share of wishlisters who later bought the item" />
              <KpiCard label="Most wishlisted" value={<span className="text-base">{d.kpis.most_wishlisted?.title ? (d.kpis.most_wishlisted.title.length > 18 ? d.kpis.most_wishlisted.title.slice(0, 17) + "…" : d.kpis.most_wishlisted.title) : "—"}</span>}
                hint={d.kpis.most_wishlisted ? `${d.kpis.most_wishlisted.adds} adds` : undefined} />
              <KpiCard label="Fastest growing" value={<span className="text-base">{d.kpis.fastest_growing?.title ? (d.kpis.fastest_growing.title.length > 18 ? d.kpis.fastest_growing.title.slice(0, 17) + "…" : d.kpis.fastest_growing.title) : "—"}</span>}
                hint={d.kpis.fastest_growing ? `+${d.kpis.fastest_growing.delta} vs prev` : undefined} />
            </KpiGrid>
          </Section>

          <Section title="By product" hint="Sortable & exportable. Click a row for the product’s full analytics.">
            <DataTable columns={columns} rows={d.table} getRowKey={(r) => r.slug}
              onRowClick={(r) => navigate(`/admin/analytics/product/${encodeURIComponent(r.slug)}${location.search}`)}
              searchPlaceholder="Search products…" exportName="wishlist-analytics" pageSize={15} initialSort={{ key: "adds", dir: "desc" }} />
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
