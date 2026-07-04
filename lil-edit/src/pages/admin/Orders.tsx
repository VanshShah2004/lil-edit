import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, PackageX, Download, X } from "lucide-react";
import { toast } from "sonner";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAdminOrders, triggerAutoProcess, type AdminOrderSummary, type OrderSortKey } from "@/lib/adminOrdersApi";
import OrderFilters, { type StatusFilter, type PaymentFilter } from "@/components/admin/orders/OrderFilters";
import OrdersTable from "@/components/admin/orders/OrdersTable";

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

  // Bumped after the auto-process sweep transitions any orders, to re-trigger the
  // list fetch below so newly-processing orders show up without a manual refresh.
  const [autoProcessTick, setAutoProcessTick] = useState(0);

  const [showDateModal, setShowDateModal] = useState(false);
  const [downloadType, setDownloadType] = useState<"excel" | "pdf" | null>(null);
  const [dateRange, setDateRange] = useState<"all" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Debounce the search box so typing updates results "immediately" without a
  // request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // On mount, sweep any `confirmed` orders older than 10 minutes into `processing`
  // (mirrors the DB's scheduled auto-transition) so the table below reflects it
  // immediately even if pg_cron / the external scheduler hasn't run recently.
  useEffect(() => {
    let cancelled = false;
    triggerAutoProcess().then(({ transitioned }) => {
      if (!cancelled && transitioned > 0) {
        console.log(`[AdminOrders] auto-process transitioned ${transitioned} order(s) → refreshing list`);
        setAutoProcessTick((t) => t + 1);
      }
    });
    return () => { cancelled = true; };
  }, []);

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
  }, [search, status, payment, sort, page, autoProcessTick]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const getFilteredOrdersByDate = () => {
    if (dateRange === "all") return orders;
    if (!startDate || !endDate) return orders;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return orders.filter((o) => {
      const orderDate = new Date(o.createdAt);
      return orderDate >= start && orderDate <= end;
    });
  };

  const performDownloadExcel = () => {
    const filteredOrders = getFilteredOrdersByDate();
    if (filteredOrders.length === 0) {
      toast.error("No orders found for the selected date range");
      return;
    }

    const headers = ["Order ID", "Customer", "Email", "Date", "Total (₹)", "Items", "Payment Status", "Order Status"];
    const data = filteredOrders.map((o) => [
      o.orderNumber,
      o.customer.name,
      o.customer.email || "—",
      new Date(o.createdAt).toLocaleDateString("en-IN"),
      Math.round(o.total),
      o.itemCount,
      o.paymentStatus,
      o.status,
    ]);

    const csvContent = [
      headers.join("\t"),
      ...data.map((row) => row.join("\t")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/plain;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `orders-${new Date().toISOString().split("T")[0]}.xls`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloaded ${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""} as Excel`);
    setShowDateModal(false);
  };

  const performDownloadPdf = () => {
    const filteredOrders = getFilteredOrdersByDate();
    if (filteredOrders.length === 0) {
      toast.error("No orders found for the selected date range");
      return;
    }

    const rows = filteredOrders
      .map((o) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${o.orderNumber}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${o.customer.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${o.customer.email || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${Math.round(o.total).toLocaleString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${o.itemCount}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;"><span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#e0f2fe;color:#0369a1;">${o.paymentStatus}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;"><span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">${o.status}</span></td>
      </tr>`)
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Orders Report</title>
        <style>
          @page { size: auto; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #111;
            padding: 1.5cm 2cm;
            font-size: 12px;
            line-height: 1.6;
          }
          h1 { font-size: 20px; font-weight: 800; margin-bottom: 12px; }
          .meta { color: #999; font-size: 11px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th {
            background: #f8f8f8;
            padding: 10px 12px;
            text-align: left;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #666;
            border-bottom: 2px solid #111;
          }
          @media print {
            body { padding: 1.5cm 2cm; }
            th { background: #f8f8f8 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <h1>Order Management Report</h1>
        <div class="meta">
          Generated on ${new Date().toLocaleString("en-IN")}<br/>
          Total Orders: ${filteredOrders.length}
        </div>
        <table>
          <thead><tr>
            <th>Order ID</th>
            <th>Customer</th>
            <th>Email</th>
            <th>Date</th>
            <th style="text-align:right;">Total</th>
            <th style="text-align:center;">Items</th>
            <th>Payment</th>
            <th>Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
    toast.success(`Generated PDF for ${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""}`);
    setShowDateModal(false);
  };

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-2">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">Manage Orders</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>Operations</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Order Management</h1>
            <p className="text-sm text-gray-500">{total} order{total !== 1 ? "s" : ""} in the system</p>
          </div>
          <hr className="-mx-3 lg:-mx-6 border-t border-foreground/50" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 py-8">
        <div className="max-w-screen-2xl mx-auto space-y-6">
          <div className="flex justify-end gap-2 -mt-4">
            <button
              type="button"
              onClick={() => { setDownloadType("excel"); setShowDateModal(true); }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-green-600 rounded-md px-4 py-2.5 hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" /> Download XL
            </button>
            <button
              type="button"
              onClick={() => { setDownloadType("pdf"); setShowDateModal(true); }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-red-600 rounded-md px-4 py-2.5 hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>

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
              <PackageX size={44} className="text-gray-400 mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-1">Couldn't load orders</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="w-full py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <PackageX size={44} className="text-gray-400 mb-4" />
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

      {showDateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90%]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Select Date Range</h2>
              <button
                type="button"
                onClick={() => setShowDateModal(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-2">
                  <input
                    type="radio"
                    name="dateRange"
                    value="all"
                    checked={dateRange === "all"}
                    onChange={() => setDateRange("all")}
                    className="mr-2"
                  />
                  All Orders
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-2">
                  <input
                    type="radio"
                    name="dateRange"
                    value="custom"
                    checked={dateRange === "custom"}
                    onChange={() => setDateRange("custom")}
                    className="mr-2"
                  />
                  Custom Date Range
                </label>

                {dateRange === "custom" && (
                  <div className="space-y-3 mt-3 ml-6">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDateModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (dateRange === "custom" && (!startDate || !endDate)) {
                    toast.error("Please select both start and end dates");
                    return;
                  }
                  if (downloadType === "excel") performDownloadExcel();
                  else if (downloadType === "pdf") performDownloadPdf();
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default AdminOrdersPage;
