import { MessageSquare } from "lucide-react";
import CustomerReviewsSection from "./CustomerReviewsSection";
import type { OrderItem } from "@/lib/ordersApi";

interface OrderReviewsSectionProps {
  items: OrderItem[];
}

export default function OrderReviewsSection({ items }: OrderReviewsSectionProps) {
  return (
    <div className="rounded-2xl border border-gray-400 overflow-hidden shadow-xl ring-1 ring-black/10">
      {/* Accent strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />

      {/* Header — tinted band so the panel reads as its own surface */}
      <div className="p-4 sm:p-5 bg-gradient-to-br from-brand-teal/10 via-[#E8DDF7]/50 to-emerald-50 border-b border-[#B19CD9]/25">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-teal text-white shadow-sm shrink-0">
            <MessageSquare className="w-5 h-5" />
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Reviews</h2>
          {items.length > 0 && (
            <span className="ml-auto text-xs font-bold text-brand-teal bg-white border border-brand-teal/30 rounded-full px-2.5 py-1 shadow-sm">
              {items.length}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-1.5">Share your feedback on each product you ordered</p>
      </div>

      {/* Reviews for each product */}
      <div className="divide-y divide-gray-200">
        {items.map((item, idx) => (
          <div key={item.id} className="p-4 sm:p-5">
            {/* Product header */}
            <div className="flex gap-3 mb-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "/fallback-product.webp";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <MessageSquare size={20} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.title}</h3>
                {item.size && <p className="text-xs text-gray-500 mt-1">Size: {item.size}</p>}
              </div>
            </div>

            {/* Reviews for this product */}
            <CustomerReviewsSection
              productSlug={item.productSlug}
              categorySlug={item.categorySlug}
              title={item.title}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
