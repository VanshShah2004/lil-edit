// Shared formatting + palette for the analytics platform.
//
// Light mode only (per product decision). The categorical palette is anchored on
// the brand teal (#0F766E) and reuses the hue vocabulary already established in
// the admin Activity feed (teal=cart, blue=order, amber=review, pink=wishlist).
// Every hue is a 600–700-level tone chosen to sit dark enough on white for legible
// marks; identity is always reinforced with legends / direct labels (never colour
// alone), which is also what the tables and axis labels provide.

export const ACCENT = "#0F766E";

// Fixed categorical order — assigned by slot, never cycled. A series past slot 8
// folds into "Other" at the call site.
export const SERIES = [
  "#0F766E", // teal   (brand)
  "#2563EB", // blue
  "#D97706", // amber
  "#DB2777", // rose
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#65A30D", // lime
  "#DC2626", // red
] as const;

// Semantic tones for KPI deltas + status. Deltas are directional: some KPIs are
// "higher is better" (revenue), others "lower is better" (cancellation rate).
export const GOOD = "#047857"; // emerald-700 — positive movement
export const BAD = "#DC2626"; // red-600     — negative movement
export const NEUTRAL = "#6B7280"; // gray-500 — flat / no comparison

// Muted chart chrome.
export const GRID = "#E5E7EB";
export const AXIS = "#9CA3AF";
export const INK = "#111827";
export const INK_SOFT = "#6B7280";

// ─── Number formatting ────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function num(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return nf0.format(v);
}

// Compact currency for tight spaces (₹1.2L, ₹34.5k); full ₹ elsewhere.
export function inr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `₹${nf0.format(Math.round(v))}`;
}

export function inrCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Math.round(v);
  if (Math.abs(n) >= 1_00_00_000) return `₹${nf1.format(n / 1_00_00_000)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${nf1.format(n / 1_00_000)}L`;
  if (Math.abs(n) >= 1_000) return `₹${nf1.format(n / 1_000)}k`;
  return `₹${nf0.format(n)}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function compact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = v;
  if (Math.abs(n) >= 1_00_00_000) return `${nf1.format(n / 1_00_00_000)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `${nf1.format(n / 1_00_000)}L`;
  if (Math.abs(n) >= 1_000) return `${nf1.format(n / 1_000)}k`;
  return nf0.format(n);
}

// ─── Period-over-period delta ─────────────────────────────────────────────────
export interface Delta {
  pctChange: number | null; // null when there's no comparable previous value
  direction: "up" | "down" | "flat";
  // Whether this movement is GOOD for the business (depends on the metric).
  positive: boolean | null;
  label: string; // e.g. "+12.4%" or "New"
}

// `higherIsBetter=false` flips the colour semantics (e.g. cancellation rate).
export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  higherIsBetter = true
): Delta {
  const cur = current ?? 0;
  const prev = previous ?? 0;
  if (prev === 0) {
    // No baseline to compare against. If we grew from zero, say "New"; else flat.
    if (cur === 0) return { pctChange: null, direction: "flat", positive: null, label: "—" };
    return { pctChange: null, direction: "up", positive: higherIsBetter, label: "New" };
  }
  const change = ((cur - prev) / Math.abs(prev)) * 100;
  const direction = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
  const positive = direction === "flat" ? null : (direction === "up") === higherIsBetter;
  const sign = change > 0 ? "+" : "";
  return { pctChange: change, direction, positive, label: `${sign}${change.toFixed(1)}%` };
}

export function deltaColor(d: Delta): string {
  if (d.positive == null) return NEUTRAL;
  return d.positive ? GOOD : BAD;
}

// ─── Dates ────────────────────────────────────────────────────────────────────
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Title-case a product slug for display when no title is available.
export function prettySlug(slug: string | null | undefined): string {
  if (!slug) return "—";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
