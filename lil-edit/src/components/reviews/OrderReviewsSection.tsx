import { MessageSquare } from "lucide-react";
import CustomerReviewsSection from "./CustomerReviewsSection";
import type { OrderItem } from "@/lib/ordersApi";

interface OrderReviewsSectionProps {
  items: OrderItem[];
}

export default function OrderReviewsSection({ items }: OrderReviewsSectionProps) {
  return (
    <div className="bg-white border border-gray-400 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/10">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-brand-teal" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Reviews</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">Share your feedback on each product you ordered</p>
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
