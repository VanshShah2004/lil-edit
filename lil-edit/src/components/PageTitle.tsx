import { useEffect } from "react";
import { useLocation, matchPath } from "react-router-dom";

/**
 * Keeps the browser tab title in sync with the current route.
 *
 * Inner pages show the page name followed by the brand (e.g. "Collections -
 * Lil Edit"). The landing page (empty label) shows the brand alone.
 *
 * One central map instead of each page setting its own title — add a route here
 * and the tab name follows. Patterns are matched with React Router's matchPath,
 * so dynamic segments (`:category`, `:orderId`, splats) work; the first match in
 * the list wins. Any unmatched path falls through to "Page Not Found" (the `*`
 * route). Empty label === brand only.
 */
export const BRAND = "Lil Edit";
// The landing page shows the full brand; inner pages use the shorter BRAND.
const HOME_BRAND = "The Lil Edit";

const ROUTE_TITLES: Array<{ pattern: string; label: string }> = [
  { pattern: "/",                     label: "" },
  // Legacy home URLs that redirect to "/" — listed so the tab title never flashes
  // "Page Not Found" for the frame before the redirect commits.
  { pattern: "/dashboard",            label: "" },
  { pattern: "/home",                 label: "" },
  { pattern: "/auth/callback",        label: "Signing in…" },
  { pattern: "/login",                label: "Login" },
  { pattern: "/signup",               label: "Sign Up" },
  { pattern: "/forgot-password",      label: "Reset Password" },
  { pattern: "/collections",          label: "Collections" },
  { pattern: "/collections/new-arrivals", label: "New Arrivals" },
  { pattern: "/collections/girls",    label: "Girls" },
  { pattern: "/collections/boys",     label: "Boys" },
  { pattern: "/collections/trending", label: "Trending" },
  { pattern: "/collections/occasion", label: "By Occasion" },
  { pattern: "/collections/ethnic-wear", label: "Ethnic Wear" },
  { pattern: "/collections/party-wear",  label: "Party Wear" },
  { pattern: "/collections/casual-wear", label: "Casual Wear" },
  { pattern: "/collections/accessories", label: "Accessories" },
  { pattern: "/search",               label: "Search Results" },
  { pattern: "/collections/:category/product/:productPath/*", label: "Product" },
  { pattern: "/cart",                 label: "Cart" },
  { pattern: "/wishlist",             label: "Wishlist" },
  { pattern: "/about",                label: "About" },
  { pattern: "/faq",                  label: "FAQ" },
  { pattern: "/contact",              label: "Contact Us" },
  { pattern: "/returns",              label: "Returns" },
  { pattern: "/shipping",             label: "Shipping" },
  { pattern: "/profile",              label: "Profile" },
  { pattern: "/orders",               label: "Orders" },
  { pattern: "/orders/:orderId",      label: "Order Details" },
  { pattern: "/reviews",              label: "My Reviews" },
  { pattern: "/admin/settings-panel/add-product",    label: "Add Product" },
  { pattern: "/admin/settings-panel/edit/:productId",label: "Edit Product" },
  { pattern: "/admin/settings-panel/manage-products",label: "Manage Products" },
  { pattern: "/admin/settings-panel/orders",         label: "Orders · Admin" },
  { pattern: "/admin/settings-panel/orders/:orderId",label: "Order · Admin" },
  { pattern: "/admin/settings-panel/spotlight",         label: "The Spotlight" },
  { pattern: "/admin/settings-panel/spotlight/preview", label: "The Spotlight" },
];

function labelForPath(pathname: string): string {
  const hit = ROUTE_TITLES.find(({ pattern }) => matchPath(pattern, pathname));
  return hit ? hit.label : "Page Not Found";
}

export default function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const label = labelForPath(pathname);
    document.title = label ? `${label} | ${BRAND}` : HOME_BRAND;
  }, [pathname]);

  return null;
}
