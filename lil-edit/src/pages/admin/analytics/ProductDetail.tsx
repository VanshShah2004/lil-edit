import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Star } from "lucide-react";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { FilterBar } from "@/components/analytics/FilterBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ChartCard, ColumnBars, RankedBars, TrendChart } from "@/components/analytics/charts";
import { DataTable, type Column } from "@/components/analytics/DataTable";
import { InsightGrid } from "@/components/analytics/InsightCard";
import { productInsights } from "@/components/analytics/insights";
import { ErrorState, KpiGridSkeleton, isMigrationError } from "@/components/analytics/states";
import { Breadcrumb, KpiGrid } from "@/components/analytics/AnalyticsLayout";
import { inr, num, pct, prettySlug } from "@/components/analytics/format";
import { useAnalyticsParams, useProductAnalytics, type ProductDetailPayload } from "@/lib/analyticsApi";
import { cn } from "@/lib/utils";

const ACCENT = "#0F766E";

type TabKey =
  | "overview" | "views" | "wishlist" | "cart" | "purchases"
  | "funnel" | "gender" | "variants" | "reviews" | "search" | "rankings" | "intelligence";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "views", label: "Views" },
  { key: "wishlist", label: "Wishlist" },
  { key: "cart", label: "Cart" },
  { key: "purchases", label: "Purchases" },
  { key: "funnel", label: "Funnel" },
  { key: "gender", label: "Gender" },
  { key: "variants", label: "Variants" },
  { key: "reviews", label: "Reviews" },
  { key: "search", label: "Search" },
  { key: "rankings", label: "Rankings" },
  { key: "intelligence", label: "Intelligence" },
];

const n = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 0 : v);

// ── Product health score (0–100), a weighted blend of conversion, rating,
// demand rank and stock health. Deterministic — computed client-side. ──────────
function healthScore(d: ProductDetailPayload): { score: number; label: string; color: string } {
  const cartToPurchase = n(d.cart?.cart_to_purchase_pct);
  const viewToCart = n(d.cart?.view_to_cart_pct);
  const rating = n(d.reviews?.avg_rating_all_time);
  const reviews = n(d.reviews?.all_time);
  const stock = d.product?.is_unlimited ? Infinity : n(d.product?.stock);
  const revRank = n(d.rankings?.revenue_rank);
  const totalProducts = n(d.rankings?.total_products);

  // Conversion (blend view→cart aiming ~10% and cart→purchase aiming ~40%).
  const convScore = Math.min(100, (Math.min(viewToCart, 10) / 10) * 50 + (Math.min(cartToPurchase, 40) / 40) * 50);
  // Rating (neutral 60 when unrated so a new product isn't punished).
  const ratingScore = reviews > 0 ? (rating / 5) * 100 : 60;
  // Demand rank (1st = 100).
  const demandScore = revRank > 0 && totalProducts > 0 ? (1 - (revRank - 1) / totalProducts) * 100 : 40;
  // Stock health.
  const stockScore = stock === Infinity || stock > 5 ? 100 : stock > 0 ? 50 : 0;

  const score = Math.round(0.3 * convScore + 0.25 * ratingScore + 0.25 * demandScore + 0.2 * stockScore);
  const label = score >= 75 ? "Healthy" : score >= 50 ? "Fair" : score >= 30 ? "Needs work" : "At risk";
  const color = score >= 75 ? "#047857" : score >= 50 ? "#D97706" : "#DC2626";
  return { score, label, color };
}

export default function ProductAnalyticsDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const controls = useAnalyticsParams();
  const { params } = controls;
  const [tab, setTab] = useState<TabKey>("overview");
  const query = useProductAnalytics<ProductDetailPayload>(slug, params);
  const d = query.data?.data;

  const insights = useMemo(() => (d ? productInsights(d) : []), [d]);
  const health = useMemo(() => (d ? healthScore(d) : null), [d]);

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <UserNavbar />
      {/* Desktop top padding is Cart's own live formula (see AnalyticsLayout for
          the derivation) — navbar-height+33px — not a static guess, so this
          breadcrumb lands at the exact same row as Cart's. Mobile's pt-[120px]
          is untouched (confirmed correct). */}
      {/* Slightly wider content well — matches AnalyticsLayout's cap/padding so
          this page's width lines up with the rest of the platform. */}
      <div className="mx-auto max-w-[1680px] px-3 pb-16 pt-[120px] md:px-6 md:pt-[calc(var(--navbar-height)+33px)]">
        {/* Breadcrumb (matches every analytics page) + Back — this page is reached
            from several tables, so Back returns to the real origin. mt-[18px]
            (mobile only) matches Cart's rhythm; zeroed at md: since the container's
            own padding above now already carries the full Cart-equivalent offset. */}
        <div className="mt-[18px] mb-5 flex items-center justify-between gap-2 md:mt-0">
          <Breadcrumb
            trail={[
              { label: "Home", to: "/" },
              { label: "Analytics", to: `/admin/analytics${location.search}` },
              { label: "Products", to: `/admin/analytics/products${location.search}` },
              { label: d?.product.title || prettySlug(slug) },
            ]}
          />
          <button onClick={() => navigate(-1)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        </div>

        {query.isError ? (
          <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
        ) : query.isLoading || !d ? (
          <><div className="mb-6 h-20 animate-pulse rounded-xl bg-gray-200/60" /><KpiGridSkeleton count={8} /></>
        ) : (
          <>
            {/* Header */}
            <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-400 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-gray-900">{d.product.title || prettySlug(slug)}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>{d.product.category ?? "—"}</span>
                  {d.product.price != null && <><span>·</span><span>{inr(d.product.price)}</span></>}
                  <span>·</span>
                  <span>{d.product.is_unlimited ? "Unlimited stock" : `${num(d.product.stock)} in stock`}</span>
                  {!d.product.in_catalog && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Not in current catalog</span>}
                  {d.product.category && d.product.in_catalog && (
                    <Link to={`/collections/${d.product.category}/product/${slug}$${d.by_color?.[0]?.sku ?? ""}`}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"><ExternalLink className="h-3 w-3" /> View storefront</Link>
                  )}
                </div>
              </div>
              {health && (
                <div className="flex shrink-0 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-2.5">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Health score</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: health.color }}>{health.score}<span className="text-sm text-gray-300">/100</span></p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ backgroundColor: health.color }}>{health.label}</span>
                </div>
              )}
            </div>

            <div className="mb-4"><FilterBar params={params} controls={controls} onRefresh={() => query.refetch()} refreshing={query.isFetching} cached={query.data?.meta.cached} /></div>

            {/* Tab bar */}
            <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                    tab === t.key ? "text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700")}
                  style={tab === t.key ? { borderColor: ACCENT } : undefined}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && <OverviewTab d={d} />}
            {tab === "views" && <ViewsTab d={d} />}
            {tab === "wishlist" && <WishlistTab d={d} />}
            {tab === "cart" && <CartTab d={d} />}
            {tab === "purchases" && <PurchasesTab d={d} />}
            {tab === "funnel" && <FunnelTab d={d} />}
            {tab === "gender" && <GenderTab d={d} />}
            {tab === "variants" && <VariantsTab d={d} />}
            {tab === "reviews" && <ReviewsTab d={d} />}
            {tab === "search" && <SearchTab d={d} />}
            {tab === "rankings" && <RankingsTab d={d} />}
            {tab === "intelligence" && <InsightGrid insights={insights} empty="Not enough signal yet to surface recommendations for this product." />}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function OverviewTab({ d }: { d: ProductDetailPayload }) {
  const rank = (v: number | null | undefined) => (v ? `#${v}` : "—");
  return (
    <>
      <KpiGrid>
        <KpiCard label="Revenue" value={inr(d.overview.revenue)} />
        <KpiCard label="Orders" value={num(d.overview.orders)} />
        <KpiCard label="Units sold" value={num(d.overview.units)} />
        <KpiCard label="Reorders" value={num(d.overview.reorders)} hint="Orders by a prior buyer of this item" />
        <KpiCard label="Distinct buyers" value={num(d.overview.buyers)} />
        <KpiCard label="Repeat buyers" value={num(d.overview.repeat_buyers)} />
        <KpiCard label="Avg selling price" value={inr(d.overview.avg_selling_price)} />
        <KpiCard label="Revenue rank" value={rank(d.rankings?.revenue_rank)} hint={`of ${num(d.rankings?.total_products)} products`} />
        <KpiCard label="Views rank" value={rank(d.rankings?.views_rank)} />
        <KpiCard label="Conversion rank" value={rank(d.rankings?.conversion_rank)} />
      </KpiGrid>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue over time"><TrendChart data={d.sales_series} series={[{ key: "revenue", name: "Revenue", color: ACCENT }]} height={220} valueFormat={(v) => inr(v)} /></ChartCard>
        <ChartCard title="Views over time"><TrendChart data={d.views_series} series={[{ key: "views", name: "Views", color: "#2563EB" }]} height={220} valueFormat={(v) => num(v)} /></ChartCard>
      </div>
    </>
  );
}

function ViewsTab({ d }: { d: ProductDetailPayload }) {
  return (
    <>
      <KpiGrid>
        <KpiCard label="Total views" value={num(d.views.total_views)} tracksLater />
        <KpiCard label="Distinct visitors" value={num(d.views.distinct_visitors)} tracksLater />
        <KpiCard label="Guest views" value={num(d.views.guest_views)} />
        <KpiCard label="Registered views" value={num(d.views.registered_views)} />
        <KpiCard label="Returning visitors" value={num(d.views.returning_visitors)} hint="Visitors who viewed on 2+ days" />
        <KpiCard label="Avg views / visitor" value={d.views.avg_views_per_visitor?.toFixed(2) ?? "—"} />
      </KpiGrid>
      <div className="mt-4"><ChartCard title="Views over time"><TrendChart data={d.views_series} series={[{ key: "views", name: "Views", color: "#2563EB" }, { key: "visitors", name: "Visitors", color: "#0F766E" }]} height={260} valueFormat={(v) => num(v)} /></ChartCard></div>
    </>
  );
}

function WishlistTab({ d }: { d: ProductDetailPayload }) {
  return (
    <KpiGrid>
      <KpiCard label="Wishlist adds" value={num(d.wishlist.adds)} />
      <KpiCard label="Distinct wishlisters" value={num(d.wishlist.distinct_users)} />
      <KpiCard label="Removes" value={num(d.wishlist.removes)} higherIsBetter={false} />
      <KpiCard label="Active wishlists" value={num(d.wishlist.active_wishlists)} hint="Currently on someone’s list" />
      <KpiCard label="Wishlist rate" value={pct(d.wishlist.wishlist_rate)} hint="Adds ÷ views" tracksLater />
      <KpiCard label="Wishlist → cart" value={pct(d.wishlist.to_cart_pct)} />
      <KpiCard label="Wishlist → purchase" value={pct(d.wishlist.to_purchase_pct)} />
    </KpiGrid>
  );
}

function CartTab({ d }: { d: ProductDetailPayload }) {
  const t = d.cart.avg_view_to_cart_seconds;
  const timeToCart = t == null ? "—" : t < 60 ? `${Math.round(t)}s` : t < 3600 ? `${Math.round(t / 60)}m` : `${(t / 3600).toFixed(1)}h`;
  return (
    <KpiGrid>
      <KpiCard label="Cart adds" value={num(d.cart.adds)} />
      <KpiCard label="Distinct carters" value={num(d.cart.distinct_users)} />
      <KpiCard label="Removes" value={num(d.cart.removes)} higherIsBetter={false} />
      <KpiCard label="Active carts" value={num(d.cart.active_carts)} hint="Currently in someone’s cart" />
      <KpiCard label="View → cart" value={pct(d.cart.view_to_cart_pct)} tracksLater />
      <KpiCard label="Cart → purchase" value={pct(d.cart.cart_to_purchase_pct)} />
      <KpiCard label="Avg time view → cart" value={timeToCart} tracksLater hint="Median time from first view to add" />
    </KpiGrid>
  );
}

function PurchasesTab({ d }: { d: ProductDetailPayload }) {
  return (
    <>
      <KpiGrid>
        <KpiCard label="Orders" value={num(d.purchases.orders)} />
        <KpiCard label="Reorders" value={num(d.purchases.reorders)} />
        <KpiCard label="Revenue" value={inr(d.purchases.revenue)} />
        <KpiCard label="Distinct buyers" value={num(d.purchases.buyers)} />
        <KpiCard label="Repeat buyers" value={num(d.purchases.repeat_buyers)} />
        <KpiCard label="Cancelled orders" value={num(d.purchases.cancelled_orders)} higherIsBetter={false} />
      </KpiGrid>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orders over time"><TrendChart data={d.sales_series} series={[{ key: "orders", name: "Orders", color: ACCENT }]} height={220} valueFormat={(v) => num(v)} /></ChartCard>
        <ChartCard title="Revenue over time"><TrendChart data={d.sales_series} series={[{ key: "revenue", name: "Revenue", color: "#2563EB" }]} height={220} valueFormat={(v) => inr(v)} /></ChartCard>
      </div>
    </>
  );
}

function FunnelTab({ d }: { d: ProductDetailPayload }) {
  const stages = [
    { label: "Views", value: n(d.funnel.views) },
    { label: "Wishlist", value: n(d.funnel.wishlist) },
    { label: "Cart", value: n(d.funnel.cart) },
    { label: "Checkout", value: n(d.funnel.checkout) },
    { label: "Purchase", value: n(d.funnel.purchase) },
    { label: "Repeat", value: n(d.funnel.repeat) },
  ];
  const top = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-gray-400 bg-white p-5">
      <p className="mb-4 text-sm text-gray-500">Each stage shows its count, conversion from the previous stage, and drop-off. Stages after Views are account-based (only logged-in shoppers can wishlist, cart or buy).</p>
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const prev = i === 0 ? null : stages[i - 1].value;
          const conv = prev && prev > 0 ? (s.value / prev) * 100 : null;
          const drop = conv == null ? null : 100 - conv;
          const width = Math.max((s.value / top) * 100, s.value > 0 ? 4 : 0.5);
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-right text-xs font-semibold text-gray-600">{s.label}</span>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-gray-100">
                <div className="flex h-full items-center rounded-lg px-3 text-xs font-bold text-white transition-all" style={{ width: `${width}%`, backgroundColor: ACCENT, opacity: 1 - i * 0.1 }}>
                  {num(s.value)}
                </div>
              </div>
              <div className="w-28 shrink-0 text-right text-xs">
                {conv == null ? <span className="text-gray-300">—</span> : (
                  <>
                    <span className="font-semibold text-gray-700">{pct(conv)}</span>
                    {drop != null && drop > 0 && <span className="ml-1 text-red-500">−{drop.toFixed(0)}%</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenderTab({ d }: { d: ProductDetailPayload }) {
  const LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", guest: "Guest" };
  return (
    <div className="overflow-hidden rounded-xl border border-gray-400 bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50/60 text-[11px] uppercase tracking-wide text-gray-500">
          <th className="px-3 py-2 text-left font-semibold">Segment</th>
          <th className="px-3 py-2 text-right font-semibold">Views</th>
          <th className="px-3 py-2 text-right font-semibold">Wishlists</th>
          <th className="px-3 py-2 text-right font-semibold">Cart adds</th>
          <th className="px-3 py-2 text-right font-semibold">Orders</th>
          <th className="px-3 py-2 text-right font-semibold">Revenue</th>
          <th className="px-3 py-2 text-right font-semibold">Conv.</th>
        </tr></thead>
        <tbody>
          {d.gender.map((g) => (
            <tr key={g.segment} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2.5 font-medium text-gray-800">{LABEL[g.segment] ?? g.segment}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.views)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.wishlists)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.cart_adds)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{num(g.orders)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{inr(g.revenue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{g.conversion == null ? "—" : pct(g.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantsTab({ d }: { d: ProductDetailPayload }) {
  const colorCols: Column<ProductDetailPayload["by_color"][number]>[] = [
    { key: "color", header: "Colour", searchable: true, sortable: true,
      render: (r) => <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: r.hex ?? "#ccc" }} /><span className="font-medium text-gray-800">{r.color}</span></span> },
    { key: "views", header: "Views", align: "right", sortable: true, render: (r) => num(r.views), csv: (r) => r.views },
    { key: "cart_adds", header: "Cart", align: "right", sortable: true, render: (r) => num(r.cart_adds), csv: (r) => r.cart_adds },
    { key: "orders", header: "Orders", align: "right", sortable: true, render: (r) => num(r.orders), csv: (r) => r.orders },
    { key: "units", header: "Units", align: "right", sortable: true, render: (r) => num(r.units), csv: (r) => r.units },
    { key: "revenue", header: "Revenue", align: "right", sortable: true, render: (r) => inr(r.revenue), csv: (r) => r.revenue },
    { key: "conversion", header: "Conv.", align: "right", sortable: true, sortValue: (r) => r.conversion ?? -1, render: (r) => (r.conversion == null ? "—" : pct(r.conversion)), csv: (r) => r.conversion ?? "" },
  ];
  const sizeCols: Column<ProductDetailPayload["by_size"][number]>[] = [
    { key: "size", header: "Size", searchable: true, sortable: true, render: (r) => <span className="font-medium text-gray-800">{r.size}</span> },
    { key: "cart_adds", header: "Cart", align: "right", sortable: true, render: (r) => num(r.cart_adds), csv: (r) => r.cart_adds },
    { key: "orders", header: "Orders", align: "right", sortable: true, render: (r) => num(r.orders), csv: (r) => r.orders },
    { key: "units", header: "Units", align: "right", sortable: true, render: (r) => num(r.units), csv: (r) => r.units },
    { key: "revenue", header: "Revenue", align: "right", sortable: true, render: (r) => inr(r.revenue), csv: (r) => r.revenue },
  ];
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue by colour">
          {d.by_color.length > 0 ? <RankedBars data={d.by_color.map((c) => ({ ...c, name: c.color }))} valueKey="revenue" labelKey="name" valueFormat={(v) => inr(v)} colorByIndex height={Math.max(140, d.by_color.length * 34)} /> : <Empty />}
        </ChartCard>
        <ChartCard title="Revenue by size">
          {d.by_size.length > 0 ? <ColumnBars data={d.by_size.map((s) => ({ ...s, label: s.size }))} valueKey="revenue" labelKey="label" valueFormat={(v) => inr(v)} /> : <Empty />}
        </ChartCard>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold text-gray-500">Per colour</p><DataTable columns={colorCols} rows={d.by_color} getRowKey={(r) => r.sku} exportName="variant-colours" pageSize={8} initialSort={{ key: "revenue", dir: "desc" }} emptyMessage="No variant activity yet." /></div>
        <div><p className="mb-2 text-xs font-semibold text-gray-500">Per size</p><DataTable columns={sizeCols} rows={d.by_size} getRowKey={(r) => r.size} exportName="variant-sizes" pageSize={8} initialSort={{ key: "revenue", dir: "desc" }} emptyMessage="No size-level activity yet." /></div>
      </div>
    </>
  );
}

function ReviewsTab({ d }: { d: ProductDetailPayload }) {
  const dist = d.rating_distribution.map((x) => ({ label: `${x.rating}★`, count: x.count }));
  return (
    <>
      <KpiGrid>
        <KpiCard label="Reviews (period)" value={num(d.reviews.total)} />
        <KpiCard label="All-time reviews" value={num(d.reviews.all_time)} />
        <KpiCard label="Avg rating" value={d.reviews.avg_rating_all_time == null ? "—" : <span className="inline-flex items-center gap-1">{d.reviews.avg_rating_all_time.toFixed(2)}<Star className="h-4 w-4 fill-amber-400 text-amber-400" /></span>} />
        <KpiCard label="Verified" value={num(d.reviews.verified)} />
      </KpiGrid>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Rating trend"><TrendChart data={d.rating_trend} series={[{ key: "avg_rating", name: "Avg rating", color: "#D97706" }]} height={220} valueFormat={(v) => v.toFixed(2)} /></ChartCard>
        <ChartCard title="Rating distribution">{dist.some((x) => x.count > 0) ? <ColumnBars data={dist} valueKey="count" labelKey="label" color="#D97706" /> : <Empty />}</ChartCard>
      </div>
    </>
  );
}

function SearchTab({ d }: { d: ProductDetailPayload }) {
  return (
    <>
      <KpiGrid>
        <KpiCard label="Search appearances" value={num(d.search.appearances)} hint="Searches that returned this product" tracksLater />
        <KpiCard label="Search clicks" value={num(d.search.clicks)} tracksLater />
        <KpiCard label="Search CTR" value={pct(d.search.ctr)} tracksLater />
        <KpiCard label="Orders from search" value={num(d.search.orders_from_search)} />
      </KpiGrid>
      <div className="mt-4">
        <ChartCard title="Top search queries" subtitle="Queries that surfaced this product">
          {d.top_queries.length > 0 ? <RankedBars data={d.top_queries.map((q) => ({ ...q, name: q.query }))} valueKey="count" labelKey="name" valueFormat={(v) => `${num(v)}×`} height={Math.max(160, d.top_queries.length * 34)} /> : <Empty />}
        </ChartCard>
      </div>
    </>
  );
}

function RankingsTab({ d }: { d: ProductDetailPayload }) {
  const total = n(d.rankings?.total_products); // numeric, for the percentile math
  const rows = [
    { metric: "Revenue", rank: d.rankings?.revenue_rank },
    { metric: "Orders", rank: d.rankings?.orders_rank },
    { metric: "Views", rank: d.rankings?.views_rank },
    { metric: "Wishlist", rank: d.rankings?.wishlist_rank },
    { metric: "Cart adds", rank: d.rankings?.cart_rank },
    { metric: "Conversion", rank: d.rankings?.conversion_rank },
    { metric: "Rating", rank: d.rankings?.rating_rank },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-gray-400 bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50/60 text-[11px] uppercase tracking-wide text-gray-500">
          <th className="px-3 py-2 text-left font-semibold">Metric</th>
          <th className="px-3 py-2 text-right font-semibold">Rank</th>
          <th className="px-3 py-2 text-right font-semibold">Percentile</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const rank = n(r.rank);
            const pctile = rank > 0 && total > 0 ? (1 - (rank - 1) / total) * 100 : null;
            return (
              <tr key={r.metric} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2.5 font-medium text-gray-800">{r.metric}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{rank > 0 ? `#${rank}` : "—"}<span className="ml-1 text-xs font-normal text-gray-400">of {num(total)}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{pctile == null ? "—" : `Top ${(100 - pctile).toFixed(0) === "0" ? 1 : Math.max(1, Math.round(100 - pctile))}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <p className="py-10 text-center text-xs text-gray-400">No data for this range.</p>;
}
