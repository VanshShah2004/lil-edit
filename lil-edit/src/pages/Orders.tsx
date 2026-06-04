import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Package, ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrders, type OrderStatus, type OrderSummary } from "@/lib/ordersApi";

// Status → badge colours. Keys match the DB status CHECK constraint.
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

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((n) => (
        <div key={n} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex justify-between">
              <div className="h-5 bg-gray-200 rounded w-40" />
              <div className="h-6 bg-gray-200 rounded-full w-24" />
            </div>
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-16 h-16 bg-gray-200 rounded-lg" />
              ))}
            </div>
            <div className="h-9 bg-gray-200 rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

const OrdersPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      // Reset to the logged-out state — syncing to external auth state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    console.log(`[OrdersPage] fetching orders  user=${userId}`);
    setLoading(true);
    setError(null);
    fetchOrders()
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[OrdersPage] fetch failed", err);
          setError(err instanceof Error ? err.message : "Could not load orders");
          setOrders([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-1 pb-6">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">Your Orders</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16 space-y-5">
          {/* Heading */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
              Your Orders
              <Package className="w-6 h-6 sm:w-7 sm:h-7 text-brand-teal" />
            </h1>
            <p className="text-sm text-gray-500 mt-1">{orders.length} order{orders.length !== 1 ? "s" : ""} placed</p>
          </div>

          {loading ? (
            <OrdersSkeleton />
          ) : !user ? (
            <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <Package size={48} className="text-brand-teal mb-4 opacity-40" />
              <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">Track your orders</p>
              <p className="text-sm text-gray-500 mb-6">Log in to view your order history.</p>
              <Link to="/login" className="text-sm font-medium text-brand-teal underline underline-offset-2">Log in</Link>
            </div>
          ) : error ? (
            <div className="w-full py-16 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <p className="text-lg font-semibold text-gray-800 mb-2">Couldn't load your orders</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <Package size={48} className="text-brand-teal mb-4 opacity-40" />
              <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">No orders yet</p>
              <p className="text-sm text-gray-500 mb-6">When you place an order, it'll show up here.</p>
              <Link to="/dashboard" className="text-sm font-medium text-brand-teal underline underline-offset-2">Start shopping</Link>
            </div>
          ) : (
            orders.map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="block group">
                <Card className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:border-brand-teal/30 transition-all duration-300">
                  <div className="p-4 sm:p-5 space-y-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm sm:text-base font-bold text-gray-900">{order.orderNumber}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Placed on {formatDate(order.createdAt)}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    {/* Thumbnail strip */}
                    <div className="flex items-center gap-2.5">
                      {order.items.slice(0, 4).map((item) => (
                        <div key={item.id} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
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
                              <Package size={20} />
                            </div>
                          )}
                        </div>
                      ))}
                      {order.items.length > 4 && (
                        <span className="text-xs font-medium text-gray-500">+{order.items.length - 4} more</span>
                      )}
                    </div>

                    {/* Footer row */}
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-xs sm:text-sm text-gray-500">
                        {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · Total{" "}
                        <span className="font-bold text-gray-900">{inr(order.total)}</span>
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-brand-teal group-hover:gap-2 transition-all">
                        View details <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default OrdersPage;
