import { useMemo } from "react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { ErrorState, KpiGridSkeleton, TableSkeleton, isMigrationError } from "@/components/analytics/states";
import { inr, num, pct } from "@/components/analytics/format";
import { useAnalytics, useAnalyticsParams, type CouponsPayload } from "@/lib/analyticsApi";

type Row = CouponsPayload["table"][number];
type FailureRow = NonNullable<CouponsPayload["failures"]>[number];

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disabled: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
  exhausted: "bg-red-50 text-red-600 border-red-200",
};

export default function CouponsAnalytics() {
  const controls = useAnalyticsParams();
  const { params } = controls;
  const query = useAnalytics<CouponsPayload>("coupons", params);
  const d = query.data?.data;

  const columns: Column<Row>[] = useMemo(() => [
    { key: "code", header: "Coupon", searchable: true, sortable: true,
      render: (r) => <div className="flex flex-col"><span className="font-mono text-xs font-bold text-gray-900">{r.code}</span>
        <span className="text-[11px] text-gray-400">{r.discount_type === "percentage" ? `${r.discount_value}% off` : `₹${r.discount_value} off`}</span></div> },
    { key: "orders", header: "Uses", align: "right", sortable: true, render: (r) => num(r.orders), csv: (r) => r.orders },
    { key: "revenue", header: "Revenue", align: "right", sortable: true, render: (r) => inr(r.revenue), csv: (r) => r.revenue },
    { key: "discount", header: "Discount", align: "right", sortable: true, render: (r) => inr(r.discount), csv: (r) => r.discount },
    { key: "aov", header: "AOV", align: "right", sortable: true, sortValue: (r) => r.aov ?? -1, render: (r) => (r.aov == null ? "—" : inr(r.aov)), csv: (r) => r.aov ?? "" },
    { key: "roi", header: "ROI", align: "right", sortable: true, sortValue: (r) => r.roi ?? -1,
      render: (r) => (r.roi == null ? "—" : `${r.roi.toFixed(1)}×`), csv: (r) => r.roi ?? "" },
    { key: "attempts", header: "Attempts", align: "right", sortable: true, sortValue: (r) => r.attempts ?? 0,
      render: (r) => num(r.attempts ?? 0), csv: (r) => r.attempts ?? 0 },
    { key: "failed", header: "Refused", align: "right", sortable: true, sortValue: (r) => r.failed ?? 0,
      render: (r) => ((r.failed ?? 0) === 0 ? <span className="text-gray-300">0</span> : <span className="font-semibold text-red-600">{num(r.failed ?? 0)}</span>),
      csv: (r) => r.failed ?? 0 },
    { key: "new_customers", header: "New cust.", align: "right", sortable: true, render: (r) => num(r.new_customers), csv: (r) => r.new_customers },
    { key: "cancelled", header: "Cancelled", align: "right", sortable: true, render: (r) => num(r.cancelled), csv: (r) => r.cancelled },
    { key: "status", header: "Status", align: "center", sortable: true,
      render: (r) => <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[r.status] ?? STATUS_STYLE.disabled}`}>{r.status}</span>, csv: (r) => r.status },
  ], []);

  const failureColumns: Column<FailureRow>[] = useMemo(() => [
    { key: "reason", header: "Reason", searchable: true, sortable: true,
      render: (r) => <span className="text-gray-800">{r.reason}</span> },
    { key: "count", header: "Times", align: "right", sortable: true, render: (r) => num(r.count), csv: (r) => r.count },
    { key: "codes", header: "Codes tried", searchable: true,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.codes ?? []).slice(0, 6).map((c) => (
            <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{c}</span>
          ))}
          {(r.codes ?? []).length > 6 && <span className="text-[11px] text-gray-400">+{(r.codes ?? []).length - 6}</span>}
        </div>
      ),
      csv: (r) => (r.codes ?? []).join(" | ") },
  ], []);

  const filterBar = <FilterBar params={params} controls={controls} showBucket={false} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} />;

  return (
    <AnalyticsLayout title="Coupons" description="Discount performance, ROI, and who each code brings in." filterBar={filterBar}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : query.isLoading || !d ? (
        <><KpiGridSkeleton count={13} /><div className="mt-6"><TableSkeleton /></div></>
      ) : (
        <>
          <Section title="Coupon KPIs">
            <KpiGrid>
              <KpiCard label="Coupon uses" value={num(d.kpis.coupon_orders)} current={d.kpis.coupon_orders} previous={d.previous.coupon_orders} />
              <KpiCard label="Active coupons" value={num(d.kpis.active_coupons)} hint="Enabled, not expired or exhausted" />
              <KpiCard label="Revenue generated" value={inr(d.kpis.revenue)} current={d.kpis.revenue} previous={d.previous.revenue} hint="From couponed orders" />
              <KpiCard label="Discount given" value={inr(d.kpis.discount_given)} current={d.kpis.discount_given} previous={d.previous.discount_given} higherIsBetter={false} />
              <KpiCard label="Avg discount" value={inr(d.kpis.avg_discount)} />
              <KpiCard label="ROI" value={d.kpis.roi == null ? "—" : `${d.kpis.roi.toFixed(1)}×`} hint="Revenue ÷ discount given" />
              <KpiCard label="New customers" value={num(d.kpis.new_customers)} hint="First-time buyers using a coupon" />
              <KpiCard label="Returning customers" value={num(d.kpis.returning_customers)} />
              <KpiCard label="Avg order value" value={inr(d.kpis.aov)} />
              <KpiCard label="Cancellation rate" value={pct(d.kpis.cancellation_rate)} higherIsBetter={false} />
              <KpiCard label="Coupon attempts" value={num(d.kpis.attempts)} current={d.kpis.attempts} previous={d.previous.attempts}
                hint="Every time a shopper pressed Apply" />
              <KpiCard label="Refused attempts" value={num(d.kpis.failed_attempts)} current={d.kpis.failed_attempts} previous={d.previous.failed_attempts}
                higherIsBetter={false} hint="Codes the checkout rejected" />
              <KpiCard label="Attempt success rate" value={pct(d.kpis.attempt_success_rate)}
                current={d.kpis.attempt_success_rate} previous={d.previous.attempt_success_rate}
                hint="Accepted ÷ total attempts" />
            </KpiGrid>
          </Section>

          <Section title="By coupon" hint="Every code with its period performance. Sortable & exportable.">
            <DataTable columns={columns} rows={d.table} getRowKey={(r) => r.code} searchPlaceholder="Search codes…" exportName="coupon-analytics" pageSize={15} initialSort={{ key: "orders", dir: "desc" }} />
          </Section>

          {/* Refusals are only knowable from the coupon_applied events, so this whole
              section is absent on a database still running the older RPC. */}
          {(d.failures?.length ?? 0) > 0 && (
            <Section title="Why codes were refused" hint="Rejected attempts grouped by reason. Codes that aren’t in the table above show up here — typos, or codes since deleted.">
              <DataTable
                columns={failureColumns}
                rows={d.failures ?? []}
                getRowKey={(r) => r.reason}
                searchPlaceholder="Search reasons…"
                exportName="coupon-refusals"
                pageSize={10}
                initialSort={{ key: "count", dir: "desc" }}
              />
            </Section>
          )}
        </>
      )}
    </AnalyticsLayout>
  );
}
