import { supabaseAdmin } from "./supabase.js";

// ─── Site maintenance (kill switch) state ────────────────────────────────────
// A single global flag — "is the storefront live, or showing the coming-soon
// page?" — read on EVERY request by middleware/maintenanceGate.ts. To keep the
// hot path (maintenance OFF, i.e. normal operation) free of any await or DB hit,
// the flag is cached in memory and refreshed by a background watcher + busted
// immediately after a toggle. getMaintenanceSnapshot() is a synchronous read of
// that cache.
//
// FAIL-OPEN: if the flag can't be read (no service-role key, migration not
// applied, transient DB error) the site stays LIVE. A glitch in the maintenance
// system must never black out the storefront — that would be the opposite of a
// failsafe. The flag is the source of truth ONLY when we can actually read it;
// otherwise we keep the last known good value, falling back to "live".

export interface MaintenanceSnapshot {
  active: boolean;
  message: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

const LIVE: MaintenanceSnapshot = {
  active: false,
  message: null,
  updatedAt: null,
  updatedByEmail: null,
};

// Refresh cadence. Also bounds cross-instance staleness: each instance caches
// its own snapshot, so a toggle on one instance only busts that one — the others
// converge within this window. Single-instance deploys see toggles instantly via
// bustMaintenance().
const REFRESH_MS = 15_000;

let snapshot: MaintenanceSnapshot = { ...LIVE };
let loaded = false;
let watcher: ReturnType<typeof setInterval> | null = null;

/** Synchronous, allocation-free read for the request hot path. Never throws. */
export function getMaintenanceSnapshot(): MaintenanceSnapshot {
  return snapshot;
}

/** True once the first read has settled (success or fail). */
export function isMaintenanceLoaded(): boolean {
  return loaded;
}

/**
 * Read the flag from the DB and update the in-memory snapshot. Reads via the
 * service-role client (the table is RLS-locked). On any failure it KEEPS the
 * current snapshot (fail-open to whatever was last known, default "live").
 */
export async function refreshMaintenanceState(): Promise<MaintenanceSnapshot> {
  if (!supabaseAdmin) {
    // No service role → can't read the locked table. Stay live, and only say so
    // once to avoid log spam from the watcher.
    if (!loaded) {
      console.warn("[maintenance] SUPABASE_SERVICE_ROLE_KEY not set — kill switch disabled, site stays live");
    }
    snapshot = { ...LIVE };
    loaded = true;
    return snapshot;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("maintenance_active, maintenance_message, updated_at, updated_by_email")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      // Missing table (migration not applied) or a transient error. Keep the last
      // known snapshot rather than flapping the whole site.
      console.warn(
        `[maintenance] read failed — keeping last known state (active=${snapshot.active})  code=${(error as { code?: string }).code ?? "?"}  ${error.message}`,
      );
      loaded = true;
      return snapshot;
    }

    const next: MaintenanceSnapshot = {
      active: data?.maintenance_active === true,
      message: (data?.maintenance_message as string | null) ?? null,
      updatedAt: (data?.updated_at as string | null) ?? null,
      updatedByEmail: (data?.updated_by_email as string | null) ?? null,
    };

    // Log only on an actual transition so the switch is auditable without spam.
    if (loaded && next.active !== snapshot.active) {
      console.log(`[maintenance] state changed → ${next.active ? "UNDER MAINTENANCE" : "LIVE"}${next.updatedByEmail ? `  by=${next.updatedByEmail}` : ""}`);
    }
    snapshot = next;
    loaded = true;
    return snapshot;
  } catch (err) {
    console.warn(`[maintenance] read threw — keeping last known state (active=${snapshot.active}): ${(err as Error).message}`);
    loaded = true;
    return snapshot;
  }
}

/** Force an immediate refresh — call right after a toggle so it takes effect now. */
export async function bustMaintenance(): Promise<MaintenanceSnapshot> {
  return refreshMaintenanceState();
}

/** Prime the snapshot at boot and start the background refresh loop (idempotent). */
export function startMaintenanceWatcher(): void {
  if (watcher) return;
  void refreshMaintenanceState();
  watcher = setInterval(() => {
    void refreshMaintenanceState();
  }, REFRESH_MS);
  // Don't hold the process open just for the watcher.
  if (typeof watcher.unref === "function") watcher.unref();
  console.log(`[maintenance] watcher started — polling site_settings every ${REFRESH_MS / 1000}s (fail-open to live)`);
}
