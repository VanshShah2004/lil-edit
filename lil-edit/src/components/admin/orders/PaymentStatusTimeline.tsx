import { Check, X, AlertTriangle } from "lucide-react";
import type { PaymentStatus, PaymentStatusEvent } from "@/lib/adminOrdersApi";

// Headline per resulting payment status. The opening entry (fromStatus === null) shows
// as "Payment Record Opened".
const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
};

// "Negative" outcomes get the rose ✕ treatment instead of the green tick.
const NEGATIVE: PaymentStatus[] = ["refunded"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

function Node({
  label, fromLabel, toLabel, isOpening, actor, email, note, stamp, mostRecent, negative, correction, isLast,
}: {
  label: string;
  fromLabel?: string;
  toLabel: string;
  isOpening: boolean;
  actor: string;
  email?: string;
  note?: string | null;
  stamp: string;
  mostRecent: boolean;
  negative: boolean;
  correction: boolean;
  isLast: boolean;
}) {
  const dotBg = negative ? "bg-rose-400" : "bg-emerald-500";
  return (
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center self-stretch">
        {/* Same dot/line treatment as the order status timeline: latest change is a
            full circle with a tick (rose ✕ for failed/refunded); earlier ones are a
            small solid dot. */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {mostRecent ? (
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ring-4 ring-gray-100 ${dotBg}`}>
              {negative ? <X className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
            </span>
          ) : (
            <span className={`h-2 w-2 rounded-full ${dotBg}`} />
          )}
        </span>
        {!isLast && <span className="w-0.5 flex-1 bg-emerald-200" />}
      </div>

      <div className={`flex-1 ${isLast ? "" : "pb-6"}`}>
        <p className={`text-sm leading-4 flex items-center gap-1.5 ${mostRecent ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
          {label}
          {correction && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-2.5 w-2.5" /> Correction
            </span>
          )}
        </p>
        {/* Description: the change that was made + who made it. */}
        <p className="text-xs text-gray-500 mt-1">
          {isOpening ? (
            <>Payment record opened</>
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

// Admin payment history — the order-status timeline look (latest on top, tick on the
// most recent), driven by the real payment audit events. `events` arrive newest-first.
export function PaymentStatusTimeline({ events }: { events: PaymentStatusEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No payment history recorded yet.</p>;
  }

  return (
    <ol className="relative">
      {events.map((ev, i) => {
        const isOpening = ev.fromStatus === null;
        const label = isOpening ? "Payment Record Opened" : PAYMENT_LABEL[ev.toStatus];
        const actor = ev.changedByName || (isOpening ? "System" : "Admin");
        return (
          <Node
            key={ev.id}
            label={label}
            fromLabel={ev.fromStatus ? PAYMENT_LABEL[ev.fromStatus] : undefined}
            toLabel={PAYMENT_LABEL[ev.toStatus]}
            isOpening={isOpening}
            actor={actor}
            email={ev.changedByEmail}
            note={ev.note}
            stamp={formatStamp(ev.createdAt)}
            mostRecent={i === 0}
            negative={NEGATIVE.includes(ev.toStatus)}
            correction={ev.isCorrection}
            isLast={i === events.length - 1}
          />
        );
      })}
    </ol>
  );
}

export default PaymentStatusTimeline;
