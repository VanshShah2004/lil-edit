import { performance } from "perf_hooks";

// Only emit logs outside production
const IS_DEV = process.env.NODE_ENV !== "production";

interface Mark {
  start: number;
  end: number | null;
  label: string;
}

// ─── PdpTimer ────────────────────────────────────────────────────────────────
// Instruments a single /api/products/detail request lifecycle.
// Usage:
//   const t = new PdpTimer(slug);
//   t.start("db_product");
//   await fetchProductBySlugAndSku(...);
//   t.end("db_product");
//   t.log();   // prints to stdout in dev
// ─────────────────────────────────────────────────────────────────────────────
export class PdpTimer {
  private slug: string;
  private requestStart: number;
  private marks = new Map<string, Mark>();
  private cacheHit = false;

  constructor(slug: string) {
    this.slug = slug;
    this.requestStart = performance.now();
  }

  /** Start timing a named stage. */
  start(name: string, label?: string): void {
    this.marks.set(name, { start: performance.now(), end: null, label: label ?? name });
  }

  /** Stop timing a named stage. Returns the elapsed ms. */
  end(name: string): number {
    const mark = this.marks.get(name);
    if (!mark) return 0;
    mark.end = performance.now();
    return mark.end - mark.start;
  }

  /** Get duration of a completed stage in ms (0 if not recorded). */
  duration(name: string): number {
    const mark = this.marks.get(name);
    if (!mark || mark.end === null) return 0;
    return mark.end - mark.start;
  }

  /** Mark whether this request was served from cache. */
  setCacheHit(hit: boolean): void {
    this.cacheHit = hit;
  }

  /** Total ms elapsed since the request was received. */
  totalMs(): number {
    return performance.now() - this.requestStart;
  }

  /** Print the full PDP performance report to stdout. No-op in production. */
  log(): void {
    if (!IS_DEV) return;

    const totalBackend     = this.totalMs();
    const cacheLookup      = this.duration("cache_lookup");
    const dbProduct        = this.duration("db_product");
    const dbRecCategory    = this.duration("db_rec_category");
    const dbRecPad         = this.duration("db_rec_pad");       // may be 0 if category had 5+
    const dbRecommendation = this.duration("db_recommendations"); // overall wall-time
    const dbTotal          = dbProduct + dbRecommendation;       // parallel, so wall-time >= either
    const processing       = Math.max(0, totalBackend - dbTotal - cacheLookup);

    // ── Identify slowest stage ───────────────────────────────────────────────
    const stages: [string, number][] = [
      ["Product DB Query",          dbProduct],
      ["Recommendation DB Query",   dbRecommendation],
      ["Backend Processing",        processing],
    ];
    if (cacheLookup > 0) stages.push(["Cache Lookup", cacheLookup]);
    const [slowestName, slowestMs] = stages.reduce((a, b) => (b[1] > a[1] ? b : a));

    const line   = "─".repeat(63);
    const pad48  = (s: string) => s.substring(0, 48).padEnd(48);
    const fmtMs  = (ms: number) => `${ms.toFixed(1)}ms`;
    const row    = (label: string, val: string) =>
      `  │  ${(label + " :").padEnd(27)} ${val}`;

    const skipped = dbRecPad === 0
      ? "skipped (5+ results in category)"
      : `${fmtMs(dbRecPad)}  ← ⚠ padding query — category has <5 products`;

    console.log(`
  ┌${line}┐
  │  [PDP PERFORMANCE]${" ".repeat(44)}│
${row("  Product", pad48(this.slug))}│
${row("  Cache", this.cacheHit
      ? "HIT  ✓ — served from memory, no DB round-trip  "
      : "MISS ✗ — cold DB fetch                         ")}│
  └${line}┘

  DB Fetch:
    • Product Query            : ${fmtMs(dbProduct)}
    • Recommendation Q1        : ${fmtMs(dbRecCategory)}  (same-category filter)
    • Recommendation Q2        : ${skipped}
    • Total DB Time            : ${fmtMs(dbTotal)}  ${dbProduct > dbRecommendation ? "(product query was slower)" : "(recommendation query was slower)"}

  Backend:
    • Cache Lookup             : ${fmtMs(cacheLookup)}
    • Processing Time          : ${fmtMs(processing)}  (serialization + mapping + validation)
    • Total Backend Time       : ${fmtMs(totalBackend)}

  ⚡ Slowest Stage             : ${slowestName} (${fmtMs(slowestMs)})
  ────────────────────────────────────────────────────────────────
  Frontend timings are logged separately in the browser console.
`);
  }
}
