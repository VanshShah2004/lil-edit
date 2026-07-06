// Order confirmation email — an itemized receipt sent right after a successful placement.
//
// Called fire-and-forget from checkout's afterPlacement(), so the checkout flow never
// blocks on — or fails because of — email delivery. Goes through the shared Gmail SMTP
// mailer (so it no-ops gracefully when GMAIL_APP_PASSWORD is unset, and carries the
// support Reply-To).

import { createLog } from "./logger.js";
import { sendMail, type SendMailResult } from "./mailer.js";

// ₹ amount, rounded, grouped Indian-style. Defined as a hoisted function so it (and esc /
// fmtDate below) can be used by sendOrderConfirmation even though they're declared lower.
function inr(n: number): string {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

function fmtDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export interface OrderConfirmationItem {
  title: string;
  sku: string;
  // Optional fields explicitly allow `undefined` (tsconfig: exactOptionalPropertyTypes).
  size?: string | undefined;
  colorName?: string | undefined;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | undefined;
}

export interface OrderConfirmationAddress {
  label?: string | null | undefined;
  line1: string;
  line2?: string | undefined;
  landmark?: string | null | undefined;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

export interface OrderConfirmationPayload {
  orderId: string;
  orderNumber: string;
  recipientEmail: string;
  recipientName?: string | undefined;
  items: OrderConfirmationItem[];
  subtotal: number;
  discount: number;
  couponCode?: string | undefined;
  shippingFee: number;
  total: number;
  itemCount: number;
  paymentMethod?: string | undefined;
  orderUrl?: string | undefined;
  address?: OrderConfirmationAddress | undefined;
  // ISO timestamp the order was placed; defaults to now when omitted.
  placedAt?: string | undefined;
}

/** Build the order-confirmation receipt (subject/html/text). Pure — exported for testing. */
export function buildConfirmationEmail(order: OrderConfirmationPayload): { subject: string; html: string; text: string } {
  const greeting = order.recipientName ? `Hi ${esc(order.recipientName)},` : "Hi there,";
  const orderNo = esc(order.orderNumber);
  const subject = `🎉 Your Order ${order.orderNumber} Is Confirmed — We're Getting It Ready! ⭐`;
  const placed = fmtDate(order.placedAt);

  // One row per line item: [thumbnail][title + size/colour + qty][line total]. The thumb
  // cell is always rendered (empty when there's no image) so columns stay aligned.
  const itemRows = order.items.map((it) => {
    const meta = [it.size, it.colorName].filter(Boolean).join(" · ");
    const thumbCell = it.imageUrl
      ? `<td width="56" style="padding:12px 12px 12px 0;border-bottom:1px solid #f3f3f3;vertical-align:top;"><img src="${esc(it.imageUrl)}" width="44" height="44" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #eeeeee;display:block;" /></td>`
      : `<td width="0" style="padding:0;border-bottom:1px solid #f3f3f3;"></td>`;
    return `
      <tr>
        ${thumbCell}
        <td style="padding:12px 0;border-bottom:1px solid #f3f3f3;vertical-align:top;">
          <div style="font-size:14px;color:#1a1a1a;font-weight:600;line-height:1.3;">${esc(it.title)}</div>
          ${meta ? `<div style="font-size:12px;color:#999999;margin-top:3px;">${esc(meta)}</div>` : ""}
          <div style="font-size:12px;color:#999999;margin-top:3px;">Qty ${it.quantity} · ${inr(it.unitPrice)} each</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f3f3f3;text-align:right;vertical-align:top;font-size:14px;color:#1a1a1a;font-weight:600;white-space:nowrap;">${it.quantity} × ${inr(it.unitPrice)}</td>
      </tr>`;
  }).join("");

  const totalLine = (label: string, value: string, opts: { strong?: boolean; green?: boolean } = {}) => {
    const { strong = false, green = false } = opts;
    const color = strong ? "#1a1a1a" : green ? "#16a34a" : "#666666";
    const cell = `padding:6px 0;font-size:${strong ? "15px" : "13px"};color:${color};${strong ? "border-top:2px solid #1a1a1a;padding-top:12px;font-weight:700;" : ""}`;
    return `<tr><td style="${cell}">${label}</td><td style="${cell}text-align:right;font-weight:${strong ? "700" : green ? "600" : "500"};">${value}</td></tr>`;
  };

  const totalsRows = [
    totalLine("Subtotal", inr(order.subtotal)),
    order.discount > 0 ? totalLine(`COUPON${order.couponCode ? ` (${order.couponCode})` : ""}`, `- ${inr(order.discount)}`, { green: true }) : "",
    totalLine("Delivery", order.shippingFee > 0 ? inr(order.shippingFee) : "Free"),
    totalLine("Total", inr(order.total), { strong: true }),
  ].join("");

  const addr = order.address;
  const addressBlock = addr
    ? `<div style="margin:28px 0 0;">
         <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;font-weight:700;margin-bottom:8px;">Shipping to</div>
         <div style="font-size:13px;color:#444444;line-height:1.7;">
           ${order.recipientName ? `${esc(order.recipientName)}<br/>` : ""}${esc(addr.line1)}${addr.line2 ? `<br/>${esc(addr.line2)}` : ""}${addr.landmark ? `<br/>${esc(addr.landmark)}` : ""}<br/>
           ${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.pincode)}<br/>${esc(addr.country)}
         </div>
       </div>`
    : "";

  const cta = order.orderUrl
    ? `<div style="text-align:center;margin:28px 0 4px;">
         <a href="${esc(order.orderUrl)}" style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">View your order</a>
       </div>`
    : "";

  const html = `
  <div style="background:#f6f6f8;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;overflow:hidden;border:1px solid #eeeeee;">
      <div style="background:#B19CD9;padding:24px 32px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">The Lil Edit</div>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#333333;margin:0 0 16px;">${greeting}</p>
        <p style="font-size:15px;color:#333333;margin:0 0 24px;line-height:1.6;">Thank you for your order — it's confirmed and we're getting it ready. Here's your receipt.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
          <tr>
            <td style="font-size:12px;color:#999999;text-transform:uppercase;letter-spacing:1px;padding:0 0 4px;">Order</td>
            <td style="font-size:14px;color:#1a1a1a;font-weight:700;text-align:right;padding:0 0 4px;font-family:monospace;">${orderNo}</td>
          </tr>
          ${placed ? `<tr><td style="font-size:12px;color:#999999;text-transform:uppercase;letter-spacing:1px;padding:0;">Placed</td><td style="font-size:13px;color:#666666;text-align:right;padding:0;">${esc(placed)}</td></tr>` : ""}
        </table>
        <table style="width:100%;border-collapse:collapse;margin:16px 0 0;">${itemRows}</table>
        <table style="width:100%;border-collapse:collapse;margin:16px 0 0;">${totalsRows}</table>
        ${addressBlock}
        ${cta}
      </div>
      <div style="padding:18px 20px;background:#000000;color:#ffffff;font-size:12px;line-height:1.5;text-align:center;border-radius:0;width:100%;box-sizing:border-box;">
        The Lil Edit · Curated fashion for little ones
      </div>
    </div>
  </div>`;

  const textItems = order.items
    .map((it) => {
      const meta = [it.size, it.colorName].filter(Boolean).join(", ");
      return `- ${it.title}${meta ? ` (${meta})` : ""} x${it.quantity} — ${inr(it.lineTotal)}`;
    })
    .join("\n");

  const textAddr = addr
    ? ["Shipping to:", order.recipientName ?? "", addr.line1, addr.line2 ?? "", addr.landmark ?? "",
       `${addr.city}, ${addr.state} ${addr.pincode}`, addr.country]
        .filter((l) => l && l.trim() !== "")
        .join("\n")
    : "";

  const text = [
    order.recipientName ? `Hi ${order.recipientName},` : "Hi there,",
    "",
    "Thank you for your order — it's confirmed. Here's your receipt.",
    "",
    `Order: ${order.orderNumber}`,
    placed ? `Placed: ${placed}` : null,
    "",
    "Items:",
    textItems,
    "",
    `Subtotal: ${inr(order.subtotal)}`,
    order.discount > 0 ? `Coupon${order.couponCode ? ` (${order.couponCode})` : ""}: - ${inr(order.discount)}` : null,
    `Delivery: ${order.shippingFee > 0 ? inr(order.shippingFee) : "Free"}`,
    `Total: ${inr(order.total)}`,
    textAddr ? "" : null,
    textAddr || null,
    order.orderUrl ? "" : null,
    order.orderUrl ? `View your order: ${order.orderUrl}` : null,
    "",
    "— The Lil Edit",
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html, text };
}

/**
 * Fire-and-forget post-placement receipt. Awaitable (returns the mailer result for
 * logging/tests), but callers deliberately do NOT block on it — a slow/failing mail send
 * must never affect a paid, placed order. Never throws.
 */
export async function sendOrderConfirmation(order: OrderConfirmationPayload): Promise<SendMailResult> {
  const log = createLog().start("ORDER CONFIRMATION EMAIL");
  const { subject, html, text } = buildConfirmationEmail(order);
  log.step(`emailing "${order.recipientEmail || "<no email on file>"}"  order=${order.orderNumber}  items=${order.itemCount}  total=${inr(order.total)}`);
  const result = await sendMail({ to: order.recipientEmail, subject, html, text }, log);
  log.end("ORDER CONFIRMATION EMAIL");
  return result;
}

// ─── Order status-change notification ────────────────────────────────────────────
// Sent when an admin updates an order's status and ticks "Notify customer". Wired through
// the same Gmail SMTP mailer; it no-ops gracefully (logs, returns sent:false) when
// GMAIL_APP_PASSWORD is unset.

export interface OrderStatusEmailPayload {
  recipientEmail: string;
  // Optional fields explicitly allow `undefined` (tsconfig: exactOptionalPropertyTypes).
  recipientName?: string | undefined;
  orderNumber: string;
  toStatus: string;
  // A link to the customer's order detail page, included as a CTA when provided.
  orderUrl?: string | undefined;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// A short, customer-friendly line describing what the new status means for them. The
// internal admin note is deliberately NOT included — it can carry internal remarks
// (e.g. correction reasons) that shouldn't leak to the customer.
const STATUS_BLURB: Record<string, string> = {
  confirmed: "Your order has been confirmed and will be prepared shortly.",
  processing: "Good news — we're preparing your order for shipment.",
  shipped: "Your order is on its way!",
  delivered: "Your order has been delivered. We hope you love it!",
  cancelled: "Your order has been cancelled. If this is unexpected, please reach out to us.",
};

const STATUS_ICON: Record<string, string> = {
  confirmed: "✅",
  processing: "🛠️",
  shipped: "🚚",
  delivered: "📦",
  cancelled: "❌",
};

// Minimal HTML escape so a stray character in a name/order number can't break the
// markup. (XSS risk is low — the recipient is the customer themselves — but cheap.)
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

/** Build the status-change email (subject/html/text). Pure — exported for testing. */
export function buildStatusEmail(payload: OrderStatusEmailPayload): { subject: string; html: string; text: string } {
  const label = STATUS_LABELS[payload.toStatus] ?? payload.toStatus;
  const blurb = STATUS_BLURB[payload.toStatus] ?? `Your order status is now ${label}.`;
  const icon = STATUS_ICON[payload.toStatus] ?? "📦";
  const greeting = payload.recipientName ? `Hi ${esc(payload.recipientName)},` : "Hi there,";
  const orderNo = esc(payload.orderNumber);
  const subject = `Your order ${payload.orderNumber} is now ${label}! 💜`;

  const cta = payload.orderUrl
    ? `<div style="text-align:center;margin:8px 0 4px;">
         <a href="${esc(payload.orderUrl)}" style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:4px;">🔗 View your order</a>
       </div>`
    : "";

  const html = `
  <div style="background:#f6f6f8;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;overflow:hidden;border:1px solid #eeeeee;">
      <div style="background:#B19CD9;padding:24px 32px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:-0.2px;">The Lil Edit</div>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#333333;margin:0 0 16px;">${greeting}</p>
        <p style="font-size:15px;color:#333333;margin:0 0 24px;line-height:1.6;">${icon} ${blurb}</p>
        <div style="text-align:center;margin:0 0 24px;">
          <span style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:8px 18px;border-radius:4px;">${esc(label)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="font-size:12px;color:#999999;text-transform:uppercase;letter-spacing:1px;padding:8px 0;border-bottom:1px solid #f0f0f0;">Order</td>
            <td style="font-size:14px;color:#1a1a1a;font-weight:700;text-align:right;padding:8px 0;border-bottom:1px solid #f0f0f0;font-family:monospace;">${orderNo}</td>
          </tr>
        </table>
        ${cta}
      </div>
      <div style="padding:18px 20px;background:#000000;color:#ffffff;font-size:12px;line-height:1.5;text-align:center;border-radius:0;width:100%;box-sizing:border-box;">
        The Lil Edit · Curated fashion for little ones
      </div>
    </div>
  </div>`;

  const text = [
    payload.recipientName ? `Hi ${payload.recipientName},` : "Hi there,",
    "",
    blurb,
    "",
    `Order: ${payload.orderNumber}`,
    `Status: ${label}`,
    // `null` (not "") for the optional line so the filter actually drops it — otherwise an
    // absent order URL leaves a stray blank line. The "" entries are intentional spacers.
    payload.orderUrl ? `View your order: ${payload.orderUrl}` : null,
    "",
    "— The Lil Edit",
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text };
}

/**
 * Email the customer that their order's status changed. Never throws; returns the mailer
 * result so the caller can report whether it actually went out.
 */
export async function sendOrderStatusEmail(payload: OrderStatusEmailPayload): Promise<SendMailResult> {
  const log = createLog().start("ORDER STATUS EMAIL");
  const { subject, html, text } = buildStatusEmail(payload);
  const result = await sendMail({ to: payload.recipientEmail, subject, html, text }, log);
  log.end("ORDER STATUS EMAIL");
  return result;
}
