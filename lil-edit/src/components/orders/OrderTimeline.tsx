import { Check, X } from "lucide-react";
import type { OrderStatus, OrderStatusEvent } from "@/lib/ordersApi";

// The customer-facing journey is a fixed four-milestone tracker. Reached steps are
// stamped from the order's real history; the rest show as upcoming.
const STEPS: { label: string; reachedAt: OrderStatus }[] = [
  { label: "Placed",     reachedAt: "pending" },
  { label: "Processing", reachedAt: "processing" },
  { label: "Shipped",    reachedAt: "shipped" },
  { label: "Delivered",  reachedAt: "delivered" },
];

// How far along the canonical Placed → Processing → Shipped → Delivered path each
// status sits. pending/confirmed are "placed but not yet processing". cancelled is
// off-path and handled separately.
const STEP_INDEX: Record<OrderStatus, number> = {
  pending: 0, confirmed: 0, processing: 1, shipped: 2, delivered: 3, cancelled: -1,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

function Node({
  label, stamp, state, cancelled, isLast,
}: {
  label: string;
  stamp?: string;
  state: "done" | "current" | "upcoming";
  cancelled?: boolean;
  isLast: boolean;
}) {
  const reached = state === "done" || state === "current";
  return (
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center self-stretch">
        {/* Fixed 16px slot keeps every row aligned regardless of dot size. The
            current step is a full circle with a tick; earlier done steps are a
            smaller solid green dot; upcoming steps a smaller grey dot. */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {cancelled ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-400 text-white ring-4 ring-gray-100">
              <X className="h-2.5 w-2.5" />
            </span>
          ) : state === "current" ? (
            // Only the most recent reached step gets the tick (full-size circle).
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-gray-100">
              <Check className="h-2.5 w-2.5" />
            </span>
          ) : (
            // Earlier done steps = small green dot; upcoming = small grey dot.
            <span className={`h-2 w-2 rounded-full ${reached ? "bg-emerald-500" : "bg-gray-300"}`} />
          )}
        </span>
        {/* Connector fills the whole gap down to the next dot; spacing lives on the
            text column (pb-6) so the rail stretches the full distance — no gap. */}
        {!isLast && <span className={`w-0.5 flex-1 ${reached ? "bg-emerald-200" : "bg-gray-200"}`} />}
      </div>

      <div className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        <p className={`text-sm leading-4 ${state === "current" ? "font-bold text-gray-900" : reached ? "font-medium text-gray-700" : "font-medium text-gray-400"}`}>
          {label}
        </p>
        {stamp ? (
          <p className="text-xs text-gray-400 mt-0.5">{stamp}</p>
        ) : (
          state === "upcoming" && <p className="text-xs text-gray-300 mt-0.5">Upcoming</p>
        )}
      </div>
    </li>
  );
}

// Customer "Order Journey" — the canonical Placed → Processing → Shipped → Delivered
// milestones, timestamped from the order's real status history. If the order was
// cancelled, the reached milestones are shown followed by a terminal "Cancelled" node.
export function OrderTimeline({ events, currentStatus }: { events: OrderStatusEvent[]; currentStatus: OrderStatus }) {
  if (events.length === 0) return null;

  // Earliest time each milestone was reached. "Placed" = the opening entry (oldest
  // event); the others = the first event that moved the order into that status.
  const stampFor = (idx: number): string | undefined => {
    if (idx === 0) return events[0]?.createdAt;
    const target = STEPS[idx].reachedAt;
    return events.find((e) => e.toStatus === target)?.createdAt;
  };

  const cancelled = currentStatus === "cancelled";
  const cancelledAt = cancelled ? events.find((e) => e.toStatus === "cancelled")?.createdAt : undefined;

  // Build the milestones in chronological (Placed → Delivered) order, then render
  // them reversed so the latest stage sits on top.
  type NodeDesc = { key: string; label: string; stamp?: string; state: "done" | "current" | "upcoming"; cancelled?: boolean };
  let nodes: NodeDesc[];

  if (cancelled) {
    // Only milestones that genuinely happened, then a terminal Cancelled entry.
    nodes = STEPS.flatMap((step, idx) => {
      const stamp = stampFor(idx);
      return stamp ? [{ key: step.label, label: step.label, stamp: formatStamp(stamp), state: "done" as const }] : [];
    });
    nodes.push({
      key: "cancelled",
      label: "Cancelled",
      stamp: cancelledAt ? formatStamp(cancelledAt) : undefined,
      state: "current",
      cancelled: true,
    });
  } else {
    const current = STEP_INDEX[currentStatus];
    // Only milestones up to (and including) the current state — remaining stages
    // aren't shown.
    const reached = STEPS.slice(0, current + 1);
    const owns = reached.map((_, idx) => stampFor(idx));
    // A skipped step (no discrete event of its own — e.g. the order jumped from
    // pending straight to delivered) takes the timestamp of the HIGHER state it was
    // jumped TO, not the one it moved from. So carry the time backward from the top.
    const resolved: (string | undefined)[] = [];
    let carriedFromAbove: string | undefined;
    for (let idx = current; idx >= 0; idx--) {
      if (owns[idx]) carriedFromAbove = owns[idx];
      resolved[idx] = owns[idx] ?? carriedFromAbove;
    }
    nodes = reached.map((step, idx) => ({
      key: step.label,
      label: step.label,
      stamp: formatStamp(resolved[idx] as string),
      state: idx === current ? "current" : "done",
    }));
  }

  // Reverse for display: latest milestone on top, earliest at the bottom.
  const ordered = [...nodes].reverse();

  return (
    <div className="p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Order Journey</h2>
      <ol className="relative">
        {ordered.map((n, i) => (
          <Node
            key={n.key}
            label={n.label}
            stamp={n.stamp}
            state={n.state}
            cancelled={n.cancelled}
            isLast={i === ordered.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

export default OrderTimeline;
