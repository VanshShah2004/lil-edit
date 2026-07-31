// Static preview of the order status-change email (backend/lib/orderEmail.ts,
// buildStatusEmail). Renders dummy data for each status through the same markup/inline
// styles as the real HTML email so admins can eyeball it without triggering a real send.
import { useState } from "react";
import EmailPreviewShell from "@/components/admin/EmailPreviewShell";
import logo from "@/assets/logo.png";

// Orders start at "confirmed" — "pending" is not a reachable order status (see
// 20260707_remove_pending_order_status.sql and lil-edit/src/lib/adminOrdersApi.ts).
const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BLURB: Record<string, string> = {
  confirmed: "Your order has been confirmed and will be prepared shortly.",
  processing: "Good news — we're preparing your order for shipment.",
  shipped: "Your order is on its way!",
  delivered: "Your order has been delivered. We hope you love it!",
  cancelled: "Your order has been cancelled. If this is unexpected, please reach out to us.",
};

const STATUSES = Object.keys(STATUS_LABELS);

// Canonical journey shown in the email — cancelled is off-path and handled separately
// (mirrors lil-edit/src/components/orders/OrderTimeline.tsx's STEPS/STEP_INDEX).
const JOURNEY = ["confirmed", "processing", "shipped", "delivered"];
const JOURNEY_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
};

const order = { orderNumber: "LE-10482", recipientName: "Vansh Shah" };

// Dummy timestamp per journey step, each a day apart, for the preview only.
const JOURNEY_STAMPS: Record<string, string> = {
  confirmed: "3 Jul, 10:14 AM",
  processing: "4 Jul, 3:40 PM",
  shipped: "5 Jul, 11:05 AM",
  delivered: "6 Jul, 2:20 PM",
  cancelled: "4 Jul, 6:00 PM",
};

// Status-history steps for the current preview status: only steps reached SO FAR are
// shown (no greyed-out upcoming steps) — cancelled shows the reached steps then a
// terminal Cancelled step, matching the customer-facing Order Journey on the site.
function buildHistorySteps(status: string): Array<{ label: string; stamp: string; current: boolean; cancelled?: boolean }> {
  if (status === "cancelled") {
    return [
      { label: JOURNEY_LABELS.confirmed, stamp: JOURNEY_STAMPS.confirmed, current: false },
      { label: "Cancelled", stamp: JOURNEY_STAMPS.cancelled, current: true, cancelled: true },
    ];
  }
  const idx = JOURNEY.indexOf(status);
  return JOURNEY.slice(0, idx + 1).map((s, i) => ({ label: JOURNEY_LABELS[s], stamp: JOURNEY_STAMPS[s], current: i === idx }));
}

// The email card itself — identical markup for both mobile and desktop views (matches the
// real HTML email 1:1). Only the surrounding device frame differs between the two.
const EmailCard = ({ maxWidth, label, blurb, status }: { maxWidth?: number; label: string; blurb: string; status: string }) => (
  <div style={{ maxWidth: maxWidth ?? "100%", width: maxWidth ? undefined : "100%", margin: "0 auto", background: "#ffffff", overflow: "hidden", border: "1px solid #eeeeee" }}>
    <div style={{ background: "#B19CD9", padding: "24px 32px", display: "flex", alignItems: "center", gap: 10 }}>
      <img src={logo} alt="" style={{ height: 48, width: "auto", display: "block" }} />
      <div style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 22, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-0.2px" }}>
        The Lil Edit
      </div>
    </div>
    <div style={{ padding: 32 }}>
      <p style={{ fontSize: 15, color: "#333333", margin: "0 0 16px" }}>Hi {order.recipientName},</p>
      <p style={{ fontSize: 15, color: "#333333", margin: "0 0 24px", lineHeight: 1.6 }}>{blurb}</p>

      <div style={{ textAlign: "center", margin: "0 0 24px" }}>
        <span
          style={{
            display: "inline-block",
            background: "#1a1a1a",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "8px 18px",
            borderRadius: 4,
          }}
        >
          {label}
        </span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 24px" }}>
        <tbody>
          <tr>
            <td
              style={{
                fontSize: 12,
                color: "#999999",
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "8px 0",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              Order
            </td>
            <td
              style={{
                fontSize: 14,
                color: "#1a1a1a",
                fontWeight: 700,
                textAlign: "right",
                padding: "8px 0",
                borderBottom: "1px solid #f0f0f0",
                fontFamily: "monospace",
              }}
            >
              {order.orderNumber}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ margin: "0 0 24px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999999", fontWeight: 700, marginBottom: 14 }}>
          Order Status
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            <tr>
              {buildHistorySteps(status).map((step, i, arr) => (
                <td key={step.label} style={{ padding: 0, textAlign: "center", verticalAlign: "top", width: `${100 / arr.length}%` }}>
                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : step.cancelled ? "#f3b0bf" : "#99cfc8" }} />
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        minWidth: 11,
                        borderRadius: "50%",
                        background: step.cancelled ? "#e11d48" : "#0F766E",
                        display: "block",
                      }}
                    />
                    <div style={{ flex: 1, height: 2, background: i === arr.length - 1 ? "transparent" : "#99cfc8" }} />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: step.current ? 700 : 500,
                      color: step.cancelled ? "#e11d48" : "#1a1a1a",
                    }}
                  >
                    {step.label}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "#999999" }}>{step.stamp}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: "center", margin: "8px 0 4px" }}>
        <span
          style={{
            display: "inline-block",
            background: "#0F766E",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: 4,
          }}
        >
          View your order
        </span>
      </div>
    </div>
    <div style={{ padding: "18px 20px", background: "#000000", color: "#ffffff", fontSize: 12, lineHeight: 1.5, textAlign: "center", borderRadius: 0, width: "100%", boxSizing: "border-box" }}>
      The Lil Edit · Curated fashion for little ones
    </div>
  </div>
);

const StatusChangePreview = () => {
  const [status, setStatus] = useState("shipped");
  const label = STATUS_LABELS[status];
  const blurb = STATUS_BLURB[status];
  const subjectLine = `Your order ${order.orderNumber} is now ${label}! 💜`;

  // Status picker — drives which status the previewed email reflects.
  const statusTabs = (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => setStatus(s)}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
            status === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
          }`}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );

  return (
    <EmailPreviewShell
      title="Order Status Change"
      subtitle="The update sent when an order moves to processing, shipped, delivered or cancelled."
      subject={subjectLine}
      controls={statusTabs}
    >
      {(view) => <EmailCard maxWidth={view === "mobile" ? 380 : undefined} label={label} blurb={blurb} status={status} />}
    </EmailPreviewShell>
  );
};

export default StatusChangePreview;
