import { Fragment, type ReactNode, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Activity,
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

// Shared breadcrumb. Rendered at the very top of every analytics page so the
// header height is identical page-to-page (the space is always reserved). The
// last crumb is the current page (not a link).
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex h-5 items-center gap-1.5 text-xs">
      {trail.map((crumb, i) => (
        <Fragment key={`${crumb.label}-${i}`}>
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" />}
          {crumb.to && i < trail.length - 1 ? (
            <Link to={crumb.to} className="text-gray-400 transition-colors hover:text-gray-700">
              {crumb.label}
            </Link>
          ) : (
            <span className={i === trail.length - 1 ? "font-semibold text-gray-600" : "text-gray-400"}>{crumb.label}</span>
          )}
        </Fragment>
      ))}
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
        {/* Section heading */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(15,118,110,0.1)" }}>
            <Activity className="h-5 w-5" style={{ color: ACCENT }} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">Analytics</h1>
            <p className="text-xs text-gray-400">Business intelligence for The Lil Edit</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar nav (desktop) / horizontal scroll (mobile) */}
          <nav className="lg:w-52 lg:shrink-0">
            <ul className="flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-[140px] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to} className="shrink-0">
                    <NavLink
                      to={{ pathname: item.to, search }}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive ? "text-white" : "text-gray-600 hover:bg-white hover:text-gray-900"
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
