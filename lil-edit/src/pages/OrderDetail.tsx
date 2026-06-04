import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Package, MapPin, ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrderById, type OrderDetail, type OrderStatus } from "@/lib/ordersApi";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:    "bg-amber-50 text-amber-700 border-amber-200",
  confirmed:  "bg-sky-50 text-sky-700 border-sky-200",
  processing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped:    "bg-purple-50 text-purple-700 border-purple-200",
  delivered:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:  "bg-rose-50 text-rose-700 border-rose-200",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function DetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 bg-gray-200 rounded-xl" />
      <div className="h-48 bg-gray-200 rounded-xl" />
      <div className="h-40 bg-gray-200 rounded-xl" />
    </div>
  );
}

const OrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !orderId) {
      // Reset to the logged-out state — syncing to external auth state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrder(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    console.log(`[OrderDetailPage] fetching order  id=${orderId}  user=${userId}`);
    setLoading(true);
    setError(null);
    fetchOrderById(orderId)
      .then((data) => { if (!cancelled) setOrder(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[OrderDetailPage] fetch failed", err);
          setError(err instanceof Error ? err.message : "Could not load order");
          setOrder(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, orderId]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const addr = order?.shippingAddress;
  const addrLine = addr
    ? [addr.line1, addr.line2, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-1 pb-6">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link to="/orders" className="hover:underline">Orders</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">{order?.orderNumber ?? "Order"}</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16">
          <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-brand-teal mb-5">
            <ArrowLeft className="w-4 h-4" /> Back to orders
          </Link>

          {loading ? (
            <DetailSkeleton />
          ) : !user ? (
            <div className="w-full py-16 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <Package size={48} className="text-brand-teal mb-4 opacity-40" />
              <p className="text-lg font-semibold text-gray-800 mb-2">Log in to view this order</p>
              <Link to="/login" className="text-sm font-medium text-brand-teal underline underline-offset-2">Log in</Link>
            </div>
          ) : error || !order ? (
            <div className="w-full py-16 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <p className="text-lg font-semibold text-gray-800 mb-2">Order not found</p>
              <p className="text-sm text-gray-500 mb-6">{error ?? "This order doesn't exist or isn't yours."}</p>
              <Link to="/orders" className="text-sm font-medium text-brand-teal underline underline-offset-2">View all orders</Link>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary header */}
              <Card className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">Placed on {formatDate(order.createdAt)}</p>
                  </div>
                  <span className={`text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[order.status]}`}>
                    {order.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs sm:text-sm text-gray-600">
                  <span>Payment: <span className="font-medium text-gray-800 uppercase">{order.paymentMethod}</span></span>
                  <span>Payment status: <span className="font-medium text-gray-800 capitalize">{order.paymentStatus}</span></span>
                </div>
              </Card>

              {/* Items */}
              <Card className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
                  Items ({order.itemCount})
                </h2>
                <div className="divide-y divide-gray-100">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex gap-3 sm:gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            loading="lazy"
                            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Package size={22} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-gray-900 line-clamp-2">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                          {item.size && <span>Size: {item.size}</span>}
                          {item.color.name && (
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: item.color.hex }} />
                              {item.color.name}
                            </span>
                          )}
                          <span>Qty: {item.quantity}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm sm:text-base font-bold text-gray-900">{inr(item.lineTotal)}</p>
                        {item.quantity > 1 && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{inr(item.unitPrice)} each</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Shipping address */}
              {addrLine && (
                <Card className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-brand-teal" /> Shipping Address
                  </h2>
                  {addr?.label && <p className="text-sm font-medium text-gray-800 mb-0.5">{addr.label}</p>}
                  <p className="text-sm text-gray-600 leading-relaxed">{addrLine}</p>
                  {addr?.country && <p className="text-sm text-gray-600">{addr.country}</p>}
                </Card>
              )}

              {/* Totals */}
              <Card className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Payment Summary</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span><span>{inr(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span><span>−{inr(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span>{order.shippingFee > 0 ? inr(order.shippingFee) : "Free"}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-3 mt-1">
                    <span className="text-base font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-brand-teal">{inr(order.total)}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default OrderDetailPage;
