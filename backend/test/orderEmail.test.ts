import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatusEmail, buildConfirmationEmail } from "../lib/orderEmail.js";

test("status email: subject + status blurb + CTA + HTML-escaped name", () => {
  const { subject, html, text } = buildStatusEmail({
    recipientEmail: "a@b.com",
    recipientName: "Tom & Jerry",
    orderNumber: "LE000007",
    toStatus: "shipped",
    orderUrl: "https://shop.test/orders/1",
  });
  assert.match(subject, /LE000007 is now Shipped/);
  assert.match(html, /on its way/);            // the "shipped" blurb
  assert.match(html, /View your order/);       // CTA rendered when an orderUrl is given
  assert.match(html, /Tom &amp; Jerry/);       // name is HTML-escaped
  assert.ok(!html.includes("Tom & Jerry"));    // ...and the raw ampersand isn't present
  assert.match(text, /Order: LE000007/);
});

test("status email: no CTA without an orderUrl, generic greeting without a name", () => {
  const { html } = buildStatusEmail({
    recipientEmail: "a@b.com",
    orderNumber: "LE1",
    toStatus: "delivered",
  });
  assert.ok(!html.includes("View your order"));
  assert.match(html, /Hi there,/);
});

test("confirmation receipt: items, totals, discount line, address, CTA", () => {
  const { subject, html, text } = buildConfirmationEmail({
    orderId: "o1", orderNumber: "LE42", recipientEmail: "a@b.com", recipientName: "Aarav",
    items: [
      { title: "Floral Frock", sku: "S1", size: "2-3Y", colorName: "Red", quantity: 2, unitPrice: 1299, lineTotal: 2598, imageUrl: "https://x/y.jpg" },
      { title: "Striped Romper", sku: "S2", quantity: 1, unitPrice: 899, lineTotal: 899 },
    ],
    subtotal: 3497, discount: 350, shippingFee: 199, total: 3346, itemCount: 3,
    orderUrl: "https://shop.test/orders/o1",
    address: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", country: "India", pincode: "560001" },
  });
  assert.match(subject, /LE42 confirmed/);
  assert.match(html, /Floral Frock/);
  assert.match(html, /Striped Romper/);
  assert.match(html, /Bengaluru/);
  assert.match(html, /Discount/);              // discount row present when > 0
  assert.match(html, /₹3,346/);                // total is rupee-formatted
  assert.match(html, /View your order/);
  assert.match(text, /- Floral Frock \(2-3Y, Red\) x2/);
});

test("confirmation receipt: no Discount row when 0, Shipping shows Free, no stray blank line", () => {
  const { html, text } = buildConfirmationEmail({
    orderId: "o", orderNumber: "LE9", recipientEmail: "a@b.com",
    items: [{ title: "Sun Hat", sku: "H", quantity: 1, unitPrice: 500, lineTotal: 500 }],
    subtotal: 500, discount: 0, shippingFee: 0, total: 500, itemCount: 1,
  });
  assert.ok(!html.includes("Discount"));       // no discount row at all
  assert.match(html, /Free/);                  // free shipping label
  assert.ok(!text.includes("\n\n\n"));         // the absent-orderUrl line doesn't double the blank
});
