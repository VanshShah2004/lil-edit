import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ClipboardList, LayoutDashboard, LayoutGrid, Plus, Shirt } from "lucide-react";

const ACCENT = "#0F766E";

const TABS = [
  { to: "/admin/settings", label: "Admin Page", icon: LayoutDashboard, section: "Admin Settings" },
  { to: "/admin/add-product", label: "Add Product", icon: Plus, section: "Catalog Management" },
  { to: "/admin/manage-products", label: "Manage Products", icon: Shirt, section: "Catalog Management" },
  { to: "/admin/orders", label: "Manage Orders", icon: ClipboardList, section: "Order Management" },
  { to: "/admin/spotlight", label: "The Spotlight", icon: LayoutGrid, section: "Content Management" },
];

const AdminSubNav = () => {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeTab = TABS.find((tab) => pathname.startsWith(tab.to)) ?? TABS[0];
  const ActiveIcon = activeTab.icon;

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    // Full-width overlay so the trigger shares each page's content container
    // (max-w-screen-2xl + px-6/lg:px-12) and stays right-aligned with the page
    // body at every breakpoint. The bar ignores pointer events; only the trigger
    // re-enables them so it never blocks the header sitting beneath it.
    <div className="pointer-events-none absolute inset-x-0 top-[150px] md:top-[128px] z-40">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 flex justify-end">
        <div ref={containerRef} className="pointer-events-auto relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`group flex items-center gap-1.5 sm:gap-2.5 w-48 sm:w-64 shrink-0 pl-1.5 pr-2.5 py-1.5 sm:pl-2 sm:pr-4 sm:py-2 rounded-xl font-display text-[13px] sm:text-[17px] font-bold tracking-wide border-2 border-gray-300 bg-white text-gray-900 shadow-[0_8px_24px_rgb(0,0,0,0.12)] hover:shadow-[0_12px_32px_rgb(0,0,0,0.18)] hover:border-gray-400 transition-all ${isOpen ? "border-gray-400 shadow-[0_12px_32px_rgb(0,0,0,0.18)]" : ""}`}
          >
            <span className="flex-1 flex items-center justify-center gap-2 sm:gap-2.5 min-w-0">
              <span
                className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg shrink-0"
                style={{ backgroundColor: "rgba(15,118,110,0.1)" }}
              >
                <ActiveIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: ACCENT }} />
              </span>
              <span className="whitespace-nowrap">{activeTab.label}</span>
            </span>
            <ChevronDown className={`w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 shrink-0 text-gray-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-full bg-white rounded-xl shadow-[0_16px_44px_rgb(0,0,0,0.14)] border border-gray-200 overflow-hidden z-50 p-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.to === activeTab.to;
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2.5 sm:gap-3 px-2 py-2.5 sm:px-2.5 sm:py-3 rounded-lg transition-colors ${isActive ? "" : "hover:bg-gray-50"}`}
                    style={isActive ? { backgroundColor: ACCENT } : undefined}
                  >
                    <span
                      className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg shrink-0"
                      style={{ backgroundColor: isActive ? "rgba(255,255,255,0.18)" : "rgba(15,118,110,0.08)" }}
                    >
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: isActive ? "#FFFFFF" : ACCENT }} />
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className="font-display text-[13px] sm:text-[15px] font-semibold tracking-wide leading-tight truncate"
                        style={{ color: isActive ? "#FFFFFF" : "#1F2937" }}
                      >
                        {tab.label}
                      </span>
                      <span
                        className="text-[10px] sm:text-[12px] font-medium normal-case tracking-normal leading-tight truncate"
                        style={{ color: isActive ? "rgba(255,255,255,0.75)" : "#9CA3AF" }}
                      >
                        {tab.section}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSubNav;
