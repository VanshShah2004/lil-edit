import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

// React Router doesn't reset scroll position on navigation (unlike a full page
// load), so clicking any button/link that goes to a new page while scrolled down
// would land mid-page on the new one. This snaps to top on every route change.
//
// Keyed on pathname + search so query-param page changes (e.g. /search?q=…) also
// reset. useLayoutEffect runs before the browser paints the new route, so there's
// no flash of the new page at the old scroll position.
export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
}
