import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Mail,
  MessageSquareText,
  Plus,
  Ruler,
  Settings,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Tag,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";

const ACCENT = "#B19CD9";

interface AdminSettingsTile {
  to: string;
  label: string;
  description: string;
  icon: typeof Plus;
  comingSoon?: boolean;
}

interface AdminSettingsGroup {
  title: string;
  tiles: AdminSettingsTile[];
}

const groups: AdminSettingsGroup[] = [
  {
    title: "Platform",
    tiles: [
      { to: "/admin/general-settings", label: "General Settings", description: "Admin access, charges and site availability", icon: Settings },
    ],
  },
  {
    title: "Marketing",
    tiles: [
      { to: "/admin/newsletter", label: "Newsletter", description: "View subscribers and download the list", icon: Mail },
      { to: "/admin/coupons", label: "Coupons", description: "Create and manage discount codes", icon: Tag },
    ],
  },
  {
    title: "Product Management",
    tiles: [
      { to: "/admin/add-product", label: "Add Product", description: "Create a new listing", icon: Plus },
      { to: "/admin/manage-products", label: "Manage Products", description: "Edit or remove existing listings", icon: Shirt },
    ],
  },
  {
    title: "Order Management",
    tiles: [
      { to: "/admin/orders", label: "Manage Orders", description: "Track and fulfill customer orders", icon: ClipboardList },
    ],
  },
  {
    title: "Content Management",
    tiles: [
      { to: "/admin/spotlight", label: "The Spotlight", description: "Curate storefront sections and tiles", icon: LayoutGrid },
      { to: "/admin/size-charts", label: "Sizing Chart Setup", description: "Create and edit sizing charts", icon: Ruler },
      { to: "/admin/reviews", label: "Reviews", description: "Moderate customer reviews", icon: MessageSquareText },
    ],
  },
  {
    title: "Future Expansion",
    tiles: [
      { to: "#", label: "Roles & Permissions", description: "Manage staff access levels", icon: ShieldCheck, comingSoon: true },
      { to: "#", label: "Analytics", description: "Store performance insights", icon: BarChart3, comingSoon: true },
      { to: "#", label: "Site Configuration", description: "Storefront-wide settings", icon: SlidersHorizontal, comingSoon: true },
    ],
  },
];

const AdminSettings = () => {
  useEffect(() => {
    document.title = "Admin Settings | Lil Edit";
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">Admin Settings</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Admin
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Admin Settings</h1>
            <p className="text-sm text-gray-500">Manage products, orders, and storefront content from one place.</p>
          </div>
          <hr className="-mx-3 lg:-mx-6 h-1 border-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 py-10 bg-gray-50">
        <div className="max-w-screen-2xl mx-auto space-y-12">
          {groups.map((group) => (
            <section key={group.title}>
              <div className="flex items-center gap-4 mb-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-700 shrink-0">
                  {group.title}
                </h2>
                <div className="flex-1 h-px bg-gray-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.tiles.map((tile) => {
                  const Icon = tile.icon;
                  if (tile.comingSoon) {
                    return (
                      <div
                        key={tile.label}
                        aria-disabled="true"
                        className="relative flex items-start gap-4 p-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 cursor-not-allowed overflow-hidden"
                      >
                        <div className="w-11 h-11 rounded-xl bg-gray-200/70 text-gray-400 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[15px] font-semibold text-gray-500">{tile.label}</p>
                            <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                              Soon
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{tile.description}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={tile.label}
                      to={tile.to}
                      className="group relative flex items-start gap-4 p-5 rounded-2xl border border-gray-400 bg-white overflow-hidden shadow-[0_4px_12px_-2px_rgba(16,24,40,0.12),0_2px_4px_-1px_rgba(16,24,40,0.08)] ring-1 ring-transparent hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-8px_rgba(177,156,217,0.55)] hover:border-transparent hover:ring-[#B19CD9] transition-all duration-200"
                    >
                      {/* Animated left accent bar */}
                      <span
                        className="absolute left-0 top-0 h-full w-1 origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-200"
                        style={{ backgroundColor: ACCENT }}
                      />
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3"
                        style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-gray-900 group-hover:text-[#6B5B95] transition-colors">{tile.label}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tile.description}</p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-gray-300 shrink-0 transition-all duration-200 group-hover:text-[#B19CD9] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AdminSettings;
