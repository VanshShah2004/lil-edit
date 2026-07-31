import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Package, ArrowUpDown, Search, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { fetchOrders, type OrderSummary } from "@/lib/ordersApi";
import OrderCard from "@/components/orders/OrderCard";
import StatCard from "@/components/StatCard";
import { type SortKey, SORT_OPTIONS, sortOrders } from "@/lib/ordersDisplay";

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

function matchesQuery(order: OrderSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (order.orderNumber.toLowerCase().includes(q)) return true;
  return order.items.some((item) => item.title.toLowerCase().includes(q));
}

const AllOrdersPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { reorder } = useCart();
  const navigate = useNavigate();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");

  const userId = user?.id ?? null;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOrders()
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[AllOrdersPage] fetch failed", err);
          setError(err instanceof Error ? err.message : "Could not load orders");
          setOrders([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((o) => matchesQuery(o, query));
    return sortOrders(filtered, sortBy);
  }, [orders, query, sortBy]);

  const totalItems = useMemo(() => orders.reduce((sum, o) => sum + o.itemCount, 0), [orders]);

  if (authLoading) {
    return <RouteFallback />;
  }

  const handleReorder = async (e: React.MouseEvent, order: OrderSummary) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderingId) return;
    setReorderingId(order.id);
    try {
      const { added, failed } = await reorder(
        order.items.map((it) => ({
          product_slug: it.productSlug,
          sku: it.sku,
          size: it.size,
          quantity: it.quantity,
        })),
      );
      if (added === 0) {
        toast.error("None of these items are available anymore.");
        return;
      }
      toast.success(
        failed > 0
          ? `Added ${added} item${added !== 1 ? "s" : ""} to your cart — ${failed} no longer available.`
          : "Added to your cart!",
      );
      navigate("/cart");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <Link to="/orders" className="hover:underline">Orders</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">All Orders</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16">
          {/* Everything below shares one centered column on desktop (65% of the
              section width — matches the card width on the main Orders page, which
              reserves a 35% sidebar), so the heading, controls, and list all line
              up and sit centered rather than pinned to the left. */}
          <div className="sm:max-w-[65%] sm:mx-auto">
            {/* Heading */}
            <div className="mb-2">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
                All Orders
                <Package className="w-6 h-6 sm:w-7 sm:h-7 text-brand-teal" />
              </h1>
            </div>

            {/* Summary stat cards */}
            {!loading && user && orders.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-4">
                <StatCard
                  icon={<Package className="w-5 h-5 text-white" />}
                  value={orders.length}
                  label="Orders placed"
                  accent="bg-brand-teal"
                />
                <StatCard
                  icon={<ShoppingCart className="w-5 h-5 text-white" fill="currentColor" />}
                  value={totalItems}
                  label="Items ordered"
                  accent="bg-[#B19CD9]"
                />
              </div>
            )}

            <hr className="relative left-1/2 w-screen -translate-x-1/2 h-1 border-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400 mt-4 mb-4" />

            {/* Search + sort controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by order number or product name"
                  className="w-full h-10 rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal/50"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {user && !loading && !error && orders.length > 1 && (
                <div className="flex justify-end sm:contents">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <SelectTrigger className="h-8 sm:h-10 w-auto gap-1.5 rounded-md sm:rounded-lg border-gray-400 sm:border-gray-300 bg-white px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:border-brand-teal/40 focus:ring-brand-teal/20 [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs sm:text-sm">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="sm:max-w-[65%] sm:mx-auto space-y-5 mt-6">
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
            ) : filteredOrders.length === 0 ? (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <Package size={48} className="text-brand-teal mb-4 opacity-40" />
                <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                  {query.trim() ? "No matching orders" : "No orders yet"}
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  {query.trim() ? "Try a different order number or product name." : "When you place an order, it'll show up here."}
                </p>
                {!query.trim() && (
                  <Link to="/" className="text-sm font-medium text-brand-teal underline underline-offset-2">Start shopping</Link>
                )}
              </div>
            ) : (
              filteredOrders.map((order) => (
                <OrderCard key={order.id} order={order} reorderingId={reorderingId} onReorder={handleReorder} />
              ))
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default AllOrdersPage;
