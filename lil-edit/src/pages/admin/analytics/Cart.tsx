import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ErrorState, KpiGridSkeleton, TableSkeleton, isMigrationError } from "@/components/analytics/states";
import { num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type CartPayload } from "@/lib/analyticsApi";

type Row = CartPayload["table"][number];

export default function CartAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<CartPayload>("cart", params);
  const d = query.data?.data;

  const columns: Column<Row>[] = useMemo(() => [
    { key: "title", header: "Product", searchable: true, sortable: true, width: "min-w-[180px]",
      render: (r) => <span className="font-medium text-gray-900">{r.title || prettySlug(r.slug)}</span> },
    { key: "adds", header: "Adds", align: "right", sortable: true, render: (r) => num(r.adds), csv: (r) => r.adds },
    { key: "removes", header: "Removes", align: "right", sortable: true, render: (r) => num(r.removes), csv: (r) => r.removes },
    { key: "active", header: "In carts", align: "right", sortable: true, render: (r) => num(r.active), csv: (r) => r.active },
    { key: "purchased", header: "Bought", align: "right", sortable: true, render: (r) => num(r.purchased), csv: (r) => r.purchased },
    { key: "abandon", header: "Abandon %", align: "right", sortable: true,
      sortValue: (r) => (r.users ? 1 - r.purchased / r.users : -1),
      render: (r) => (r.users ? pct((1 - r.purchased / r.users) * 100) : "—"),
      csv: (r) => (r.users ? ((1 - r.purchased / r.users) * 100).toFixed(1) : "") },
  ], []);

  const filterBar = <FilterBar params={params} controls={controls} showBucket={false} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Cart" description="Add-to-cart demand and where it leaks before checkout." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={5} /><div className="mt-6"><TableSkeleton /></div></>
      ) : (
        <>
          <Section title="Cart KPIs">
            <KpiGrid>
              <KpiCard label="Cart adds" value={num(d.kpis.adds)} current={d.kpis.adds} previous={d.previous.adds} />
              <KpiCard label="Distinct carters" value={num(d.kpis.distinct_users)} current={d.kpis.distinct_users} previous={d.previous.distinct_users} />
              <KpiCard label="Removes" value={num(d.kpis.removes)} current={d.kpis.removes} previous={d.previous.removes} higherIsBetter={false} />
              <KpiCard label="Cart → purchase" value={pct(d.kpis.conversion_pct)} hint="Share of carters who completed a purchase" />
              <KpiCard label="Highest carted" value={<span className="text-base">{d.kpis.highest_carted?.title ? (d.kpis.highest_carted.title.length > 18 ? d.kpis.highest_carted.title.slice(0, 17) + "…" : d.kpis.highest_carted.title) : "—"}</span>}
                hint={d.kpis.highest_carted ? `${d.kpis.highest_carted.adds} adds` : undefined} />
              <KpiCard label="Highest abandonment" value={<span className="text-base">{d.kpis.highest_abandonment?.title ? (d.kpis.highest_abandonment.title.length > 16 ? d.kpis.highest_abandonment.title.slice(0, 15) + "…" : d.kpis.highest_abandonment.title) : "—"}</span>}
                hint={d.kpis.highest_abandonment ? `${d.kpis.highest_abandonment.abandonment_pct}% abandoned` : undefined} />
            </KpiGrid>
          </Section>

          <Section title="By product" hint="Sortable & exportable. Click a row for the product’s full analytics.">
            <DataTable columns={columns} rows={d.table} getRowKey={(r) => r.slug}
              onRowClick={(r) => navigate(`/admin/settings-panel/analytics/product/${encodeURIComponent(r.slug)}${location.search}`)}
              searchPlaceholder="Search products…" exportName="cart-analytics" pageSize={15} initialSort={{ key: "adds", dir: "desc" }} />
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
