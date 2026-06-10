import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, User, MapPin, Receipt, ShoppingBag, Save, History, Mail, Check, CreditCard, Wallet, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo.png";

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
  updatePaymentStatus,
  nextStatuses,
  nextPaymentStatuses,
  SETTABLE_ORDER_STATUSES,
  SETTABLE_PAYMENT_STATUSES,
  ConflictError,
  type AdminOrderDetail,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/adminOrdersApi";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/orders/OrderStatusBadge";
import OrderItemsTable from "@/components/admin/orders/OrderItemsTable";
import OrderSummaryCard from "@/components/admin/orders/OrderSummaryCard";
import OrderStatusTimeline from "@/components/admin/orders/OrderStatusTimeline";
import PaymentStatusTimeline from "@/components/admin/orders/PaymentStatusTimeline";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
};

// ─── Reusable bits ────────────────────────────────────────────────────────────
// One titled segment inside an outer card — no border of its own; the parent
// rectangle draws the box and divides the segments.
function SectionCard({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 sm:p-6">
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
      <div className="lg:col-span-2 h-[32rem] bg-gray-100 rounded-xl" />
      <div className="space-y-6">
        <div className="h-80 bg-gray-100 rounded-xl" />
        <div className="h-44 bg-gray-100 rounded-xl" />
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
  // Correction mode: the escape hatch for a mistakenly-finalized (terminal) order.
  const [correcting, setCorrecting] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentStatus>("pending");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [correctingPayment, setCorrectingPayment] = useState(false);

  const loadOrder = (id: string, withSpinner = true) => {
    if (withSpinner) setLoading(true);
    setError(null);
    console.log(`[AdminOrderDetail] fetch  id=${id}`);
    return fetchAdminOrderById(id)
      .then((data) => {
        setOrder(data);
        setSelectedStatus(data.status);
        setSelectedPayment(data.paymentStatus);
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
      .then((data) => { if (active) { setOrder(data); setSelectedStatus(data.status); setSelectedPayment(data.paymentStatus); } })
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
    // Capture expected status BEFORE the optimistic update so the server can detect
    // if another admin changed the order between when this admin loaded the page and
    // when they clicked Save.
    const expectedStatus = order.status;
    const isCorrection = correcting;
    // Optimistic badge update.
    setOrder((prev) => (prev ? { ...prev, status: selectedStatus } : prev));
    try {
      await updateOrderStatus(order.id, selectedStatus, note, isCorrection, expectedStatus);
      toast.success(
        isCorrection
          ? `Order status corrected to "${STATUS_LABELS[selectedStatus]}"`
          : `Order status updated to "${STATUS_LABELS[selectedStatus]}"`,
      );
      setNote(""); // clear after it's been recorded with the change
      setCorrecting(false);
      await loadOrder(order.id, false); // refresh from source of truth
    } catch (err) {
      if (err instanceof ConflictError) {
        // Another admin saved first — roll back the optimistic update, reset
        // correction state, and reload so the dropdown shows the real current status.
        toast.warning("Order was updated by another admin — reloading…");
        setNote("");
        setCorrecting(false);
        setOrder((prev) => (prev ? { ...prev, status: previous } : prev));
        await loadOrder(order.id, false); // syncs selectedStatus to real current value
      } else {
        console.error("[AdminOrderDetail] status update failed", err);
        toast.error(err instanceof Error ? err.message : "Failed to update status");
        setOrder((prev) => (prev ? { ...prev, status: previous } : prev)); // rollback
        if (!isCorrection) setSelectedStatus(previous); // keep the chosen target so a correction can be retried
      }
    } finally {
      setSaving(false);
    }
  };

  // Enter correction mode: offer every settable status except the current (terminal)
  // one, and seed the dropdown with the first of them.
  const correctionOptions = order ? SETTABLE_ORDER_STATUSES.filter((s) => s !== order.status) : [];
  const startCorrection = () => {
    if (!correctionOptions.length) return;
    setCorrecting(true);
    setNote("");
    setSelectedStatus(correctionOptions[0]);
  };
  const cancelCorrection = () => {
    setCorrecting(false);
    setNote("");
    if (order) setSelectedStatus(order.status);
  };

  const handleSavePayment = async () => {
    if (!order || selectedPayment === order.paymentStatus) return;
    setSavingPayment(true);
    const previous = order.paymentStatus;
    // Capture expected payment status BEFORE the optimistic update.
    const expectedStatus = order.paymentStatus;
    const isCorrection = correctingPayment;
    // Optimistic badge update.
    setOrder((prev) => (prev ? { ...prev, paymentStatus: selectedPayment } : prev));
    try {
      await updatePaymentStatus(order.id, selectedPayment, paymentNote, isCorrection, expectedStatus);
      toast.success(
        isCorrection
          ? `Payment status corrected to "${PAYMENT_STATUS_LABELS[selectedPayment]}"`
          : `Payment status updated to "${PAYMENT_STATUS_LABELS[selectedPayment]}"`,
      );
      setPaymentNote(""); // clear after it's been recorded with the change
      setCorrectingPayment(false);
      await loadOrder(order.id, false); // refresh from source of truth
    } catch (err) {
      if (err instanceof ConflictError) {
        // Another admin saved first — roll back, reset correction state, reload.
        toast.warning("Payment status was updated by another admin — reloading…");
        setPaymentNote("");
        setCorrectingPayment(false);
        setOrder((prev) => (prev ? { ...prev, paymentStatus: previous } : prev));
        await loadOrder(order.id, false); // syncs selectedPayment to real current value
      } else {
        console.error("[AdminOrderDetail] payment status update failed", err);
        toast.error(err instanceof Error ? err.message : "Failed to update payment status");
        setOrder((prev) => (prev ? { ...prev, paymentStatus: previous } : prev)); // rollback
        if (!isCorrection) setSelectedPayment(previous); // keep the chosen target so a correction can be retried
      }
    } finally {
      setSavingPayment(false);
    }
  };

  // Payment correction (override) — offer every payment status except the current one.
  const paymentCorrectionOptions = order ? SETTABLE_PAYMENT_STATUSES.filter((s) => s !== order.paymentStatus) : [];
  const startPaymentCorrection = () => {
    if (!paymentCorrectionOptions.length) return;
    setCorrectingPayment(true);
    setPaymentNote("");
    setSelectedPayment(paymentCorrectionOptions[0]);
  };
  const cancelPaymentCorrection = () => {
    setCorrectingPayment(false);
    setPaymentNote("");
    if (order) setSelectedPayment(order.paymentStatus);
  };

  // Build a printable order sheet (same approach as the ManageProducts product
  // sheet): styled HTML in a new window, then window.print() → save as PDF.
  const handleDownloadPdf = () => {
    if (!order) return;
    const a = order.shippingAddress ?? {};

    const itemRows = order.items.map((it) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${it.image ? `<img src="${it.image}" style="width:36px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #eee;" alt="${it.title}" />` : ""}
            <div>
              <div style="font-weight:700;">${it.title}</div>
              <div style="color:#888;font-size:11px;">${[
                it.size ? `Size: ${it.size}` : "",
                it.color.name,
              ].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:11px;color:#888;">${it.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${it.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${inr(it.unitPrice)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;">${inr(it.lineTotal)}</td>
      </tr>`).join("");

    const historyRows = (
      events: { fromStatus: string | null; toStatus: string; changedByName: string; changedByEmail: string; note: string | null; isCorrection: boolean; createdAt: string }[],
      labels: Record<string, string>,
    ) => events.map((h) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
          ${h.fromStatus === null ? "Opening entry" : `${labels[h.fromStatus]} → ${labels[h.toStatus]}`}
          ${h.isCorrection ? `<span style="color:#b45309;font-weight:700;font-size:10px;"> (correction)</span>` : ""}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${h.changedByName || "System"}${h.changedByEmail ? `<span style="color:#999;font-size:11px;"> · ${h.changedByEmail}</span>` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#555;${h.note ? "font-style:italic;" : ""}">${h.note ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;white-space:nowrap;color:#888;">${formatDateTime(h.createdAt)}</td>
      </tr>`).join("");

    const statusRows = historyRows(order.statusHistory ?? [], STATUS_LABELS);
    const paymentRows = historyRows(order.paymentStatusHistory ?? [], PAYMENT_STATUS_LABELS);

    const formattedDateTime = new Date().toLocaleString("en-IN", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Order Sheet — ${order.orderNumber}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: auto;
            margin: 0;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #111;
            padding: 1.5cm 2cm;
            font-size: 13px;
            line-height: 1.6;
          }
          h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
          .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 3px; }
          .value { font-size: 12px; font-weight: 700; color: #111; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 32px; margin-bottom: 32px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f8f8f8; padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; }
          .status-badge {
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
            display: inline-block;
            background: #111;
            color: #fff;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 12px; color: #bbb; font-size: 10px; display: flex; justify-content: space-between; }
          @media print {
            body { padding: 1.5cm 2cm; }
            img { break-inside: avoid; }
            th {
              background: #f8f8f8 !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <!-- Row 1: Left-aligned Logo & Title -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
          <img src="${logo}" style="height:48px;width:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact;" alt="The Lil Edit Logo" />
          <span style="font-size:24px;font-weight:600;color:#111;font-family:'Playfair Display', Georgia, serif;letter-spacing:-0.2px;">The Lil Edit</span>
        </div>

        <!-- Row 2: Order Sheet Details & Status -->
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:28px;">
          <div style="text-align:left;">
            <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:4px;">Order Data Sheet</p>
            <h1 style="margin:0;">${order.orderNumber}</h1>
          </div>
          <div style="text-align:right;">
            <div class="label" style="margin-bottom:6px;">Status</div>
            <span class="status-badge">${STATUS_LABELS[order.status]}</span>
          </div>
        </div>

        <div class="section-title">Order Information</div>
        <div class="grid">
          <div><div class="label">Order ID</div><div class="value" style="font-family:monospace;">${order.orderNumber}</div></div>
          <div><div class="label">Created Date</div><div class="value">${formatDateTime(order.createdAt)}</div></div>
          <div><div class="label">Order Status</div><div class="value">${STATUS_LABELS[order.status]}</div></div>
          <div><div class="label">Payment Status</div><div class="value">${PAYMENT_STATUS_LABELS[order.paymentStatus]}</div></div>
          <div><div class="label">Payment Method</div><div class="value">${order.paymentMethod?.toUpperCase() ?? "—"}</div></div>
          <div><div class="label">Transaction ID</div><div class="value" style="font-family:monospace;">${order.transactionId ?? "—"}</div></div>
        </div>

        <div class="section-title">Customer Information</div>
        <div class="grid">
          <div><div class="label">Customer Name</div><div class="value">${order.customer.name}</div></div>
          <div><div class="label">Email</div><div class="value">${order.customer.email || "—"}</div></div>
          <div><div class="label">Phone Number</div><div class="value">${order.customer.phone || "—"}</div></div>
          <div><div class="label">User ID</div><div class="value" style="font-family:monospace;font-size:10px;">${order.customer.userId}</div></div>
        </div>

        <div class="section-title">Shipping Address</div>
        <div class="grid">
          <div><div class="label">Full Name</div><div class="value">${a.fullName || order.customer.name}</div></div>
          <div><div class="label">Address Line 1</div><div class="value">${a.line1 ?? "—"}</div></div>
          <div><div class="label">Address Line 2</div><div class="value">${a.line2 ?? "—"}</div></div>
          <div><div class="label">City</div><div class="value">${a.city ?? "—"}</div></div>
          <div><div class="label">State</div><div class="value">${a.state ?? "—"}</div></div>
          <div><div class="label">Postal Code</div><div class="value">${a.pincode ?? "—"}</div></div>
          <div><div class="label">Country</div><div class="value">${a.country ?? "—"}</div></div>
          <div><div class="label">Phone Number</div><div class="value">${a.phone || order.customer.phone || "—"}</div></div>
        </div>

        <div class="section-title">Ordered Products (${order.itemCount})</div>
        <table style="margin-bottom:32px;">
          <thead><tr><th>Product</th><th>SKU</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>

        <div class="section-title">Payment Summary</div>
        <table style="margin-bottom:32px;">
          <tbody>
            <tr><td style="padding:6px 12px;color:#888;border-bottom:1px solid #f0f0f0;">Subtotal</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0f0f0;">${inr(order.subtotal)}</td></tr>
            ${order.discount > 0 ? `<tr><td style="padding:6px 12px;color:#888;border-bottom:1px solid #f0f0f0;">Discount</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0f0f0;">−${inr(order.discount)}</td></tr>` : ""}
            <tr><td style="padding:6px 12px;color:#888;border-bottom:1px solid #f0f0f0;">Shipping</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0f0f0;">${order.shippingFee > 0 ? inr(order.shippingFee) : "Free"}</td></tr>
            ${order.tax > 0 ? `<tr><td style="padding:6px 12px;color:#888;border-bottom:1px solid #f0f0f0;">Tax</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0f0f0;">${inr(order.tax)}</td></tr>` : ""}
            <tr><td style="padding:8px 12px;font-weight:800;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:800;">${inr(order.total)}</td></tr>
          </tbody>
        </table>

        ${statusRows ? `
        <div class="section-title">Status History</div>
        <table style="margin-bottom:32px;">
          <thead><tr><th>Change</th><th>By</th><th>Note</th><th>When</th></tr></thead>
          <tbody>${statusRows}</tbody>
        </table>` : ""}

        ${paymentRows ? `
        <div class="section-title">Payment History</div>
        <table style="margin-bottom:32px;">
          <thead><tr><th>Change</th><th>By</th><th>Note</th><th>When</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>` : ""}

        <div class="footer">
          <span>The Lil Edit — Order Management</span>
          <span>Generated: ${formattedDateTime}</span>
        </div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
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
  // Same idea for payment: legal next states (current first); `refunded` is terminal.
  const paymentDirty = !!order && selectedPayment !== order.paymentStatus;
  const paymentOptions = order ? nextPaymentStatuses(order.paymentStatus) : [];
  const paymentTerminal = paymentOptions.length <= 1;

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to orders
            </Link>
            {order && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gray-900 rounded-md px-4 py-2 hover:bg-gray-800 transition-colors"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
            )}
          </div>
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
              {/* ── Left column: ONE rectangle holding every order-detail section,
                     separated by dividers (no nested boxes) ─────────────────────── */}
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
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

                {/* Payment History — immutable audit trail of every payment change */}
                <SectionCard icon={CreditCard} title="Payment History">
                  <PaymentStatusTimeline events={order.paymentStatusHistory ?? []} />
                </SectionCard>
              </div>

              {/* ── Right column ─────────────────────────────────────────────── */}
              <div className="space-y-6 lg:sticky lg:top-[148px]">
                {/* Status + Payment Management — ONE rectangle, two divided sections */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
                {/* Status Management */}
                <div className="p-5 sm:p-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4">Status Management</h2>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-600">Current</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {correcting ? "Correct status to" : "Update status"}
                  </label>
                  {correcting ? (
                    // Button group instead of a dropdown — pick the corrected status directly.
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {correctionOptions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedStatus(s)}
                          aria-pressed={selectedStatus === s}
                          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                            selectedStatus === s
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-gray-50/50 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  ) : (
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
                  )}

                  {/* Correction / backpedal escape hatch — available in EVERY state so an
                      admin can undo a mistaken status. The normal flow is forward-only and
                      terminal states can't move at all, so this is the only way back. For a
                      terminal order it also explains the lock. */}
                  {!correcting && (
                    <div className="mt-2">
                      {terminal && (
                        <p className="text-xs text-gray-400">
                          This order is {STATUS_LABELS[order.status].toLowerCase()} — a final state. No further status changes are allowed in the normal flow.
                        </p>
                      )}
                      <div className="mt-2 flex justify-start">
                        <button
                          type="button"
                          onClick={startCorrection}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                        >
                          <AlertTriangle className="h-3 w-3" /> Correct status
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Correction warning — overriding the normal flow is deliberately
                      friction-y and requires a note; it's logged as a correction. */}
                  {correcting && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Correcting the order status
                      </p>
                      <p className="mt-1 text-amber-700">
                        This overrides the normal flow to fix a mistaken status (currently “{STATUS_LABELS[order.status].toLowerCase()}”), including moving backward. It's recorded as a correction in the status history.
                      </p>
                    </div>
                  )}

                  {/* Note — optional for a normal change, required for a correction. */}
                  {(!terminal || correcting) && (
                    <div className="mt-4">
                      <label htmlFor="status-note" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Note / reminder <span className="font-medium normal-case text-gray-300">(optional)</span>
                      </label>
                      <Textarea
                        id="status-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        placeholder={correcting ? "e.g. Marked delivered by mistake — order is still in transit" : "e.g. Courier delayed — customer informed"}
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

                  {correcting ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={cancelCorrection}
                        disabled={saving}
                        className="flex-1 inline-flex items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-md px-4 py-2.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-amber-600 rounded-md px-4 py-2.5 hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600 transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4" /> {saving ? "Saving…" : "Save correction"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!dirty || saving}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 rounded-md px-4 py-2.5 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-gray-900 transition-colors"
                    >
                      <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Changes"}
                    </button>
                  )}
                </div>

                {/* Payment Management */}
                <div className="p-5 sm:p-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4" style={{ color: "#B19CD9" }} /> Payment Management
                  </h2>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-600">Current</span>
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {correctingPayment ? "Correct payment status to" : "Update payment status"}
                  </label>
                  {correctingPayment ? (
                    // Button group instead of a dropdown — pick the corrected status directly.
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {paymentCorrectionOptions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedPayment(s)}
                          aria-pressed={selectedPayment === s}
                          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                            selectedPayment === s
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-gray-50/50 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {PAYMENT_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Select value={selectedPayment} onValueChange={(v) => setSelectedPayment(v as PaymentStatus)} disabled={paymentTerminal}>
                      <SelectTrigger className="mt-1.5 h-10 w-full border-gray-200 bg-gray-50/50 text-sm disabled:opacity-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentOptions.map((s) => (
                          <SelectItem key={s} value={s} className="text-sm">{PAYMENT_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Correction / backpedal escape hatch — available in EVERY payment state
                      so an admin can fix a mistaken payment status. */}
                  {!correctingPayment && (
                    <div className="mt-2">
                      {paymentTerminal && (
                        <p className="text-xs text-gray-400">
                          This payment is {PAYMENT_STATUS_LABELS[order.paymentStatus].toLowerCase()} — a final state. No further payment changes are allowed in the normal flow.
                        </p>
                      )}
                      <div className="mt-2 flex justify-start">
                        <button
                          type="button"
                          onClick={startPaymentCorrection}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                        >
                          <AlertTriangle className="h-3 w-3" /> Correct status
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Correction warning — overriding the normal flow is logged as a correction. */}
                  {correctingPayment && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Correcting the payment status
                      </p>
                      <p className="mt-1 text-amber-700">
                        This overrides the normal flow to fix a mistaken payment status (currently “{PAYMENT_STATUS_LABELS[order.paymentStatus].toLowerCase()}”). It's recorded as a correction in the payment history.
                      </p>
                    </div>
                  )}

                  {/* Note — optional for a normal change or a correction. */}
                  {(!paymentTerminal || correctingPayment) && (
                    <div className="mt-4">
                      <label htmlFor="payment-note" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Note / reminder <span className="font-medium normal-case text-gray-300">(optional)</span>
                      </label>
                      <Textarea
                        id="payment-note"
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value.slice(0, 500))}
                        placeholder="e.g. Refund processed via Razorpay — ref #RZP123"
                        rows={2}
                        className="mt-1.5 resize-none border-gray-200 bg-gray-50/50 text-sm"
                      />
                      <p className="mt-1 text-right text-[10px] text-gray-300">{paymentNote.length}/500</p>
                    </div>
                  )}

                  {correctingPayment ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={cancelPaymentCorrection}
                        disabled={savingPayment}
                        className="flex-1 inline-flex items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-md px-4 py-2.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSavePayment}
                        disabled={!paymentDirty || savingPayment}
                        className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-amber-600 rounded-md px-4 py-2.5 hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600 transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4" /> {savingPayment ? "Saving…" : "Save correction"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSavePayment}
                      disabled={!paymentDirty || savingPayment}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 rounded-md px-4 py-2.5 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-gray-900 transition-colors"
                    >
                      <CreditCard className="w-4 h-4" /> {savingPayment ? "Saving…" : "Save Payment"}
                    </button>
                  )}
                </div>
                </div>

                {/* Order Summary — its own rectangle, last */}
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
