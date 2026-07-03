import { Fragment, type ReactNode, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Heart,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Radio,
  Search,
  ShoppingCart,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";

const ACCENT = "#0F766E";

interface NavItem {
  to: string;
  label: string;
  icon: typeof BarChart3;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/admin/analytics", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/analytics/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/admin/analytics/orders", label: "Orders", icon: Package },
  { to: "/admin/analytics/products", label: "Products", icon: BarChart3 },
  { to: "/admin/analytics/customers", label: "Customers", icon: Users },
  { to: "/admin/analytics/wishlist", label: "Wishlist", icon: Heart },
  { to: "/admin/analytics/cart", label: "Cart", icon: ShoppingCart },
  { to: "/admin/analytics/search", label: "Search", icon: Search },
  { to: "/admin/analytics/reviews", label: "Reviews", icon: MessageSquareText },
  { to: "/admin/analytics/coupons", label: "Coupons", icon: Ticket },
  { to: "/admin/analytics/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/analytics/live", label: "Live", icon: Radio },
];

export interface Crumb {
  label: string;
  to?: string;
}

// Shared breadcrumb — styled to match the storefront Cart page's breadcrumb
// (text-base, gray-500 links with hover underline, w-4 chevrons, current page in
// bold gray-800). Rendered at the top of every analytics page so the header
// height is identical page-to-page. The last crumb is the current page (not a link).
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-base text-gray-500">
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-4 w-4 shrink-0" />}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-gray-800" : ""}>{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function AnalyticsLayout({
  title,
  description,
  filterBar,
  actions,
  children,
}: {
  title: string;
  description?: string;
  filterBar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  // Preserve the active query string (date range + filters) when switching tabs,
  // so a chosen window carries across the whole platform.
  const search = location.search;

  useEffect(() => {
    document.title = `${title} · Analytics | Lil Edit`;
  }, [title]);

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <UserNavbar />

      <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-[120px] md:px-8 md:pt-[132px]">
        {/* Breadcrumb — always present so header height is uniform across pages.
            mt-[18px]/mb-5 match the Cart page's breadcrumb rhythm exactly
            (its mt-1.5+pt-3 = 18px above, mb-3+pb-2 = 20px below). */}
        <div className="mt-[18px] mb-5">
          <Breadcrumb
            trail={[
              { label: "Home", to: "/" },
              { label: "Analytics", to: `/admin/analytics${search}` },
              { label: title },
            ]}
          />
        </div>

        {/* Section heading — matches every other admin sub-page's header exactly
            (User Activity, Admin Activity, Order Management, …): a small "Admin"
            eyebrow label, a text-3xl bold title, and a gray-500 subtitle. */}
        <div className="space-y-1 mb-8">
          <div className="flex items-center min-h-[36px] sm:min-h-[46px]">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
              Admin
            </p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 pt-[10px] md:pt-0">Analytics</h1>
          <p className="text-sm text-gray-500">Business intelligence for The Lil Edit</p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar nav (desktop) / equal-size button grid (mobile — no horizontal
              swipe-to-scroll; every section is reachable without a gesture). A CSS
              grid (not flex-wrap) is what actually guarantees every button is the
              same size regardless of label length ("Overview" vs "Cart") — a
              flex-wrap row only sizes each pill to its own content. Desktop swaps
              back to a flex column, where items already stretch to the sidebar's
              full width by default. */}
          <nav className="lg:w-52 lg:shrink-0">
            <ul className="grid grid-cols-3 gap-1.5 lg:flex lg:flex-col lg:gap-0.5 lg:sticky lg:top-[140px]">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={{ pathname: item.to, search }}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center justify-center gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors lg:justify-start",
                          isActive
                            ? "border-transparent text-white"
                            : "border-gray-400 text-gray-600 hover:border-gray-500 hover:bg-white hover:text-gray-900"
                        )
                      }
                      style={({ isActive }) => (isActive ? { backgroundColor: ACCENT } : undefined)}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="h-4 w-4 shrink-0" style={{ color: isActive ? "#fff" : "#9CA3AF" }} />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Main content */}
          <main className="min-w-0 flex-1">
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                  {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
                </div>
                {actions}
              </div>
              {filterBar}
            </div>
            {children}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// A titled section band used to group KPI rows / charts within a page.
export function Section({ title, hint, children, right }: { title?: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h3>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// Responsive KPI grid wrapper.
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}
