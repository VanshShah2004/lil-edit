import { Check, X } from "lucide-react";
import type { OrderStatus, OrderStatusEvent } from "@/lib/adminOrdersApi";

// Headline per resulting status. The opening entry (fromStatus === null) shows as
// "Order Placed".
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

function Node({
  label, fromLabel, toLabel, isPlacement, actor, email, note, stamp, mostRecent, cancelled, isLast,
}: {
  label: string;
  fromLabel?: string;
  toLabel: string;
  isPlacement: boolean;
  actor: string;
  email?: string;
  note?: string | null;
  stamp: string;
  mostRecent: boolean;
  cancelled: boolean;
  isLast: boolean;
}) {
  const dotBg = cancelled ? "bg-rose-400" : "bg-emerald-500";
  return (
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center self-stretch">
        {/* Same dot/line treatment as the customer journey: latest change is a
            full circle with a tick (rose ✕ if it was a cancellation); earlier ones
            are a small solid dot. */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {mostRecent ? (
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ring-4 ring-gray-100 ${dotBg}`}>
              {cancelled ? <X className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
            </span>
          ) : (
            <span className={`h-2 w-2 rounded-full ${dotBg}`} />
          )}
        </span>
        {!isLast && <span className="w-0.5 flex-1 bg-emerald-200" />}
      </div>

      <div className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        <p className={`text-sm leading-4 ${mostRecent ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
          {label}
        </p>
        {/* Description: the state change that was made + who made it (the admin-only
            additions over the customer view). */}
        <p className="text-xs text-gray-500 mt-1">
          {isPlacement ? (
            <>Order placed</>
          ) : (
            <>Changed from <span className="font-medium text-gray-700">{fromLabel}</span> to <span className="font-medium text-gray-700">{toLabel}</span></>
          )}{" "}
          by <span className="font-medium text-gray-700">{actor}</span>
          {email && <span className="text-gray-400"> · {email}</span>}
        </p>
        {/* Admin note/reminder left with this change, if any. */}
        {note && (
          <p className="mt-1.5 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs italic text-gray-600">
            {note}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">{stamp}</p>
      </div>
    </li>
  );
}

// Admin status history — the customer "Order Journey" look (latest on top, green
// dots, tick on the most recent), but driven by the real audit events and showing
// who made each change. `events` arrive newest-first from the API.
export function OrderStatusTimeline({ events }: { events: OrderStatusEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No status history recorded yet.</p>;
  }

  return (
    <ol className="relative">
      {events.map((ev, i) => {
        const isPlacement = ev.fromStatus === null;
        const label = isPlacement ? "Order Placed" : STATUS_LABEL[ev.toStatus];
        const actor = ev.changedByName || (isPlacement ? "System" : "Admin");
        return (
          <Node
            key={ev.id}
            label={label}
            fromLabel={ev.fromStatus ? STATUS_LABEL[ev.fromStatus] : undefined}
            toLabel={STATUS_LABEL[ev.toStatus]}
            isPlacement={isPlacement}
            actor={actor}
            email={ev.changedByEmail}
            note={ev.note}
            stamp={formatStamp(ev.createdAt)}
            mostRecent={i === 0}
            cancelled={ev.toStatus === "cancelled"}
            isLast={i === events.length - 1}
          />
        );
      })}
    </ol>
  );
}

export default OrderStatusTimeline;
