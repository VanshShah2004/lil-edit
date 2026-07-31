import { Package } from "lucide-react";
import type { OrderItem } from "@/lib/adminOrdersApi";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function Thumb({ item }: { item: OrderItem }) {
  return (
    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
      {item.image ? (
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <Package size={18} />
        </div>
      )}
    </div>
  );
}

export function OrderItemsTable({ items }: { items: OrderItem[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto border border-foreground/50 rounded-lg">
        <table className="w-full text-center text-sm border-collapse">
          <thead>
            <tr className="border-b border-foreground/50">
              {["Product", "SKU", "Qty", "Unit Price", "Subtotal"].map((h) => (
                <th
                  key={h}
                  className="px-5 sm:px-6 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider align-middle text-center"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-foreground/50 align-middle">
                <td className="px-5 sm:px-6 py-3 pr-3 text-center align-middle">
                  <div className="flex items-center justify-center gap-3">
                    <Thumb item={item} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 line-clamp-2 text-sm">{item.title}</p>
                      {(item.size || item.color.name) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[item.size && `Size: ${item.size}`, item.color.name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 sm:px-6 py-3 pr-3 font-mono text-xs text-gray-500 whitespace-nowrap align-middle text-center">{item.sku || "—"}</td>
                <td className="px-5 sm:px-6 py-3 text-center text-gray-700 text-sm align-middle">{item.quantity}</td>
                <td className="px-5 sm:px-6 py-3 text-center text-gray-700 whitespace-nowrap text-sm align-middle">{inr(item.unitPrice)}</td>
                <td className="px-5 sm:px-6 py-3 text-center font-semibold text-gray-900 whitespace-nowrap text-sm align-middle">{inr(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden">
        {items.map((item, idx) => (
          <div key={item.id} className={`flex gap-3 py-3 ${idx < items.length - 1 ? "border-b border-foreground/50" : ""}`}>
            <Thumb item={item} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm line-clamp-2">{item.title}</p>
              <p className="font-mono text-xs text-gray-500 mt-0.5">{item.sku || "—"}</p>
              <div className="flex items-center justify-between mt-1 text-sm text-gray-600">
                <span>{inr(item.unitPrice)} × {item.quantity}</span>
                <span className="font-semibold text-gray-900">{inr(item.lineTotal)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default OrderItemsTable;
