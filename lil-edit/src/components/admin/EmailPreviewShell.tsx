// Shared chrome for the admin email-preview pages (Order Confirmation, Status Change).
// Mirrors the standard admin page structure (UserNavbar + MegaMenu, breadcrumb/eyebrow
// header, gray content main, Footer) used by General Settings, and owns the
// mobile/desktop device toggle that frames whatever email card each page supplies.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Monitor, Smartphone } from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";

const ACCENT = "#B19CD9";

interface EmailPreviewShellProps {
  /** Page title, e.g. "Order Confirmation" — drives the header + document title. */
  title: string;
  /** One-line description shown under the title. */
  subtitle?: string;
  /** The email's subject line, shown in the mock inbox subject bar. */
  subject: string;
  /** Optional controls rendered above the preview, left of the device toggle (e.g. status tabs). */
  controls?: ReactNode;
  /** Renders the email card for a given view: pass maxWidth 380 in mobile, full-width in desktop. */
  children: (view: "mobile" | "desktop") => ReactNode;
}

const toggleClass = (active: boolean) =>
  `rounded-full border p-2 transition ${
    active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-500"
  }`;

const SubjectBar = ({ subject, className }: { subject: string; className: string }) => (
  <div className={className}>
    <span className="shrink-0 text-gray-500">Subject:</span>
    <span className="font-semibold text-gray-900">{subject}</span>
  </div>
);

const EmailPreviewShell = ({ title, subtitle, subject, controls, children }: EmailPreviewShellProps) => {
  const [view, setView] = useState<"mobile" | "desktop">("mobile");

  useEffect(() => {
    document.title = `${title} · Email Preview | Lil Edit`;
  }, [title]);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      {/* Page header — matches the General Settings admin page structure. */}
      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/admin/general-settings" className="hover:underline">
                General Settings
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">{title}</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Email Preview
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
          <hr className="-mx-3 lg:-mx-6 border-t border-foreground/50" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 pt-6 pb-24 bg-gray-100">
        <div className="mx-auto max-w-[900px]">
          {/* Control bar: page-specific controls (left) + device toggle (right). */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">{controls}</div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setView("mobile")} aria-label="Mobile view" title="Mobile view" className={toggleClass(view === "mobile")}>
                <Smartphone className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setView("desktop")} aria-label="Desktop view" title="Desktop view" className={toggleClass(view === "desktop")}>
                <Monitor className="h-4 w-4" />
              </button>
            </div>
          </div>

          {view === "mobile" ? (
            <div className="mx-auto max-w-[380px]">
              {/* Phone frame */}
              <div className="rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl">
                <div className="rounded-[1.6rem] overflow-hidden bg-white">
                  <SubjectBar subject={subject} className="flex gap-1.5 border-b border-gray-200 bg-white px-4 py-2.5 text-[12px] leading-snug" />
                  <div style={{ background: "#f6f6f8", maxHeight: "70vh", overflowY: "auto" }}>{children("mobile")}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-sm border border-gray-300 bg-white shadow-sm">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-3 truncate rounded bg-white px-3 py-1 text-[11px] text-gray-500 border border-gray-200">
                  mail.google.com/mail/u/0/#inbox
                </span>
              </div>
              <SubjectBar subject={subject} className="flex gap-2 border-b border-gray-200 bg-white px-6 py-3 text-[13px]" />
              <div style={{ background: "#f6f6f8", padding: "8px 12px", maxHeight: "70vh", overflowY: "auto" }}>{children("desktop")}</div>
            </div>
          )}
        </div>
      </main>

      <div className="border-t border-gray-400" />
      <Footer />
    </div>
  );
};

export default EmailPreviewShell;
