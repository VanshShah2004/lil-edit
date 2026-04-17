import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";

const UserNavbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const firstNameCandidate =
    (typeof metadata.first_name === "string" && metadata.first_name.trim()) ||
    (typeof metadata.given_name === "string" && metadata.given_name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim().split(/\s+/)[0]) ||
    (typeof metadata.name === "string" && metadata.name.trim().split(/\s+/)[0]) ||
    user?.email?.split("@")[0] ||
    "U";
  const userInitial = firstNameCandidate.charAt(0).toUpperCase();
  const role = profile?.role ?? "customer";
  const isAdmin = role === "admin";
  const dashboardMenuItems = [
    { to: "#", label: "Profile", icon: User, adminOnly: false },
    { to: "#", label: "Orders", icon: Package, adminOnly: false },
    // Keep this role-aware list so admin-only options can be expanded easily.
    { to: "#", label: "Admin Panel", icon: LayoutDashboard, adminOnly: true },
    { to: "#", label: "Admin Settings", icon: Settings, adminOnly: true },
  ];
  const visibleMenuItems = dashboardMenuItems.filter((item) => !item.adminOnly || isAdmin);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-border/70 transition-all duration-300 ${
        isScrolled ? "bg-background/95 backdrop-blur-lg shadow-sm" : "bg-background/90 backdrop-blur-md"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between h-20 px-4 lg:px-8">
        <Link to="/dashboard" className="flex-shrink-0 flex items-center gap-3">
          <img src={logo} alt="The Lil Edit" className="h-16 w-auto" />
          <div className="text-4xl text-foreground leading-none" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            The Lil Edit
          </div>
        </Link>

        <nav className="hidden md:flex flex-1 items-center justify-center gap-8 px-6">
          {["NEW ARRIVALS", "BEST SELLERS","ETHNIC WEAR", "ACCESSORIES"].map((item) => (
            <Link key={item} to="#" className="text-xs lg:text-sm font-semibold tracking-wide text-foreground/80 hover:text-primary transition-colors">
              {item}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <button className="h-9 w-9 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">1</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="h-9 pl-1.5 pr-2 rounded-full border border-border bg-background flex items-center gap-2 hover:bg-secondary transition-colors"
            >
              <div className="flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/30 font-semibold font-display">
                  {userInitial}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground self-center" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-background rounded-xl shadow-lg border border-border py-2 animate-in fade-in slide-in-from-top-2">
                {isAdmin && (
                  <>
                    <div className="px-4 py-2 text-xs text-muted-foreground">
                      Signed in as <span className="font-semibold text-foreground">Admin</span>
                    </div>
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                    >
                      <Icon className="w-4 h-4" /> {item.label}
                      {item.adminOnly && <Shield className="w-3.5 h-3.5 ml-auto text-primary" />}
                    </Link>
                  );
                })}
                <div className="h-px bg-border my-1" />
                <button
                  onClick={async () => {
                    try {
                      setIsProfileOpen(false);
                      await signOut();
                      navigate("/");
                    } catch (err) {
                      console.error("Logout failed", err);
                    }
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </header>
  );
};

export default UserNavbar;
