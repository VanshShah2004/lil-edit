import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, User, MapPin, Receipt, ShoppingBag, Save, History, Mail, Check } from "lucide-react";
import { toast } from "sonner";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAdminOrderById,
  updateOrderStatus,
  nextStatuses,
  type AdminOrderDetail,
  type OrderStatus,
} from "@/lib/adminOrdersApi";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/orders/OrderStatusBadge";
import OrderItemsTable from "@/components/admin/orders/OrderItemsTable";
import OrderSummaryCard from "@/components/admin/orders/OrderSummaryCard";
import OrderStatusTimeline from "@/components/admin/orders/OrderStatusTimeline";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ─── Reusable bits ────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: "#B19CD9" }} /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-gray-900 break-words ${mono ? "font-mono text-xs" : "font-medium"}`}>{value || "—"}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid lg:grid-cols-3 gap-6 animate-pulse">
      <div className="lg:col-span-2 space-y-6">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
      <div className="space-y-6">
        <div className="h-44 bg-gray-100 rounded-xl" />
        <div className="h-56 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}

const AdminOrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>("pending");
  const [note, setNote] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOrder = (id: string, withSpinner = true) => {
    if (withSpinner) setLoading(true);
    setError(null);
    console.log(`[AdminOrderDetail] fetch  id=${id}`);
    return fetchAdminOrderById(id)
      .then((data) => {
        setOrder(data);
        setSelectedStatus(data.status);
      })
      .catch((err) => {
        console.error("[AdminOrderDetail] fetch failed", err);
        setError(err instanceof Error ? err.message : "Could not load order");
        setOrder(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    setLoading(true);
    fetchAdminOrderById(orderId)
      .then((data) => { if (active) { setOrder(data); setSelectedStatus(data.status); } })
      .catch((err) => {
        if (!active) return;
        console.error("[AdminOrderDetail] fetch failed", err);
        setError(err instanceof Error ? err.message : "Could not load order");
        setOrder(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId]);

  const handleSave = async () => {
    if (!order || selectedStatus === order.status) return;
    setSaving(true);
    const previous = order.status;
    // Optimistic badge update.
    setOrder((prev) => (prev ? { ...prev, status: selectedStatus } : prev));
    try {
      await updateOrderStatus(order.id, selectedStatus, note);
      toast.success(`Order status updated to "${STATUS_LABELS[selectedStatus]}"`);
      setNote(""); // clear after it's been recorded with the change
      await loadOrder(order.id, false); // refresh from source of truth
    } catch (err) {
      console.error("[AdminOrderDetail] status update failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to update status");
      setOrder((prev) => (prev ? { ...prev, status: previous } : prev)); // rollback
      setSelectedStatus(previous);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const addr = order?.shippingAddress;
  const dirty = !!order && selectedStatus !== order.status;
  // Legal next statuses for this order (current first). A terminal order has no
  // moves left, so only its current status appears and the control locks.
  const statusOptions = order ? nextStatuses(order.status) : [];
  const terminal = statusOptions.length <= 1;

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      <div className="pt-[160px] md:pt-[128px] px-6 lg:px-12 bg-white border-b border-gray-100 pb-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex flex-wrap items-center text-xs text-gray-500 gap-1 mb-3">
            <Link to="/admin/orders" className="hover:underline">Order Management</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-800 font-medium font-mono">{order?.orderNumber ?? "Order"}</span>
          </div>
          <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Back to orders
          </Link>
        </div>
      </div>

      <main className="flex-1 px-6 lg:px-12 py-8">
        <div className="max-w-screen-2xl mx-auto">
          {loading ? (
            <DetailSkeleton />
          ) : error || !order ? (
            <div className="w-full py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <p className="text-lg font-semibold text-gray-800 mb-1">Order not found</p>
              <p className="text-sm text-gray-500 mb-6">{error ?? "This order doesn't exist."}</p>
              <Link to="/admin/orders" className="text-sm font-medium text-gray-900 underline underline-offset-2">View all orders</Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6 items-start">
              {/* ── Left column ──────────────────────────────────────────────── */}
              <div className="lg:col-span-2 space-y-6">
                {/* Order Information */}
                <SectionCard icon={Receipt} title="Order Information">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                    <Field label="Order ID" value={order.orderNumber} mono />
                    <Field label="Created Date" value={formatDateTime(order.createdAt)} />
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order Status</p>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Payment Status</p>
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                    <Field label="Payment Method" value={order.paymentMethod?.toUpperCase()} />
                    <Field label="Transaction ID" value={order.transactionId} mono />
                  </div>
                </SectionCard>

                {/* Customer Information */}
                <SectionCard icon={User} title="Customer Information">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                    <Field label="Customer Name" value={order.customer.name} />
                    <Field label="Email" value={order.customer.email} />
                    <Field label="Phone Number" value={order.customer.phone} />
                    <Field label="User ID" value={order.customer.userId} mono />
                  </div>
                </SectionCard>

                {/* Shipping Address */}
                <SectionCard icon={MapPin} title="Shipping Address">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                    <Field label="Full Name" value={addr?.fullName || order.customer.name} />
                    <Field label="Address Line 1" value={addr?.line1} />
                    <Field label="Address Line 2" value={addr?.line2} />
                    <Field label="City" value={addr?.city} />
                    <Field label="State" value={addr?.state} />
                    <Field label="Postal Code" value={addr?.pincode} />
                    <Field label="Country" value={addr?.country} />
                    <Field label="Phone Number" value={addr?.phone || order.customer.phone} />
                  </div>
                </SectionCard>

                {/* Ordered Products */}
                <SectionCard icon={ShoppingBag} title={`Ordered Products (${order.itemCount})`}>
                  <OrderItemsTable items={order.items} />
                </SectionCard>

                {/* Status History — immutable audit trail of every status change */}
                <SectionCard icon={History} title="Status History">
                  <OrderStatusTimeline
                    events={order.statusHistory ?? []}
                    onToggleNotify={() => setNotifyByEmail((v) => !v)}
                  />
                </SectionCard>
              </div>

              {/* ── Right column ─────────────────────────────────────────────── */}
              <div className="space-y-6 lg:sticky lg:top-[148px]">
                {/* Status Management */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4">Status Management</h2>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-600">Current</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Update status</label>
                  <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as OrderStatus)} disabled={terminal}>
                    <SelectTrigger className="mt-1.5 h-10 w-full border-gray-200 bg-gray-50/50 text-sm disabled:opacity-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm">{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {terminal && (
                    <p className="mt-2 text-xs text-gray-400">
                      This order is {STATUS_LABELS[order.status].toLowerCase()} — a final state. No further status changes are allowed.
                    </p>
                  )}

                  {/* Optional note/reminder recorded with this change and shown in the
                      Status History below (admin-only). */}
                  {!terminal && (
                    <div className="mt-4">
                      <label htmlFor="status-note" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Note / reminder <span className="font-medium normal-case text-gray-300">(optional)</span>
                      </label>
                      <Textarea
                        id="status-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        placeholder="e.g. Courier delayed — customer informed"
                        rows={2}
                        className="mt-1.5 resize-none border-gray-200 bg-gray-50/50 text-sm"
                      />
                      <p className="mt-1 text-right text-[10px] text-gray-300">{note.length}/500</p>
                    </div>
                  )}

                  {/* Notify the customer of this status change by email (wiring TBD).
                      Always shown in Status Management, regardless of order state. */}
                  <button
                    type="button"
                    onClick={() => setNotifyByEmail((v) => !v)}
                    aria-pressed={notifyByEmail}
                    className="mt-4 w-full inline-flex items-center justify-between gap-2 rounded-md bg-[#B19CD9] px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-[#9d86c9] transition-colors"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Notify customer via Gmail
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
                        notifyByEmail ? "border-gray-900 bg-gray-900 text-white" : "border-gray-900/40 bg-white"
                      }`}
                    >
                      {notifyByEmail && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 rounded-md px-4 py-2.5 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-gray-900 transition-colors"
                  >
                    <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>

                {/* Order Summary */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4">Order Summary</h2>
                  <OrderSummaryCard order={order} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AdminOrderDetailPage;
