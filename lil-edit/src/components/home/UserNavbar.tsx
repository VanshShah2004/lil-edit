import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
import MegaMenu from "@/components/MegaMenu";
import SearchPanel from "@/components/search/SearchPanel";

const UserNavbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileCloseTimeoutRef = useRef<number | null>(null);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hideMegaMenu = location.pathname.startsWith("/product") || location.pathname.startsWith("/profile");
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
    { to: "/profile", label: "Profile", icon: User, adminOnly: false },
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
    return () => {
      if (profileCloseTimeoutRef.current) {
        window.clearTimeout(profileCloseTimeoutRef.current);
      }
    };
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
      className={`fixed top-0 left-0 right-0 z-50 border-b border-border/70 transition-all duration-300 ${isScrolled ? "bg-background/95 backdrop-blur-lg shadow-sm" : "bg-background/90 backdrop-blur-md"
        }`}
    >
      <div className="container mx-auto flex items-center justify-between h-[5rem] md:h-[3.5rem] lg:h-[4rem] px-3 sm:px-4 lg:px-8">
        <Link to="/dashboard" className="flex-shrink flex items-center gap-2 sm:gap-3 min-w-0">
          <img src={logo} alt="The Lil Edit" className="h-10 sm:h-12 md:h-10 lg:h-11 w-auto shrink-0" />
          <div className="text-xl sm:text-xl md:text-[20px] lg:text-[22px] text-foreground leading-none truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
            The Lil Edit
          </div>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-2 md:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="h-10 w-10 sm:h-10 sm:w-10 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
            aria-label="Search"
          >
            <Search className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
          <button className="h-10 w-10 sm:h-10 sm:w-10 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </button>

          <div
            ref={profileMenuRef}
            className="relative"
            onMouseEnter={() => {
              if (window.innerWidth >= 768) {
                if (profileCloseTimeoutRef.current) {
                  window.clearTimeout(profileCloseTimeoutRef.current);
                  profileCloseTimeoutRef.current = null;
                }
                setIsProfileOpen(true);
              }
            }}
            onMouseLeave={() => {
              if (window.innerWidth >= 768) {
                profileCloseTimeoutRef.current = window.setTimeout(() => {
                  setIsProfileOpen(false);
                  profileCloseTimeoutRef.current = null;
                }, 180);
              }
            }}
          >
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              type="button"
              aria-label="Open profile menu"
              className="h-11 w-11 sm:h-11 sm:w-11 rounded-full border-2 border-teal-600 bg-gradient-to-br from-[#F8FFFE] via-[#F1FEFB] to-[#E9FCF8] text-[#0F766E] shadow-[0_4px_14px_rgba(13,148,136,0.14)] p-[2px] flex items-center justify-center transition-all duration-200 hover:from-[#F2FFFD] hover:via-[#E9FCF8] hover:to-[#DEFAF4] hover:border-teal-600 hover:shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/45 focus-visible:ring-offset-1"
            >
              <div className="px-0.5 py-[1px] text-[1.15rem] sm:text-[1.2rem] font-black font-display leading-none text-teal-600">
                {userInitial}
              </div>
            </button>

            {isProfileOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-background rounded-xl shadow-lg border border-border py-2 animate-in fade-in slide-in-from-top-2"
                onMouseEnter={() => {
                  if (window.innerWidth >= 768) {
                    if (profileCloseTimeoutRef.current) {
                      window.clearTimeout(profileCloseTimeoutRef.current);
                      profileCloseTimeoutRef.current = null;
                    }
                    setIsProfileOpen(true);
                  }
                }}
              >
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
      {!hideMegaMenu && <MegaMenu />}

      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
};

export default UserNavbar;
