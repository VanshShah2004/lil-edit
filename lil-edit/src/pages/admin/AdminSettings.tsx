import { Link } from "react-router-dom";
import {
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

      <main className="flex-1 px-6 lg:px-12 py-10">
        <div className="max-w-screen-2xl mx-auto space-y-10">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">
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
                        className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50 cursor-not-allowed"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-400">{tile.label}</p>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Soon</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{tile.description}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={tile.label}
                      to={tile.to}
                      className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{tile.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tile.description}</p>
                      </div>
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
