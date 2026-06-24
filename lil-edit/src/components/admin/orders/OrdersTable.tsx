import { Eye } from "lucide-react";
import { OrderStatusBadge, PaymentStatusBadge } from "./OrderStatusBadge";
import type { AdminOrderSummary } from "@/lib/adminOrdersApi";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface OrdersTableProps {
  orders: AdminOrderSummary[];
  onView: (orderId: string) => void;
}

export function OrdersTable({ orders, onView }: OrdersTableProps) {
  return (
    <>
      {/* ── Desktop / tablet: table ─────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Order ID", "Customer", "Email", "Date", "Total", "Items", "Payment", "Status", ""].map((h, i) => (
                <th
                  key={h || i}
                  className={`px-4 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap ${i === 4 || i === 5 ? "text-right" : ""}`}
                >
                  {h || "Actions"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((o) => (
              <tr
                key={o.id}
                onClick={() => onView(o.id)}
                className="hover:bg-gray-50/60 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 whitespace-nowrap">{o.orderNumber}</td>
                <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{o.customer.name}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate">{o.customer.email || "—"}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{inr(o.total)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{o.itemCount}</td>
                <td className="px-4 py-3"><PaymentStatusBadge status={o.paymentStatus} /></td>
                <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onView(o.id); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-2.5 py-1.5 hover:border-gray-900 hover:text-gray-900 transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: card list ───────────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onView(o.id)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 shadow-sm active:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-gray-900">{o.orderNumber}</p>
                <p className="text-sm font-medium text-gray-800 mt-1 truncate">{o.customer.name}</p>
                <p className="text-xs text-gray-500 truncate">{o.customer.email || "—"}</p>
              </div>
              <OrderStatusBadge status={o.status} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                {formatDate(o.createdAt)} · {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-2">
                <PaymentStatusBadge status={o.paymentStatus} />
                <span className="text-sm font-bold text-gray-900">{inr(o.total)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export default OrdersTable;
