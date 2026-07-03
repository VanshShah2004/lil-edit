import { Eye, Heart, Package, Radio, Search, ShoppingCart, Star, Wallet } from "lucide-react";
import { AnalyticsLayout, KpiGrid, Section } from "@/components/analytics/AnalyticsLayout";
import { ErrorState, isMigrationError } from "@/components/analytics/states";
import { inr, num, prettySlug, timeAgo } from "@/components/analytics/format";
import { useLiveAnalytics, type LivePayload } from "@/lib/analyticsApi";

type FeedItem = LivePayload["feed"][number];

const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function visual(type: string) {
  switch (type) {
    case "product_view": return { Icon: Eye, color: "#2563EB", bg: "rgba(37,99,235,0.1)" };
    case "cart_add": return { Icon: ShoppingCart, color: "#0F766E", bg: "rgba(15,118,110,0.1)" };
    case "cart_remove": return { Icon: ShoppingCart, color: "#9CA3AF", bg: "rgba(156,163,175,0.14)" };
    case "wishlist_add": return { Icon: Heart, color: "#DB2777", bg: "rgba(219,39,119,0.1)" };
    case "wishlist_remove": return { Icon: Heart, color: "#9CA3AF", bg: "rgba(156,163,175,0.14)" };
    case "order_placed": return { Icon: Package, color: "#7C3AED", bg: "rgba(124,58,237,0.1)" };
    case "checkout_started": return { Icon: Wallet, color: "#D97706", bg: "rgba(217,119,6,0.12)" };
    case "review_submitted": return { Icon: Star, color: "#D97706", bg: "rgba(217,119,6,0.12)" };
    case "search": return { Icon: Search, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
    default: return { Icon: Radio, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
  }
}

function describe(item: FeedItem): string {
  const who = item.user_name || "A guest";
  const product = item.title || prettySlug(item.slug);
  switch (item.type) {
    case "product_view": return `${who} viewed ${product}`;
    case "cart_add": return `${who} added ${product} to cart`;
    case "cart_remove": return `${who} removed ${product} from cart`;
    case "wishlist_add": return `${who} wishlisted ${product}`;
    case "wishlist_remove": return `${who} un-wishlisted ${product}`;
    case "order_placed": return `${who} placed an order${item.metadata.total ? ` — ${inr(Number(item.metadata.total))}` : ""}`;
    case "checkout_started": return `${who} started checkout${item.metadata.total ? ` — ${inr(Number(item.metadata.total))}` : ""}`;
    case "review_submitted": return `${who} reviewed ${product}${item.metadata.rating ? ` (${item.metadata.rating}★)` : ""}`;
    case "search": return `${who} searched “${asStr(item.metadata.query)}”`;
    default: return `${who} did something`;
  }
}

export default function LiveDashboard() {
  const query = useLiveAnalytics<LivePayload>(10_000);
  const d = query.data?.data;

  const actions = (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live{query.data ? ` · updated ${timeAgo(d?.as_of ?? new Date().toISOString())}` : ""}
    </span>
  );

  return (
    <AnalyticsLayout title="Live" description="What’s happening on the store right now (last 5 minutes)." actions={actions}>
      {query.isError ? (
        <ErrorState message={query.error.message} isMigration={isMigrationError(query.error.message)} onRetry={() => query.refetch()} />
      ) : !d ? (
        <KpiGrid>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200/60" />)}</KpiGrid>
      ) : (
        <>
          <Section title="Right now">
            <KpiGrid>
              <LiveStat label="Live visitors" value={num(d.kpis.live_visitors)} Icon={Radio} color="#0F766E" />
              <LiveStat label="Views (5m)" value={num(d.kpis.views_5m)} Icon={Eye} color="#2563EB" />
              <LiveStat label="Cart adds (5m)" value={num(d.kpis.cart_adds_5m)} Icon={ShoppingCart} color="#0F766E" />
              <LiveStat label="Wishlist adds (5m)" value={num(d.kpis.wishlist_adds_5m)} Icon={Heart} color="#DB2777" />
              <LiveStat label="Orders (60m)" value={num(d.kpis.orders_60m)} Icon={Package} color="#7C3AED" />
              <LiveStat label="Revenue (60m)" value={inr(d.kpis.revenue_60m)} Icon={Wallet} color="#D97706" />
            </KpiGrid>
          </Section>

          <Section title="Activity feed" hint="Newest first — refreshes every 10 seconds.">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {d.feed.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-gray-400">Quiet right now — no activity in the last few minutes.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {d.feed.map((item, i) => {
                    const { Icon, color, bg } = visual(item.type);
                    return (
                      <li key={`${item.at}-${i}`} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm text-gray-700">{describe(item)}</p>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{timeAgo(item.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Section>
        </>
      )}
    </AnalyticsLayout>
  );
}

function LiveStat({ label, value, Icon, color }: { label: string; value: string; Icon: typeof Radio; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
      </div>
    </div>
  );
}
