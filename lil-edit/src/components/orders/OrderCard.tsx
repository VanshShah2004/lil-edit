import { Link } from "react-router-dom";
import { ArrowRight, Package, RotateCcw, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { OrderSummary } from "@/lib/ordersApi";
import { STATUS_ACCENT, StatusBadge, formatDate, inr } from "@/lib/ordersDisplay";

interface OrderCardProps {
  order: OrderSummary;
  reorderingId: string | null;
  onReorder: (e: React.MouseEvent, order: OrderSummary) => void;
}

export default function OrderCard({ order, reorderingId, onReorder }: OrderCardProps) {
  return (
    <Link to={`/orders/${order.id}`} className="block group w-full">
      <Card className="relative bg-white border border-gray-400 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/10 sm:min-h-[210px] hover:shadow-2xl hover:-translate-y-0.5 hover:border-brand-teal/60 transition-all duration-300">
        {/* Status accent strip */}
        <div className={`h-1 w-full ${STATUS_ACCENT[order.status]}`} />

        <div className="p-4 sm:px-5 sm:py-7 space-y-1 sm:space-y-2">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-400">{order.orderNumber}</p>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight line-clamp-2 mt-0.5">
                {order.items.length > 0
                  ? order.items.map((i) => i.title).join(", ")
                  : order.orderNumber}
              </h2>
              <p className="text-xs text-gray-500 mt-2">Placed on {formatDate(order.createdAt)}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* Media + meta + actions — single row on desktop; on mobile the thumbnails
              take their own row and the meta + Reorder share the row below. */}
          <div className="flex flex-wrap items-center gap-y-4 gap-x-3 sm:flex-nowrap sm:gap-0 border-t border-gray-300 pt-2 sm:pt-4">
            {/* Thumbnail strip — overlapping stack. Full row on mobile; fixed width on desktop
                (wider than the 4-thumb max) so the meta never sits flush and lines up across cards. */}
            <div className="flex items-center w-full sm:w-[290px] sm:shrink-0 sm:overflow-hidden">
              <div className="flex -space-x-3">
                {order.items.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className={`w-14 h-16 sm:w-16 sm:h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0 ring-2 ring-white shadow-sm ${item.image ? "" : "border border-gray-900"}`}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Package size={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {order.items.length > 4 && (
                <span className="ml-3 text-xs font-medium text-gray-500">+{order.items.length - 4} more</span>
              )}
            </div>

            {/* Item count + total — fills the left of the mobile row; pushes actions right on desktop */}
            <div className="flex flex-col flex-1 sm:flex-none sm:ml-20 sm:mr-auto">
              <span className="text-xs text-gray-500">
                {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
              </span>
              <span className="text-base sm:text-lg font-bold text-gray-900 leading-tight">{inr(order.total)}</span>
            </div>

            {/* Actions — far right on desktop; right of the meta on mobile */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Reorder — re-adds this order's items to the bag, then routes to /cart */}
              <button
                type="button"
                onClick={(e) => onReorder(e, order)}
                disabled={reorderingId === order.id}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white bg-brand-teal rounded-lg px-3 py-2.5 hover:bg-brand-teal/90 transition-colors shadow-sm shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {reorderingId === order.id ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</>
                ) : (
                  <><RotateCcw className="w-3.5 h-3.5" /> Reorder</>
                )}
              </button>
              <span className="hidden sm:flex items-center gap-1 text-sm font-semibold text-brand-teal border-[1.5px] border-brand-teal rounded-lg px-3 py-2.5 group-hover:gap-2 transition-all shrink-0">
                View details <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
