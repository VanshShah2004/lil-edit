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
  private redisHit = false;

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

  /** Mark whether the cache hit came from Redis (L2) vs in-memory (L1). */
  setRedisHit(hit: boolean): void {
    this.redisHit = hit;
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
    const redisLookup      = this.duration("redis_lookup");
    const dbProduct        = this.duration("db_product");
    const dbRecCategory    = this.duration("db_rec_category");
    const dbRecPad         = this.duration("db_rec_pad");       // may be 0 if category had 5+
    const dbRecommendation = this.duration("db_recommendations"); // overall wall-time
    const processing       = Math.max(0, totalBackend - dbProduct - cacheLookup);

    // Determine if this is a product detail or recommendation request
    const isRecommendation = this.slug.startsWith("rec:");
    const isReviews = this.slug.startsWith("reviews:");
    const displaySlug = isRecommendation
      ? this.slug.substring(4)
      : isReviews
        ? this.slug.substring(8)
        : this.slug;

    // ── Identify slowest stage ───────────────────────────────────────────────
    const stages: [string, number][] = [
      ["Product DB Query",          dbProduct],
      ["Backend Processing",        processing],
    ];
    if (cacheLookup > 0) stages.push(["Cache Lookup", cacheLookup]);
    const [slowestName, slowestMs] = stages.reduce((a, b) => (b[1] > a[1] ? b : a));

    const line   = "─".repeat(63);
    const pad48  = (s: string) => s.substring(0, 48).padEnd(48);
    const fmtMs  = (ms: number) => `${ms.toFixed(1)}ms`;
    const row    = (label: string, val: string) =>
      `  │  ${(label + " :").padEnd(27)} ${val}`;

    if (isReviews) {
      const dbReviews = this.duration("db_reviews");
      console.log(`
  ┌${line}┐
  │  [REVIEWS LAZY-LOAD]${" ".repeat(42)}│
${row("  Product", pad48(displaySlug))}│
${row("  Status", "Background fetch (non-blocking)              ")}│
  └${line}┘

  DB Fetch:
    • Title lookup             : ${fmtMs(dbReviews)}

  Backend:
    • Processing Time          : ${fmtMs(processing)}
    • Total Time               : ${fmtMs(totalBackend)}
  ────────────────────────────────────────────────────────────────
`);
    } else if (isRecommendation) {
      // Recommendations endpoint log (lazy-loaded separately)
      const skipped = dbRecPad === 0
        ? "skipped (5+ results in category)"
        : `${fmtMs(dbRecPad)}  ← padding query`;

      console.log(`
  ┌${line}┐
  │  [RECOMMENDATIONS LAZY-LOAD]${" ".repeat(34)}│
${row("  Product", pad48(displaySlug))}│
${row("  Status", "Background fetch via requestIdleCallback  ")}│
  └${line}┘

  DB Fetch:
    • Category Query Q1        : ${fmtMs(dbRecCategory)}  (same-category recommendations)
    • Padding Query Q2         : ${skipped}
    • Total DB Time            : ${fmtMs(dbRecCategory + dbRecPad)}

  Backend:
    • Processing Time          : ${fmtMs(processing)}  (serialization + mapping)
    • Total Time               : ${fmtMs(totalBackend)}

  ⚡ Slowest Stage             : ${slowestName} (${fmtMs(slowestMs)})
  ────────────────────────────────────────────────────────────────
`);
    } else {
      // Product detail endpoint log (critical path - no recommendations)
      const cacheLabel = this.cacheHit
        ? this.redisHit
          ? "HIT  ✓ — L2 Redis hit, no DB round-trip       "
          : "HIT  ✓ — L1 memory hit, no DB round-trip      "
        : "MISS ✗ — cold DB fetch                         ";
      console.log(`
  ┌${line}┐
  │  [PDP PERFORMANCE] ⚡ CRITICAL PATH (NO RECOMMENDATIONS)${" ".repeat(6)}│
${row("  Product", pad48(displaySlug))}│
${row("  Cache", cacheLabel)}│
  └${line}┘

  Cache:
    • L1 Lookup (memory)       : ${fmtMs(cacheLookup)}
    • L2 Lookup (Redis)        : ${redisLookup > 0 ? fmtMs(redisLookup) : "skipped (L1 hit)"}

  DB Fetch:
    • Product Query            : ${fmtMs(dbProduct)}  ⚡ Only essential product data
    • Recommendations          : ✓ Lazy-loaded via /api/products/recommendations
    • Reviews                  : ✓ Lazy-loaded via /api/products/reviews

  Backend:
    • Processing Time          : ${fmtMs(processing)}  (serialization + mapping + validation)
    • Total Backend Time       : ${fmtMs(totalBackend)}

  ⚡ Slowest Stage             : ${slowestName} (${fmtMs(slowestMs)})
  ────────────────────────────────────────────────────────────────
  Frontend timings are logged separately in the browser console.
  Lazy endpoints: /api/products/recommendations  /api/products/reviews
`);
    }
  }
}
