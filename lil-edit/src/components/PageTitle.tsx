import { useEffect } from "react";
import { useLocation, matchPath } from "react-router-dom";

/**
 * Keeps the browser tab title in sync with the current route.
 *
 * The brand "The Lil Edit" is ALWAYS shown; the page name is appended after an
 * em dash (e.g. "The Lil Edit — Collections"). The landing page is brand-only.
 *
 * One central map instead of each page setting its own title — add a route here
 * and the tab name follows. Patterns are matched with React Router's matchPath,
 * so dynamic segments (`:category`, `:orderId`, splats) work; the first match in
 * the list wins. Any unmatched path falls through to "Page Not Found" (the `*`
 * route). Empty label === brand only.
 */
const BRAND = "The Lil Edit";

const ROUTE_TITLES: Array<{ pattern: string; label: string }> = [
  { pattern: "/",                     label: "" },
  { pattern: "/dashboard",            label: "" },
  { pattern: "/auth/callback",        label: "Signing in…" },
  { pattern: "/login",                label: "Login" },
  { pattern: "/signup",               label: "Sign Up" },
  { pattern: "/forgot-password",      label: "Reset Password" },
  { pattern: "/collections",          label: "Collections" },
  { pattern: "/collections/:category/product/:productPath/*", label: "Product" },
  { pattern: "/cart",                 label: "Cart" },
  { pattern: "/wishlist",             label: "Wishlist" },
  { pattern: "/about",                label: "About" },
  { pattern: "/profile",              label: "Profile" },
  { pattern: "/orders",               label: "Orders" },
  { pattern: "/orders/:orderId",      label: "Order Details" },
  { pattern: "/reviews",              label: "My Reviews" },
  { pattern: "/admin/add-product",    label: "Add Product" },
  { pattern: "/admin/edit/:productId",label: "Edit Product" },
  { pattern: "/admin/manage-products",label: "Manage Products" },
  { pattern: "/admin/orders",         label: "Orders · Admin" },
  { pattern: "/admin/orders/:orderId",label: "Order · Admin" },
  { pattern: "/admin/spotlight",         label: "The Spotlight" },
  { pattern: "/admin/spotlight/preview", label: "The Spotlight" },
];

function labelForPath(pathname: string): string {
  const hit = ROUTE_TITLES.find(({ pattern }) => matchPath(pattern, pathname));
  return hit ? hit.label : "Page Not Found";
}

export default function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const label = labelForPath(pathname);
    document.title = label ? `${BRAND} — ${label}` : BRAND;
  }, [pathname]);

  return null;
}
