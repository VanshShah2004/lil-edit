import type { OrderStatus, PaymentStatus } from "@/lib/adminOrdersApi";

// Order-status badge colours:
//   Confirmed → Amber, Processing → Green, Shipped → Purple, Delivered → Blue,
//   Cancelled → Red. `pending` is not a valid order status (orders start at
//   `confirmed`) — kept only as a fallback below for unexpected/legacy values.
const ORDER_STATUS_STYLES: Partial<Record<OrderStatus, string>> = {
  confirmed:  "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-green-50 text-green-700 border-green-200",
  shipped:    "bg-purple-50 text-purple-700 border-purple-200",
  delivered:  "bg-blue-50 text-blue-700 border-blue-200",
  cancelled:  "bg-red-50 text-red-700 border-red-200",
};
const ORDER_STATUS_FALLBACK = "bg-gray-100 text-gray-600 border-gray-200";

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  paid:     "bg-green-50 text-green-700 border-green-200",
  pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  refunded: "bg-gray-100 text-gray-600 border-gray-200",
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border capitalize whitespace-nowrap ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Pill label={status} className={ORDER_STATUS_STYLES[status] ?? ORDER_STATUS_FALLBACK} />;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill label={status} className={PAYMENT_STATUS_STYLES[status] ?? PAYMENT_STATUS_STYLES.pending} />;
}

export default OrderStatusBadge;
