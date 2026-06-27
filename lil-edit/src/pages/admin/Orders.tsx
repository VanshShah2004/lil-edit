import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, PackageX } from "lucide-react";
import { toast } from "sonner";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAdminOrders, type AdminOrderSummary, type OrderSortKey } from "@/lib/adminOrdersApi";
import OrderFilters, { type StatusFilter, type PaymentFilter } from "@/components/admin/orders/OrderFilters";
import OrdersTable from "@/components/admin/orders/OrdersTable";
import AdminSubNav from "@/components/admin/AdminSubNav";

const PAGE_SIZE = 20;

function TableSkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="h-11 bg-gray-50 border-b border-gray-200" />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-200 rounded w-40 hidden lg:block" />
          <div className="h-3 bg-gray-200 rounded w-20 ml-auto" />
          <div className="h-6 bg-gray-200 rounded-full w-20" />
        </div>
      ))}
    </div>
  );
}

const AdminOrdersPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [sort, setSort] = useState<OrderSortKey>("newest");
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box so typing updates results "immediately" without a
  // request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    console.log(`[AdminOrders] fetch  page=${page} search="${search}" status=${status} pay=${payment} sort=${sort}`);
    fetchAdminOrders({ search, status, paymentStatus: payment, sort, page, limit: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setOrders(data.orders);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[AdminOrders] fetch failed", err);
        const msg = err instanceof Error ? err.message : "Could not load orders";
        setError(msg);
        toast.error(msg);
        setOrders([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, status, payment, sort, page]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Page header — matches the Catalog Studio admin header. */}
      <div className="relative pt-[160px] md:pt-[128px] bg-white border-b border-gray-300 pb-8">
        <AdminSubNav />
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 space-y-1">
          <div className="flex items-center min-h-[36px] sm:min-h-[46px]">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>Operations</p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 pt-[10px] md:pt-0">Order Management</h1>
          <p className="text-sm text-gray-500">{total} order{total !== 1 ? "s" : ""} in the system</p>
        </div>
      </div>

      <main className="flex-1 px-6 lg:px-12 py-8">
        <div className="max-w-screen-2xl mx-auto space-y-6">
          <OrderFilters
            search={searchInput}
            status={status}
            payment={payment}
            sort={sort}
            // Any filter/sort/search change resets to page 1 so results start from the top.
            onSearchChange={(v) => { setSearchInput(v); setPage(1); }}
            onStatusChange={(v) => { setStatus(v); setPage(1); }}
            onPaymentChange={(v) => { setPayment(v); setPage(1); }}
            onSortChange={(v) => { setSort(v); setPage(1); }}
          />

          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <div className="w-full py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <PackageX size={44} className="text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-1">Couldn't load orders</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="w-full py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <PackageX size={44} className="text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-1">No orders found</p>
              <p className="text-sm text-gray-500">
                {search || status !== "all" || payment !== "all"
                  ? "Try adjusting your search or filters."
                  : "Orders will appear here once customers start placing them."}
              </p>
            </div>
          ) : (
            <>
              <OrdersTable orders={orders} onView={(id) => navigate(`/admin/orders/${id}`)} />

              {/* Pagination */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <p className="text-xs text-gray-500">
                  Showing <span className="font-semibold text-gray-700">{rangeStart}–{rangeEnd}</span> of{" "}
                  <span className="font-semibold text-gray-700">{total}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-3 py-2 hover:border-gray-900 disabled:opacity-40 disabled:hover:border-gray-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <span className="text-xs text-gray-500 px-1">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-3 py-2 hover:border-gray-900 disabled:opacity-40 disabled:hover:border-gray-200 transition-colors"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AdminOrdersPage;
