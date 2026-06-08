import { ArrowRight, ShoppingBag, UserCog } from "lucide-react";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { OrderStatusEvent } from "@/lib/adminOrdersApi";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Audit trail of every status change on this order, newest first. Each entry is an
// immutable record of who moved it from one status to another and when. The opening
// "order placed" entry has no fromStatus and was recorded by the system.
export function OrderStatusTimeline({ events }: { events: OrderStatusEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No status history recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-5">
      {events.map((ev, i) => {
        const isPlacement = ev.fromStatus === null;
        const actor = ev.changedByName || (isPlacement ? "System" : "Admin");
        const isLast = i === events.length - 1;

        return (
          <li key={ev.id} className="relative flex gap-3.5">
            {/* Rail + dot */}
            <div className="flex flex-col items-center">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: "#E5DEF5", backgroundColor: "#F6F2FC", color: "#7C5CBF" }}
              >
                {isPlacement ? <ShoppingBag className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
              </span>
              {!isLast && <span className="mt-1 w-px flex-1 bg-gray-200" />}
            </div>

            {/* Entry */}
            <div className="flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                {isPlacement ? (
                  <OrderStatusBadge status={ev.toStatus} />
                ) : (
                  <>
                    {ev.fromStatus && <OrderStatusBadge status={ev.fromStatus} />}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    <OrderStatusBadge status={ev.toStatus} />
                  </>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-600">
                {isPlacement ? "Order placed" : "Status updated"} by{" "}
                <span className="font-semibold text-gray-800">{actor}</span>
                {ev.changedByEmail && (
                  <span className="text-gray-400"> · {ev.changedByEmail}</span>
                )}
              </p>
              <p className="text-[11px] text-gray-400">{formatDateTime(ev.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default OrderStatusTimeline;
