import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchMaintenanceStatus } from "@/lib/maintenanceApi";

/**
 * Global "is the storefront live?" state. Polls the public status endpoint so the
 * coming-soon curtain appears/lifts within ~POLL_MS of an admin flipping it, and
 * re-checks on window focus.
 *
 * FAIL-OPEN: the default and the on-error behaviour is "live". A failed status
 * fetch (network blip, API down) must never black out the site — it just leaves
 * the last known state in place, defaulting to live on first load.
 */
interface MaintenanceContextType {
  active: boolean;
  message: string | null;
  /** When the switch was last changed — identifies the current maintenance episode. */
  updatedAt: string | null;
  /** True until the first status check settles. */
  loading: boolean;
  /** Re-check now — called after an admin toggles, and on window focus. */
  refresh: () => Promise<void>;
}

const MaintenanceContext = createContext<MaintenanceContextType | undefined>(undefined);

const POLL_MS = 30_000;

export const MaintenanceProvider = ({ children }: { children: React.ReactNode }) => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchMaintenanceStatus();
      if (!mountedRef.current) return;
      setActive(status.active);
      setMessage(status.message);
      setUpdatedAt(status.updatedAt);
      console.log(`[Maintenance] status → ${status.active ? "UNDER MAINTENANCE" : "live"}`);
    } catch (err) {
      // Fail-open: keep the last known state (default live) on any failure.
      console.warn("[Maintenance] status check failed — keeping last known state:", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const intervalId = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <MaintenanceContext.Provider value={{ active, message, updatedAt, loading, refresh }}>
      {children}
    </MaintenanceContext.Provider>
  );
};

export const useMaintenance = () => {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error("useMaintenance must be used within MaintenanceProvider");
  }
  return context;
};
