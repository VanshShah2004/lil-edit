import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Plus,
  Settings,
  Shirt,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from "lucide-react";

interface AdminMenuItem {
  to: string;
  label: string;
  icon: typeof User;
  comingSoon?: boolean;
}

interface AdminMenuSection {
  title: string;
  items: AdminMenuItem[];
}

const sections: AdminMenuSection[] = [
  {
    title: "Product Management",
    items: [
      { to: "/admin/add-product", label: "Add Product", icon: Plus },
      { to: "/admin/manage-products", label: "Manage Products", icon: Shirt },
    ],
  },
  {
    title: "Order Management",
    items: [{ to: "/admin/orders", label: "Manage Orders", icon: ClipboardList }],
  },
  {
    title: "Content Management",
    items: [{ to: "/admin/spotlight", label: "The Spotlight", icon: LayoutGrid }],
  },
  {
    title: "Platform",
    items: [{ to: "/admin/general-settings", label: "General Settings", icon: Settings }],
  },
  {
    title: "Future Expansion",
    items: [
      { to: "#", label: "Roles & Permissions", icon: ShieldCheck, comingSoon: true },
      { to: "#", label: "Analytics", icon: BarChart3, comingSoon: true },
      { to: "#", label: "Site Configuration", icon: SlidersHorizontal, comingSoon: true },
    ],
  },
];

interface AdminSettingsPanelProps {
  onBack: () => void;
  onNavigate: () => void;
}

const AdminSettingsPanel = ({ onBack, onNavigate }: AdminSettingsPanelProps) => {
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors sticky top-0 bg-background z-10 border-b border-border/70"
      >
        <ArrowLeft className="w-4 h-4" /> Admin Settings
      </button>

      {sections.map((section) => (
        <div key={section.title} className="py-1.5">
          <div className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </div>
          {section.items.map((item) => {
            const Icon = item.icon;
            if (item.comingSoon) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground/60 cursor-not-allowed"
                  aria-disabled="true"
                >
                  <Icon className="w-4 h-4" /> {item.label}
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
                    Soon
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onNavigate}
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
              >
                <Icon className="w-4 h-4" /> {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default AdminSettingsPanel;
