import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Plus,
  Settings,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import AdminSubNav from "@/components/admin/AdminSubNav";

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
    ],
  },
  {
    title: "Future Expansion",
    tiles: [
      { to: "#", label: "Admin Settings General", description: "General platform configuration", icon: Settings, comingSoon: true },
      { to: "#", label: "Roles & Permissions", description: "Manage staff access levels", icon: ShieldCheck, comingSoon: true },
      { to: "#", label: "Analytics", description: "Store performance insights", icon: BarChart3, comingSoon: true },
      { to: "#", label: "Site Configuration", description: "Storefront-wide settings", icon: SlidersHorizontal, comingSoon: true },
    ],
  },
];

const AdminSettings = () => {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[160px] md:pt-[128px] bg-white border-b border-gray-100 pb-8">
        <AdminSubNav />
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 space-y-1">
          <div className="flex items-center min-h-[36px] sm:min-h-[46px]">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
              Admin
            </p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Admin Settings</h1>
          <p className="text-sm text-gray-500">Manage products, orders, and storefront content from one place.</p>
        </div>
      </div>

      <main className="flex-1 px-6 lg:px-12 py-10 bg-gray-50">
        <div className="max-w-screen-2xl mx-auto space-y-10">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-700 mb-3">
                {group.title}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.tiles.map((tile) => {
                  const Icon = tile.icon;
                  if (tile.comingSoon) {
                    return (
                      <div
                        key={tile.label}
                        aria-disabled="true"
                        className="flex items-start gap-3.5 p-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 cursor-not-allowed"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gray-200/80 text-gray-400 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-500">{tile.label}</p>
                            <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                              Soon
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{tile.description}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={tile.label}
                      to={tile.to}
                      className="group relative flex items-start gap-3.5 p-5 rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-transparent hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(177,156,217,0.45)] hover:border-transparent hover:ring-[#B19CD9] transition-all duration-200"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{tile.label}</p>
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
