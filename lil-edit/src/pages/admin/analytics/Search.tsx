import { useMemo } from "react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, TrendChart } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { num, pct } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type SearchPayload } from "@/lib/analyticsApi";

type Term = SearchPayload["top_terms"][number];
type Zero = SearchPayload["zero_terms"][number];

export default function SearchAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const query = useAnalytics<SearchPayload>("search", params);
  const d = query.data?.data;

  const termCols: Column<Term>[] = useMemo(() => [
    { key: "query", header: "Query", searchable: true, sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.query}</span> },
    { key: "count", header: "Searches", align: "right", sortable: true, render: (r) => num(r.count), csv: (r) => r.count },
    { key: "avg_results", header: "Avg results", align: "right", sortable: true, render: (r) => r.avg_results?.toFixed(1) ?? "—", csv: (r) => r.avg_results },
    { key: "clicks", header: "Clicks", align: "right", sortable: true, render: (r) => num(r.clicks), csv: (r) => r.clicks },
    { key: "ctr", header: "CTR", align: "right", sortable: true, render: (r) => pct(r.ctr), csv: (r) => r.ctr },
  ], []);

  const zeroCols: Column<Zero>[] = useMemo(() => [
    { key: "query", header: "Zero-result query", searchable: true, sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.query}</span> },
    { key: "count", header: "Searches", align: "right", sortable: true, render: (r) => num(r.count), csv: (r) => r.count },
  ], []);

  const filterBar = <FilterBar params={params} controls={controls} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Search" description="What shoppers look for, what they click, and what comes up empty." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={5} /><div className="mt-6"><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Search KPIs">
            <KpiGrid>
              <KpiCard label="Total searches" value={num(d.kpis.searches)} current={d.kpis.searches} previous={d.previous.searches} />
              <KpiCard label="Unique queries" value={num(d.kpis.unique_queries)} />
              <KpiCard label="Search CTR" value={pct(d.kpis.ctr)} hint="Searches that led to a product click" />
              <KpiCard label="Search conversion" value={pct(d.kpis.conversion_pct)} hint="Searches followed by an order within 24h" />
              <KpiCard label="Zero-result searches" value={num(d.kpis.zero_results)} current={d.kpis.zero_results} previous={d.previous.zero_results} higherIsBetter={false} hint="Queries that returned nothing — demand gaps" />
            </KpiGrid>
          </Section>

          <Section title="Search volume">
            <ChartCard title="Searches & zero-result searches over time">
              <TrendChart data={d.search_series} series={[
                { key: "searches", name: "Searches", color: "#0F766E" },
                { key: "zero_results", name: "Zero results", color: "#DC2626" },
              ]} height={260} valueFormat={(v) => num(v)} />
              <div className="mt-3 flex flex-wrap gap-3">
                {[["Searches", "#0F766E"], ["Zero results", "#DC2626"]].map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: c }} />{l}</span>
                ))}
              </div>
            </ChartCard>
          </Section>

          <Section title="Queries">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500">Top search terms</p>
                <DataTable columns={termCols} rows={d.top_terms} getRowKey={(r) => r.query} searchPlaceholder="Filter terms…" exportName="top-search-terms" pageSize={10} initialSort={{ key: "count", dir: "desc" }} emptyMessage="No searches in this range." />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500">Zero-result searches <span className="font-normal text-gray-400">— demand you don’t stock</span></p>
                <DataTable columns={zeroCols} rows={d.zero_terms} getRowKey={(r) => r.query} searchPlaceholder="Filter terms…" exportName="zero-result-searches" pageSize={10} initialSort={{ key: "count", dir: "desc" }} emptyMessage="No empty searches — nice." />
              </div>
            </div>
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
