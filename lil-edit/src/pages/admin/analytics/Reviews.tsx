import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, ColumnBars, TrendChart } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ChartSkeleton, ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { num, prettySlug } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type ReviewsPayload } from "@/lib/analyticsApi";

type Row = ReviewsPayload["by_product"][number];

export default function ReviewsAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const navigate = useNavigate();
  const query = useAnalytics<ReviewsPayload>("reviews", params);
  const d = query.data?.data;

  const columns: Column<Row>[] = useMemo(() => [
    { key: "title", header: "Product", searchable: true, sortable: true, width: "min-w-[180px]",
      render: (r) => <span className="font-medium text-gray-900">{r.title || prettySlug(r.slug)}</span> },
    { key: "count", header: "Reviews", align: "right", sortable: true, render: (r) => num(r.count), csv: (r) => r.count },
    { key: "avg_rating", header: "Avg", align: "right", sortable: true,
      render: (r) => <span className="inline-flex items-center gap-0.5">{r.avg_rating?.toFixed(2) ?? "—"}<Star className="h-3 w-3 fill-amber-400 text-amber-400" /></span>, csv: (r) => r.avg_rating },
    { key: "verified", header: "Verified", align: "right", sortable: true, render: (r) => num(r.verified), csv: (r) => r.verified },
    { key: "low_ratings", header: "1–2★", align: "right", sortable: true, render: (r) => (r.low_ratings > 0 ? <span className="font-semibold text-red-600">{num(r.low_ratings)}</span> : "0"), csv: (r) => r.low_ratings },
  ], []);

  const dist = d?.rating_distribution.map((x) => ({ label: `${x.rating}★`, count: x.count })) ?? [];
  const filterBar = <FilterBar params={params} controls={controls} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Reviews" description="Rating health and where quality signals need attention." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={4} /><div className="mt-6 grid gap-4 lg:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div></>
      ) : (
        <>
          <Section title="Review KPIs">
            <KpiGrid>
              <KpiCard label="Total reviews" value={num(d.kpis.total)} current={d.kpis.total} previous={d.previous.total} />
              <KpiCard label="Average rating" value={d.kpis.avg_rating == null ? "—" : `${d.kpis.avg_rating.toFixed(2)}★`} current={d.kpis.avg_rating} previous={d.previous.avg_rating} />
              <KpiCard label="Verified reviews" value={num(d.kpis.verified)} current={d.kpis.verified} previous={d.previous.verified} hint="From confirmed purchases" />
              <KpiCard label="With photos" value={num(d.kpis.with_images)} />
            </KpiGrid>
          </Section>

          <Section title="Rating trends">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Reviews over time" subtitle="Volume per period">
                <TrendChart data={d.reviews_trend} series={[{ key: "count", name: "Reviews", color: "#0F766E" }]} height={240} valueFormat={(v) => num(v)} />
              </ChartCard>
              <ChartCard title="Rating distribution">
                {dist.some((x) => x.count > 0) ? (
                  <ColumnBars data={dist} valueKey="count" labelKey="label" color="#D97706" valueFormat={(v) => `${num(v)} reviews`} />
                ) : <p className="py-10 text-center text-xs text-gray-400">No reviews in this range.</p>}
              </ChartCard>
            </div>
          </Section>

          <Section title="By product" hint="Watch the 1–2★ column — concentrated low ratings flag a quality or fit issue.">
            <DataTable columns={columns} rows={d.by_product} getRowKey={(r) => r.slug}
              onRowClick={(r) => navigate(`/admin/settings-panel/analytics/product/${encodeURIComponent(r.slug)}${location.search}`)}
              searchPlaceholder="Search products…" exportName="reviews-analytics" pageSize={15} initialSort={{ key: "count", dir: "desc" }} />
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}
