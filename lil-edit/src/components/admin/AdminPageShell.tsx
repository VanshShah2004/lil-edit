// Shared chrome for single-purpose admin pages (Newsletter, Coupons, Reviews).
// Mirrors the General Settings page structure — UserNavbar, breadcrumb/eyebrow header,
// gradient rule, gray content main, Footer — so a panel lifted out of General Settings
// into its own page keeps looking like it belongs.
//
// Panels rendered as children keep their own <section> heading; the h1 here names the
// page, the section heading names the block. That's the same two-level arrangement
// General Settings used, minus the sibling sections.
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";

const ACCENT = "#B19CD9";

interface AdminPageShellProps {
  /** Page title — drives the breadcrumb tail, the h1 and the document title. */
  title: string;
  /** One-line description shown under the title. */
  subtitle?: string;
  children: ReactNode;
}

const AdminPageShell = ({ title, subtitle, children }: AdminPageShellProps) => {
  useEffect(() => {
    document.title = `${title} | Lil Edit`;
  }, [title]);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/admin/settings-panel" className="hover:underline">
                Settings Panel
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">{title}</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Admin
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
          <hr className="-mx-3 lg:-mx-6 h-1 border-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 pt-4 pb-24 bg-gray-100">
        <div className="max-w-4xl sm:max-w-3xl mx-auto pt-4 space-y-6">{children}</div>
      </main>

      <Footer />
    </div>
  );
};

export default AdminPageShell;
