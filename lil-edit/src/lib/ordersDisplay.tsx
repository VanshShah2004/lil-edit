import type { OrderStatus, OrderSummary } from "@/lib/ordersApi";

// Status → badge colours. Keys match the DB status CHECK constraint.
export const STATUS_STYLES: Record<OrderStatus, string> = {
  confirmed:  "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  cancelled:  "bg-rose-50 text-rose-700 border-rose-200",
};

// Solid accent colours for the card's top strip — keyed to the same statuses.
export const STATUS_ACCENT: Record<OrderStatus, string> = {
  confirmed:  "bg-amber-400",
  processing: "bg-emerald-400",
  shipped:    "bg-emerald-400",
  delivered:  "bg-indigo-400",
  cancelled:  "bg-rose-400",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]},${d.getFullYear()}`;
}

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export type SortKey = "newest" | "oldest";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export function sortOrders(orders: OrderSummary[], key: SortKey): OrderSummary[] {
  const copy = [...orders];
  const time = (o: OrderSummary) => new Date(o.createdAt).getTime();
  return key === "oldest"
    ? copy.sort((a, b) => time(a) - time(b))
    : copy.sort((a, b) => time(b) - time(a));
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md border capitalize ${STATUS_STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
