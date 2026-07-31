// ─── PdpClientPerf ────────────────────────────────────────────────────────────
// Browser-side performance tracker for the Product Detail Page.
// Uses window.performance.now() for sub-millisecond precision.
// Logs are emitted only in development builds (import.meta.env.DEV).
//
// Lifecycle marks (call in order):
//   1. perf.mark("navStart")       — component mounts / route changes
//   2. perf.mark("fetchStart")     — right before fetch()
//   3. perf.mark("fetchEnd")       — when fetch() Promise resolves (response received)
//   4. perf.mark("parseEnd")       — after res.json() resolves
//   5. perf.mark("renderStart")    — right before setProduct() is called
//   6. perf.mark("renderEnd")      — inside useEffect() that fires after product renders
//   7. perf.log(cacheHit)          — print the full report
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV;

export class PdpClientPerf {
  private slug: string;
  private t: Partial<Record<string, number>> = {};

  constructor(slug: string) {
    this.slug = slug;
  }

  /** Record a named timestamp. */
  mark(name: string): void {
    this.t[name] = performance.now();
  }

  /** Duration between two marks in ms. Returns 0 if either mark is missing. */
  private dur(from: string, to: string): number {
    const a = this.t[from];
    const b = this.t[to];
    if (a === undefined || b === undefined) return 0;
    return Math.max(0, b - a);
  }

  /**
   * Print the complete frontend PDP timing report to the browser console.
   * @param cacheHit — was the data served from the module-level cache?
   */
  log(cacheHit = false): void {
    if (!IS_DEV) return;

    const networkTime  = this.dur("fetchStart",  "fetchEnd");
    const parseTime    = this.dur("fetchEnd",     "parseEnd");
    const reactSetup   = this.dur("parseEnd",     "renderStart");  // setState + diffing kick-off
    const renderTime   = this.dur("renderStart",  "renderEnd");    // commit → browser paint
    const totalFE      = this.dur("fetchStart",   "renderEnd");
    const navToFetch   = this.dur("navStart",     "fetchStart");   // React boot / effect delay
    const e2e          = this.dur("navStart",      "renderEnd");

    const stages: [string, number][] = [
      ["API Network Time",   networkTime],
      ["JSON Parse Time",    parseTime],
      ["React Render Time",  renderTime],
    ];
    const [slowestName, slowestMs] = stages.reduce((a, b) => (b[1] > a[1] ? b : a));

    const fmt = (ms: number) => `${ms.toFixed(1)}ms`;

    const cacheNote = cacheHit
      ? "HIT  ✓ — module cache (no network round-trip)"
      : "MISS ✗ — cold fetch";

    console.groupCollapsed(
      `%c[PDP FRONTEND PERF]%c  ${this.slug}  %c${fmt(e2e)} e2e`,
      "color:#0F766E;font-weight:bold",
      "color:#334155;font-weight:normal",
      "color:#7C3AED;font-weight:bold"
    );

    console.log(
      `%cProduct Detail Page — Frontend Timing Breakdown`,
      "font-weight:bold;color:#0F766E"
    );

    console.table({
      "Cache"                  : { value: cacheNote },
      "Nav → Fetch start"      : { value: `${fmt(navToFetch)}   (React effect boot delay)` },
      "API Network Time"        : { value: fmt(networkTime) },
      "JSON Parse Time"         : { value: fmt(parseTime) },
      "React Setup (setState)"  : { value: fmt(reactSetup) },
      "React Render Time"       : { value: fmt(renderTime) },
      "────────────────────"   : { value: "──────────────────────────" },
      "Total Frontend Time"     : { value: fmt(totalFE) },
      "End-to-End (nav→paint)"  : { value: fmt(e2e) },
    });

    console.log(
      `%c⚡ Slowest frontend stage:%c ${slowestName} (${fmt(slowestMs)})`,
      "color:#B45309;font-weight:bold",
      "color:#334155"
    );

    console.log(
      "%c💡 ℹ️ Reviews and recommendations are lazy-loaded separately (non-blocking).",
      "color:#10B981;font-style:italic"
    );

    console.log(
      "%cBackend timings are in the server terminal (Node.js stdout). Recommendations fetched via /api/products/recommendations",
      "color:#94A3B8;font-style:italic"
    );

    console.groupEnd();
  }
}
