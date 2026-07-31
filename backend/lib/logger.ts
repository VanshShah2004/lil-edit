import { performance } from "perf_hooks";

const IS_DEV = process.env.NODE_ENV !== "production";
const SEP    = "********************************************************";

let _counter = 0;

export class OpLogger {
  readonly sr: number;
  private readonly _t0: number;

  constructor(sr?: number) {
    this.sr  = sr ?? ++_counter;
    this._t0 = performance.now();
  }

  start(operation: string): this {
    if (!IS_DEV) return this;
    console.log(`\n${this.sr} - ${SEP}`);
    console.log(`${this.sr} - START - ${operation}`);
    return this;
  }

  end(operation: string, durationMs?: number): this {
    if (!IS_DEV) return this;
    const ms = (durationMs ?? (performance.now() - this._t0)).toFixed(1);
    console.log(`${this.sr} - END - ${operation} (${ms}ms)`);
    console.log(`${this.sr} - ${SEP}\n`);
    return this;
  }

  step(msg: string): this {
    if (IS_DEV) console.log(`  [${this.sr}] ${msg}`);
    return this;
  }

  success(msg: string): this {
    if (IS_DEV) console.log(`[${this.sr}] SUCCESS - ${msg}`);
    return this;
  }

  warn(msg: string): this {
    if (IS_DEV) console.warn(`[${this.sr}] WARNING - ${msg}`);
    return this;
  }

  error(msg: string, err?: unknown): this {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : "";
    console.error(`[${this.sr}] ERROR - ${msg}${detail ? ` : ${detail}` : ""}`);
    return this;
  }

  elapsed(): number {
    return performance.now() - this._t0;
  }
}

export function createLog(sr?: number): OpLogger {
  return new OpLogger(sr);
}

export function fms(n: number): string {
  return `${n.toFixed(1)}ms`;
}
