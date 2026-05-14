import { Router, type Request, type Response } from "express";

const router = Router();

// In-memory store (per server session)
interface StoredProduct {
  status: "DRAFT" | "PUBLISHED";
  receivedAt: string;
  data: Record<string, unknown>;
}

let lastProduct: StoredProduct | null = null;

// POST /api/products/preview  — called by the frontend
router.post("/preview", (req: Request, res: Response) => {
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };

  lastProduct = {
    status: status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    receivedAt: new Date().toISOString(),
    data,
  };

  console.log(
    `\n[Products] Received ${lastProduct.status}: "${(data as { name?: string }).name ?? "Untitled"}"\n`
  );

  const previewPath = "/api/products/preview";
  res.json({ ok: true, status: lastProduct.status, previewPath });
});

// GET /api/products/preview  — view in browser
router.get("/preview", (_req: Request, res: Response) => {
  if (!lastProduct) {
    res.send(renderEmpty());
    return;
  }
  res.send(renderProduct(lastProduct));
});

// ─── HTML renderers ────────────────────────────────────────────────────────

function renderEmpty(): string {
  return page(`
    <div class="empty">
      <div class="empty-icon">📦</div>
      <h2>No product received yet</h2>
      <p>Hit <strong>Save Draft</strong> or <strong>Launch Product</strong> in the Curation Studio.</p>
    </div>
  `);
}

function renderProduct(p: StoredProduct): string {
  const d = p.data as Record<string, unknown>;
  const colors = (d.selectedColors as ColorVariant[] | undefined) ?? [];
  const globalImages = (d.imagePreviews as string[] | undefined) ?? [];
  const tags = (d.tags as string[] | undefined) ?? [];
  const badges = (d.customBadges as string[] | undefined) ?? [];
  const sizes = (d.selectedSizes as string[] | undefined) ?? [];
  const points = (d.descriptionPoints as string[] | undefined) ?? [];

  const statusColor = p.status === "PUBLISHED" ? "#16a34a" : "#d97706";
  const statusBg = p.status === "PUBLISHED" ? "#dcfce7" : "#fef3c7";

  return page(`
    <div class="header">
      <div>
        <span class="badge" style="background:${statusBg};color:${statusColor};">
          ${p.status === "PUBLISHED" ? "🚀 PUBLISHED" : "📝 DRAFT"}
        </span>
        <h1>${esc(String(d.name ?? "Untitled Product"))}</h1>
        <p class="meta">Received at ${new Date(p.receivedAt).toLocaleString()}</p>
      </div>
    </div>

    <div class="grid-2">
      <!-- Left column -->
      <div class="card">
        <h3>🏷️ Core Details</h3>
        <table>
          ${row("Brand", d.brand)}
          ${row("SKU", d.sku)}
          ${row("Slug", d.slug)}
          ${row("Category", d.category)}
          ${row("Category Slug", d.categorySlug)}
          ${row("Gender", d.gender)}
          ${row("Featured", d.featured)}
          ${row("New Arrival", d.newArrival)}
          ${row("Bestseller", d.bestseller)}
          ${row("Trending", d.trending)}
        </table>
      </div>

      <div class="card">
        <h3>💰 Pricing & Stock</h3>
        <table>
          ${row("Original Price (MRP)", d.originalPrice ? `₹${d.originalPrice}` : "—")}
          ${row("Selling Price", d.price ? `₹${d.price}` : "—")}
          ${row("Total Stock", d.stock)}
        </table>

        <h3 style="margin-top:20px">📐 Specifications</h3>
        <table>
          ${row("Fabric", d.fabric)}
          ${row("Fit", d.fit)}
          ${row("Occasion", d.occasion)}
          ${row("Care", d.care)}
        </table>
      </div>
    </div>

    ${points.length ? `
    <div class="card">
      <h3>📋 Description Points</h3>
      <ul class="bullet-list">
        ${points.map((p) => `<li>${esc(p)}</li>`).join("")}
      </ul>
    </div>` : ""}

    <div class="card">
      <h3>📏 Sizes</h3>
      <div class="tag-row">
        ${sizes.length ? sizes.map((s) => `<span class="tag">${esc(s)}</span>`).join("") : "<em>None selected</em>"}
      </div>
    </div>

    ${tags.length || badges.length ? `
    <div class="grid-2">
      <div class="card">
        <h3>🔖 Tags</h3>
        <div class="tag-row">
          ${tags.map((t) => `<span class="tag tag-green">${esc(t)}</span>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>🏅 Custom Badges</h3>
        <div class="tag-row">
          ${badges.map((b) => `<span class="tag tag-purple">${esc(b)}</span>`).join("")}
        </div>
      </div>
    </div>` : ""}

    ${globalImages.length ? `
    <div class="card">
      <h3>🖼️ Global / Campaign Images (${globalImages.length})</h3>
      <div class="img-grid">
        ${globalImages.map((src, i) => `
          <div class="img-wrap">
            <img src="${src}" alt="Global image ${i + 1}" />
            <span class="img-label">Image ${i + 1}</span>
          </div>
        `).join("")}
      </div>
    </div>` : ""}

    ${colors.length ? `
    <div class="card">
      <h3>🎨 Color Variants (${colors.length})</h3>
      ${colors.map((c) => `
        <div class="variant-block">
          <div class="variant-header">
            <span class="color-swatch" style="background:${esc(c.hex)};"></span>
            <strong>${esc(c.name)}</strong>
            <code>${esc(c.sku)}</code>
            <span class="stock-badge">Stock: ${c.stock}</span>
          </div>
          ${c.images?.length ? `
          <div class="img-grid">
            ${c.images.map((src, i) => `
              <div class="img-wrap">
                <img src="${src}" alt="${esc(c.name)} ${i + 1}" />
                <span class="img-label">${esc(c.name)} ${i + 1}</span>
              </div>
            `).join("")}
          </div>` : `<p class="no-images">No images for this variant</p>`}
        </div>
      `).join("")}
    </div>` : ""}

    <div class="card raw-json">
      <h3>🗂️ Raw JSON Payload</h3>
      <pre>${esc(JSON.stringify({ status: p.status, ...p.data }, null, 2))}</pre>
    </div>
  `);
}

interface ColorVariant {
  name: string;
  hex: string;
  sku: string;
  stock: number;
  images: string[];
}

function row(label: string, value: unknown): string {
  const display =
    value === null || value === undefined || value === ""
      ? `<em class="empty-val">—</em>`
      : typeof value === "boolean"
      ? value
        ? `<span class="bool-true">✔ Yes</span>`
        : `<span class="bool-false">✘ No</span>`
      : `<span>${esc(String(value))}</span>`;

  return `<tr><td class="label">${esc(label)}</td><td>${display}</td></tr>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Lil Edit — Product Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8f7f5;
      color: #1a1a1a;
      min-height: 100vh;
      padding: 32px 24px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 2rem; font-weight: 700; margin: 8px 0 4px; color: #111; }
    h3 { font-size: 0.95rem; font-weight: 700; text-transform: uppercase;
         letter-spacing: 0.08em; color: #555; margin-bottom: 14px; }
    .meta { font-size: 0.8rem; color: #999; margin-top: 4px; }
    .badge {
      display: inline-block; padding: 4px 12px; border-radius: 9999px;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; margin-bottom: 12px;
    }
    .header { margin-bottom: 28px; }
    .card {
      background: #fff; border-radius: 16px; padding: 24px;
      margin-bottom: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    td:last-child { text-align: right; color: #333; }
    .label { color: #888; font-weight: 500; white-space: nowrap; padding-right: 16px; }
    .bool-true { color: #16a34a; font-weight: 600; }
    .bool-false { color: #999; }
    .empty-val { color: #ccc; }
    .tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag {
      display: inline-block; padding: 4px 12px; border-radius: 9999px;
      background: #f1f0ee; color: #555; font-size: 0.78rem; font-weight: 600;
    }
    .tag-green { background: #dcfce7; color: #15803d; }
    .tag-purple { background: #ede9fe; color: #7c3aed; }
    .img-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
    .img-wrap { position: relative; }
    .img-wrap img {
      width: 140px; height: 140px; object-fit: cover;
      border-radius: 10px; border: 1px solid #e5e5e5;
      display: block;
    }
    .img-label {
      display: block; text-align: center; font-size: 0.7rem;
      color: #999; margin-top: 4px;
    }
    .variant-block {
      border: 1px solid #f0f0f0; border-radius: 12px;
      padding: 16px; margin-bottom: 16px;
    }
    .variant-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    }
    .color-swatch {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid rgba(0,0,0,0.1); display: inline-block; flex-shrink: 0;
    }
    .stock-badge {
      margin-left: auto; font-size: 0.78rem; font-weight: 600;
      background: #f1f0ee; padding: 3px 10px; border-radius: 9999px; color: #555;
    }
    code { font-size: 0.78rem; background: #f4f4f4; padding: 2px 8px; border-radius: 6px; color: #333; }
    .no-images { font-size: 0.8rem; color: #bbb; font-style: italic; margin-top: 6px; }
    .bullet-list { padding-left: 20px; }
    .bullet-list li { margin-bottom: 6px; font-size: 0.88rem; color: #444; }
    .raw-json pre {
      background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 10px;
      font-size: 0.75rem; overflow-x: auto; max-height: 400px; overflow-y: auto;
      white-space: pre-wrap; word-break: break-all;
    }
    .empty {
      text-align: center; padding: 80px 20px; color: #aaa;
    }
    .empty-icon { font-size: 3rem; margin-bottom: 16px; }
    .empty h2 { color: #555; margin-bottom: 8px; }
    .empty p { font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

export default router;
