import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordRouteChange, startHeartbeat } from "@/lib/track";

// Renders nothing. Lives directly under BrowserRouter so it sees every route:
//   • records each path change — trackProductView derives a view's source
//     (search / collection / home / …) from the PREVIOUS in-app route, which
//     keeps attribution in one place instead of threading state through every
//     product link in the app;
//   • runs the live-presence heartbeat (visible tabs only, storefront only —
//     /admin paths are skipped inside ping()).
const TrackingBridge = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    recordRouteChange(pathname);
  }, [pathname]);

  // startHeartbeat is idempotent and returns its own cleanup (StrictMode-safe).
  useEffect(() => startHeartbeat(), []);

  return null;
};

export default TrackingBridge;
