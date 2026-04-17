import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
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
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
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
          <div className="text-4xl text-foreground leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
            The Lil Edit
          </div>
        </Link>

        <nav className="hidden md:flex flex-1 items-center justify-center gap-10 lg:gap-12 px-6">
          {["NEW ARRIVALS","GIRLS","BOYS","TRENDING","BY OCCASSION"].map((item) => (
            <Link key={item} to="#" className="text-sm lg:text-base font-bold tracking-wide text-foreground hover:text-primary transition-colors">
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
          </button>

          <div ref={profileMenuRef} className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              type="button"
              aria-label="Open profile menu"
              className="h-11 w-11 rounded-full border-2 border-primary bg-gradient-to-br from-[#FCFAFF] via-[#F6F1FF] to-[#F0E8FF] text-[#4B2B7F] shadow-[0_4px_14px_rgba(111,74,166,0.18)] flex items-center justify-center transition-all duration-200 hover:from-[#F7F1FF] hover:via-[#EFE5FF] hover:to-[#E8DBFF] hover:border-primary hover:shadow-[0_8px_18px_rgba(111,74,166,0.28)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1"
            >
              <div className="text-[1.4rem] font-black font-display leading-none text-primary">
                {userInitial}
              </div>
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
