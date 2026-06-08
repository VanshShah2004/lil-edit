import type { AdminOrderDetail } from "@/lib/adminOrdersApi";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function Row({ label, value, accent, strong }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={strong ? "font-semibold text-gray-900" : "text-gray-600"}>{label}</span>
      <span className={`${strong ? "text-lg font-bold text-gray-900" : accent ? "text-emerald-600 font-medium" : "text-gray-800"} whitespace-nowrap`}>
        {value}
      </span>
    </div>
  );
}

export function OrderSummaryCard({ order }: { order: AdminOrderDetail }) {
  return (
    <div className="space-y-2.5">
      <Row label="Subtotal" value={inr(order.subtotal)} />
      {order.discount > 0 && <Row label="Discount" value={`−${inr(order.discount)}`} accent />}
      <Row label="Shipping Cost" value={order.shippingFee > 0 ? inr(order.shippingFee) : "Free"} />
      <Row label="Tax" value={order.tax > 0 ? inr(order.tax) : "—"} />
      <div className="border-t border-gray-200 pt-3 mt-1">
        <Row label="Grand Total" value={inr(order.total)} strong />
      </div>
    </div>
  );
}

export default OrderSummaryCard;
