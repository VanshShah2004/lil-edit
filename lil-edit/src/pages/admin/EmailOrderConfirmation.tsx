// Static preview of the order-confirmation email (backend/lib/orderEmail.ts,
// buildConfirmationEmail). Renders dummy data through the same markup/inline-styles as
// the real HTML email so admins can eyeball it without triggering a real send.
import EmailPreviewShell from "@/components/admin/EmailPreviewShell";
import logo from "@/assets/logo.png";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const order = {
  orderNumber: "LE-10482",
  recipientName: "Vansh Shah",
  placedAt: "6 July 2026",
  items: [
    {
      title: "Floral Cotton Frock",
      size: "3Y",
      colorName: "Pink",
      quantity: 1,
      unitPrice: 1299,
      lineTotal: 1299,
      imageUrl: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=100&h=100&fit=crop",
    },
    {
      title: "Denim Dungaree Set",
      size: "4Y",
      colorName: "Blue",
      quantity: 2,
      unitPrice: 1599,
      lineTotal: 3198,
      imageUrl: "https://images.unsplash.com/photo-1519457851591-f9e4c7807aa7?w=100&h=100&fit=crop",
    },
  ],
  subtotal: 4497,
  discount: 450,
  couponCode: "FIRST10",
  shippingFee: 0,
  total: 4047,
  address: {
    line1: "1302, Akruti Aditya Tower",
    line2: "Grant Road",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    pincode: "400007",
  },
};

const totalsRows: Array<{ label: string; value: string; strong?: boolean; green?: boolean }> = [
  { label: "Subtotal", value: inr(order.subtotal) },
  ...(order.discount > 0 ? [{ label: `COUPON${order.couponCode ? ` (${order.couponCode})` : ""}`, value: `- ${inr(order.discount)}`, green: true }] : []),
  { label: "Delivery", value: order.shippingFee > 0 ? inr(order.shippingFee) : "Free" },
  { label: "Total", value: inr(order.total), strong: true },
];

// The email card itself — identical markup for both mobile and desktop views (matches the
// real HTML email 1:1). Only the surrounding device frame differs between the two.
const EmailCard = ({ maxWidth }: { maxWidth?: number }) => (
  <div style={{ maxWidth: maxWidth ?? "100%", width: maxWidth ? undefined : "100%", margin: "0 auto", background: "#ffffff", overflow: "hidden", border: "1px solid #eeeeee" }}>
    <div style={{ background: "#B19CD9", padding: "24px 32px", display: "flex", alignItems: "center", gap: 10 }}>
      <img src={logo} alt="" style={{ height: 48, width: "auto", display: "block" }} />
      <div style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 22, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-0.2px" }}>
        The Lil Edit
      </div>
    </div>
    <div style={{ padding: 32 }}>
      <p style={{ fontSize: 15, color: "#333333", margin: "0 0 16px" }}>Hi {order.recipientName},</p>
      <p style={{ fontSize: 15, color: "#333333", margin: "0 0 24px", lineHeight: 1.6 }}>
        Thank you for your order — it's confirmed and we're getting it ready. Here's your receipt.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 8px" }}>
        <tbody>
          <tr>
            <td style={{ fontSize: 12, color: "#999999", textTransform: "uppercase", letterSpacing: 1, padding: "0 0 4px" }}>Order</td>
            <td style={{ fontSize: 14, color: "#1a1a1a", fontWeight: 700, textAlign: "right", padding: "0 0 4px", fontFamily: "monospace" }}>
              {order.orderNumber}
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: 12, color: "#999999", textTransform: "uppercase", letterSpacing: 1, padding: 0 }}>Placed</td>
            <td style={{ fontSize: 13, color: "#666666", textAlign: "right", padding: 0 }}>{order.placedAt}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0 0" }}>
        <tbody>
          {order.items.map((it) => {
            const meta = [it.size, it.colorName].filter(Boolean).join(" · ");
            return (
              <tr key={it.title}>
                <td width={56} style={{ padding: "12px 12px 12px 0", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                  <img
                    src={it.imageUrl}
                    width={44}
                    height={44}
                    alt=""
                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, border: "1px solid #eeeeee", display: "block" }}
                  />
                </td>
                <td style={{ padding: "12px 0", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                  <div style={{ fontSize: 14, color: "#1a1a1a", fontWeight: 600, lineHeight: 1.3 }}>{it.title}</div>
                  {meta && <div style={{ fontSize: 12, color: "#999999", marginTop: 3 }}>{meta}</div>}
                  <div style={{ fontSize: 12, color: "#999999", marginTop: 3 }}>
                    Qty {it.quantity} · {inr(it.unitPrice)} each
                  </div>
                </td>
                <td
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #f3f3f3",
                    textAlign: "right",
                    verticalAlign: "top",
                    fontSize: 14,
                    color: "#1a1a1a",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.quantity} × {inr(it.unitPrice)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0 0" }}>
        <tbody>
          {totalsRows.map((row) => (
            <tr key={row.label}>
              <td
                style={{
                  padding: "6px 0",
                  fontSize: row.strong ? 15 : 13,
                  color: row.strong ? "#1a1a1a" : row.green ? "#16a34a" : "#666666",
                  borderTop: row.strong ? "2px solid #1a1a1a" : undefined,
                  paddingTop: row.strong ? 12 : undefined,
                  fontWeight: row.strong ? 700 : undefined,
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: "6px 0",
                  fontSize: row.strong ? 15 : 13,
                  color: row.strong ? "#1a1a1a" : row.green ? "#16a34a" : "#666666",
                  borderTop: row.strong ? "2px solid #1a1a1a" : undefined,
                  paddingTop: row.strong ? 12 : undefined,
                  textAlign: "right",
                  fontWeight: row.strong ? 700 : row.green ? 600 : 500,
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ margin: "28px 0 0" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999999", fontWeight: 700, marginBottom: 8 }}>
          Shipping to
        </div>
        <div style={{ fontSize: 13, color: "#444444", lineHeight: 1.7 }}>
          {order.recipientName}
          <br />
          {order.address.line1}
          <br />
          {order.address.line2}
          <br />
          {order.address.city}, {order.address.state} {order.address.pincode}
          <br />
          {order.address.country}
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "28px 0 4px" }}>
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

const EmailOrderConfirmationPreview = () => {
  const subjectLine = `🎉 Your Order ${order.orderNumber} Is Confirmed — We're Getting It Ready! ⭐`;

  return (
    <EmailPreviewShell
      title="Order Confirmation"
      subtitle="The itemized receipt emailed the moment an order is placed."
      subject={subjectLine}
    >
      {(view) => <EmailCard maxWidth={view === "mobile" ? 380 : undefined} />}
    </EmailPreviewShell>
  );
};

export default EmailOrderConfirmationPreview;
