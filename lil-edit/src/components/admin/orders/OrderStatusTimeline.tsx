import { Check, X, Mail, AlertTriangle } from "lucide-react";
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

// Canonical forward path (cancelled is off-path). Used to fill in stages that an
// admin skipped when jumping the order forward — e.g. Pending → Delivered "passed"
// through Processing and Shipped. These are DISPLAY-ONLY markers, not audit rows.
const PATH: OrderStatus[] = ["pending", "processing", "shipped", "delivered"];
const PATH_INDEX: Record<OrderStatus, number> = {
  pending: 0, confirmed: 0, processing: 1, shipped: 2, delivered: 3, cancelled: -1,
};

// Stages strictly between a forward jump's from→to (e.g. pending→delivered ⇒
// [processing, shipped]). Returns [] for adjacent moves, backward corrections, and
// anything touching cancelled — so corrections/cancellations are never expanded.
function skippedStages(fromStatus: OrderStatus | null, toStatus: OrderStatus): OrderStatus[] {
  const fromIdx = fromStatus === null ? 0 : PATH_INDEX[fromStatus];
  const toIdx = PATH_INDEX[toStatus];
  if (toIdx <= 0 || fromIdx < 0 || toIdx <= fromIdx + 1) return [];
  return PATH.slice(fromIdx + 1, toIdx);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

function Node({
  label, fromLabel, toLabel, isPlacement, actor, email, note, stamp, mostRecent, cancelled, correction, isLast,
  notify, onNotify, notifiedCurrent, notifying,
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
  correction: boolean;
  isLast: boolean;
  // `notify` gates whether the (re)send button renders on this node (latest only).
  notify?: boolean;
  // Fires the actual send; `notifiedCurrent` reflects whether this status was already
  // emailed (→ green "Notified" affordance); `notifying` disables it mid-send.
  onNotify?: () => void;
  notifiedCurrent?: boolean;
  notifying?: boolean;
}) {
  const dotBg = cancelled ? "bg-rose-400" : "bg-emerald-500";
  return (
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center self-stretch">
        {/* Same dot/line treatment as the customer journey: latest change is a
            full circle with a tick (rose ✕ if it was a cancellation); earlier ones
            are a small solid dot. */}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {mostRecent ? (
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ring-4 ring-gray-100 ${dotBg}`}>
              {cancelled ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            </span>
          ) : (
            <span className={`h-2 w-2 rounded-full ${dotBg}`} />
          )}
        </span>
        {!isLast && <span className="w-0.5 flex-1 bg-emerald-200" />}
      </div>

      <div className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        {/* Status headline; on the latest state the notify button sits at the right
            of the same row. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className={`text-sm leading-4 flex shrink-0 items-center gap-1.5 ${mostRecent ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
            {label}
          </p>
          {notify && onNotify && (
            <button
              type="button"
              onClick={onNotify}
              disabled={notifying}
              title={notifiedCurrent ? "Send this status update to the customer again" : "Email the customer this status update"}
              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-[4px] bg-[#B19CD9] px-2.5 py-1 text-[11px] font-semibold text-gray-900 transition-colors hover:bg-[#9d86c9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail className="h-3 w-3" />
              {notifying ? "Sending…" : notifiedCurrent ? "Resend via Gmail" : "Notify via Gmail"}
            </button>
          )}
        </div>
        {/* Description: the state change that was made + who made it (the admin-only
            additions over the customer view). */}
        <p className="text-xs text-gray-600 mt-1">
          {correction && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-2.5 w-2.5" /> Correction
            </span>
          )}
          {isPlacement ? (
            <>Order placed</>
          ) : (
            <>Changed from <span className="font-medium text-gray-700">{fromLabel}</span> to <span className="font-medium text-gray-700">{toLabel}</span></>
          )}{" "}
          by <span className="font-medium text-gray-700">{actor}</span>
          {email && <span className="text-gray-500"> · {email}</span>}
        </p>
        {/* Admin note/reminder left with this change, if any. */}
        {note && (
          <p className="mt-1.5 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs italic text-gray-600">
            {note}
          </p>
        )}
        <p className="text-[11px] text-gray-500 mt-1">{stamp}</p>
      </div>
    </li>
  );
}

// Admin status history — the customer "Order Journey" look (latest on top, green
// dots, tick on the most recent), but driven by the real audit events and showing
// A skipped stage shown as "passed" — greyed, no actor/time, not a real audit row.
function PassedNode({ label, isLast }: { label: string; isLast: boolean }) {
  return (
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center self-stretch">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
        </span>
        {!isLast && <span className="w-0.5 flex-1 bg-emerald-200" />}
      </div>
      <div className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        <p className="text-sm leading-4 font-medium text-gray-500">{label}</p>
        <p className="text-[11px] text-gray-500 mt-1">Passed automatically</p>
      </div>
    </li>
  );
}

// who made each change. `events` arrive newest-first from the API.
export function OrderStatusTimeline({
  events, onNotify, notifiedCurrent, notifying,
}: {
  events: OrderStatusEvent[];
  // Send/resend the customer notification for the latest status. `notifiedCurrent` marks
  // it as already-sent; `notifying` is true while a send is in flight.
  onNotify?: () => void;
  notifiedCurrent?: boolean;
  notifying?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-600">No status history recorded yet.</p>;
  }

  // Build the display list: each real event, followed by greyed "passed" markers for
  // any stages it jumped over (shown below it = older). Newest-first throughout, so the
  // skipped stages are reversed (highest stage nearest the jump). These markers are
  // display-only; the underlying audit trail stays exactly as recorded.
  type Item =
    | { kind: "event"; ev: OrderStatusEvent }
    | { kind: "passed"; key: string; label: string };
  const items: Item[] = [];
  for (const ev of events) {
    items.push({ kind: "event", ev });
    for (const st of skippedStages(ev.fromStatus, ev.toStatus).reverse()) {
      items.push({ kind: "passed", key: `${ev.id}-${st}`, label: STATUS_LABEL[st] });
    }
  }

  return (
    <ol className="relative">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        if (item.kind === "passed") {
          return <PassedNode key={item.key} label={item.label} isLast={isLast} />;
        }
        const ev = item.ev;
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
            correction={ev.isCorrection}
            isLast={isLast}
            notify={i === 0}
            onNotify={onNotify}
            notifiedCurrent={notifiedCurrent}
            notifying={notifying}
          />
        );
      })}
    </ol>
  );
}

export default OrderStatusTimeline;
