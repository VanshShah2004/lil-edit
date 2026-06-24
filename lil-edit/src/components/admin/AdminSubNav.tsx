import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ClipboardList, LayoutGrid, Plus, Shirt } from "lucide-react";

const ACCENT = "#0F766E";

const TABS = [
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
    <div ref={containerRef} className="absolute top-[160px] md:top-[128px] right-[10px] md:right-[55px] z-40">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 sm:gap-2.5 w-40 sm:w-52 shrink-0 px-2 py-1.5 sm:px-4 sm:py-2.5 rounded-md font-display text-[11px] sm:text-[15px] font-bold tracking-wide border-2 border-gray-300 bg-gray-50 text-gray-900 shadow-md hover:bg-gray-100 hover:shadow-lg transition-all"
      >
        <span className="flex-1 flex items-center justify-center gap-1 sm:gap-2.5 min-w-0">
          <ActiveIcon className="w-3 h-3 sm:w-4.5 sm:h-4.5 shrink-0" style={{ color: ACCENT }} />
          <span className="truncate">{activeTab.label}</span>
        </span>
        <ChevronDown className={`w-3 h-3 sm:w-4.5 sm:h-4.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-40 sm:w-52 bg-white rounded-md shadow-lg border border-gray-400 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1">
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = tab.to === activeTab.to;
            return (
              <div key={tab.to}>
                {index > 0 && <div className="h-px bg-gray-400" />}
                <Link
                  to={tab.to}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-1.5 sm:gap-3 px-2.5 py-3.5 sm:px-4 sm:py-5 transition-colors hover:bg-gray-50"
                  style={isActive ? { backgroundColor: "#0E857B" } : undefined}
                >
                  <Icon className="w-3 h-3 sm:w-5 sm:h-5 shrink-0" style={{ color: isActive ? "#FFFFFF" : "#374151" }} />
                  <span className="flex flex-col gap-1 min-w-0">
                    <span
                      className="text-[10px] sm:text-[15px] font-semibold tracking-wide leading-tight truncate"
                      style={{ color: isActive ? "#FFFFFF" : "#374151" }}
                    >
                      {tab.label}
                    </span>
                    <span className="text-[10px] sm:text-sm font-medium normal-case tracking-normal leading-tight truncate" style={{ color: isActive ? "rgba(255,255,255,0.8)" : "#9CA3AF" }}>
                      {tab.section}
                    </span>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminSubNav;
