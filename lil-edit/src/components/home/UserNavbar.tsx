import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Heart,
  Home,
  LogOut,
  Package,
  Search,
  ShieldCheck,
  ShoppingCart,
  User,
  Menu,
  X,
  Shirt,
  Info,
  Settings,
  Sparkles,
  ClipboardList,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import logo from "@/assets/logo.png";
import MegaMenu from "@/components/MegaMenu";
import SearchPanel from "@/components/search/SearchPanel";

const UserNavbar = () => {
  const [, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileCloseTimeoutRef = useRef<number | null>(null);
  const { user, profile, signOut } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const hideMegaMenu = false;
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
  // Level 1 stays minimal: everyday account actions, an admin entry point
  // that navigates to the full Admin Settings page, then logout.
  const accountMenuItems = [
    { to: "/profile", label: "Profile", icon: User },
    { to: "/orders", label: "My Orders", icon: Package },
    { to: "/reviews", label: "My Reviews", icon: MessageSquare },
  ];

  const closeProfileMenu = () => setIsProfileOpen(false);


  useLayoutEffect(() => {
    const updateHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        document.documentElement.style.setProperty("--navbar-height", `${height}px`);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

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
        closeProfileMenu();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  // Side menu: lock body scroll while open and close on Escape.
  useEffect(() => {
    if (!isLeftMenuOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLeftMenuOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isLeftMenuOpen]);



  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 border-b border-border transition-all duration-300 bg-background shadow-sm`}
      >
        <div className="container mx-auto flex items-center justify-between h-[5rem] md:h-[3.1rem] lg:h-[3.4rem] px-3 sm:px-4 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIsLeftMenuOpen(true);
                setIsSearchOpen(false);
              }}
              className="p-1 -ml-1 text-foreground hover:bg-secondary rounded-md transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
            <Link to="/dashboard" className="flex-shrink flex items-center gap-2 sm:gap-3 min-w-0">
              <img src={logo} alt="The Lil Edit" className="h-10 sm:h-12 md:h-9 lg:h-9.5 w-auto shrink-0" />
              <div className="hidden min-[430px]:block text-xl md:text-[18px] lg:text-[20px] text-foreground leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
                The Lil Edit
              </div>
            </Link>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 sm:gap-2 md:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(true);
                setIsLeftMenuOpen(false);
              }}
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-300 bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
              aria-label="Search"
            >
              <Search className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/wishlist")}
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-300 bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
              aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ""}`}
            >
              <Heart className="w-5 h-5" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold leading-none px-[3px]">
                  {wishlistCount > 99 ? "99+" : wishlistCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/cart")}
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-300 bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
              aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#0F766E] text-white text-[10px] font-bold leading-none px-[3px]">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
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
                    closeProfileMenu();
                    profileCloseTimeoutRef.current = null;
                  }, 180);
                }
              }}
            >
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setIsLeftMenuOpen(false);
                  setIsProfileOpen((prev) => !prev);
                }}
                type="button"
                aria-label="Open profile menu"
                className="h-11 w-11 sm:h-11 sm:w-11 md:h-10 md:w-10 rounded-full border-2 border-teal-700 sm:border-teal-600 bg-gradient-to-br from-[#F8FFFE] via-[#F1FEFB] to-[#E9FCF8] text-[#0F766E] shadow-[0_4px_14px_rgba(13,148,136,0.14)] p-[2px] flex items-center justify-center transition-all duration-200 hover:from-[#F2FFFD] hover:via-[#E9FCF8] hover:to-[#DEFAF4] hover:border-teal-700 sm:hover:border-teal-600 hover:shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/45 sm:focus-visible:ring-teal-600/45 focus-visible:ring-offset-1"
              >
                <div className="px-0.5 py-[1px] text-[1.15rem] sm:text-[1.2rem] font-black font-display leading-none text-teal-700 sm:text-teal-600">
                  {userInitial}
                </div>
              </button>

              {isProfileOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-background rounded-xl shadow-lg border border-border py-2 animate-in fade-in slide-in-from-top-2 overflow-hidden"
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
                    <div className="px-4 py-2 text-xs text-muted-foreground">
                      Signed in as <span className="font-semibold text-foreground">Admin</span>
                    </div>
                  )}
                  {accountMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        to={item.to}
                        onClick={closeProfileMenu}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                      >
                        <Icon className="w-4 h-4" /> {item.label}
                      </Link>
                    );
                  })}
                  {isAdmin && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <div className="px-4 pt-1 pb-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Admin
                      </div>
                      <Link
                        to="/admin/settings"
                        onClick={closeProfileMenu}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" /> Admin Settings
                      </Link>
                      <Link
                        to="/admin/activity"
                        onClick={closeProfileMenu}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                      >
                        <Activity className="w-4 h-4" /> User Activity
                      </Link>
                    </>
                  )}
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={async () => {
                      try {
                        closeProfileMenu();
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

      {/* Left Menu Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${isLeftMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setIsLeftMenuOpen(false)}
        aria-hidden={!isLeftMenuOpen}
      />

      {/* Left Menu Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className={`fixed top-0 left-0 bottom-0 z-[70] w-80 max-w-[88vw] bg-background shadow-2xl border-r border-border transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex flex-col ${isLeftMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Header — branded gradient band with greeting + avatar */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-teal/12 via-[#E8DDF7]/45 to-emerald-50 border-b border-foreground px-5 pt-7 pb-6">
          <div className="h-1.5 w-full absolute top-0 left-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
          <button
            type="button"
            onClick={() => setIsLeftMenuOpen(false)}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground hover:bg-white/60 rounded-full transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-2 border-teal-600 bg-gradient-to-br from-[#F8FFFE] to-[#E9FCF8] text-teal-700 shadow-sm flex items-center justify-center font-display text-2xl font-black shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F766E]">Welcome back</p>
              <p className="font-display text-xl md:text-lg font-extrabold text-foreground truncate leading-tight">
                {firstNameCandidate === "U" ? "User" : firstNameCandidate}
                {isAdmin && (
                  <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wider text-white bg-[#0F766E] rounded-full px-2 py-0.5">
                    Admin
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col flex-1 py-2 overflow-y-hidden md:overflow-y-auto">
          <SideSection label="Front Row">
            <SideLink to="/dashboard" icon={Home} label="Home" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
            <SideLink to="/collections" icon={Shirt} label="Collections" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
            <SideLink to="/about" icon={Info} label="About Us" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
          </SideSection>

          <SideSection label="Your Closet">
            <SideLink to="/wishlist" icon={Heart} label="Wishlist" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} badge={wishlistCount} badgeClass="bg-primary" />
            <SideLink to="/cart" icon={ShoppingCart} label="Cart" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} badge={cartCount} badgeClass="bg-[#0F766E]" />
            <SideLink to="/orders" icon={Package} label="My Orders" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
            <SideLink to="/reviews" icon={MessageSquare} label="My Reviews" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
          </SideSection>

          {isAdmin && (
            <SideSection label="Backstage">
              <SideLink to="/admin/settings" icon={ShieldCheck} label="Admin Settings" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
              <SideLink to="/admin/manage-products" icon={Settings} label="Manage Products" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
              <SideLink to="/admin/orders" icon={ClipboardList} label="All Orders" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
              <SideLink to="/admin/spotlight" icon={Sparkles} label="The Spotlight" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
            </SideSection>
          )}

          <SideSection label="You">
            <SideLink to="/profile" icon={User} label="Profile" pathname={location.pathname} onClick={() => setIsLeftMenuOpen(false)} />
          </SideSection>
        </nav>

        {/* Logout — pinned footer */}
        <div className="px-3 py-2 border-t border-foreground">
          <button
            type="button"
            onClick={async () => {
              try {
                setIsLeftMenuOpen(false);
                await signOut();
                navigate("/");
              } catch (err) {
                console.error("Logout failed", err);
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-1.5 md:py-1 rounded-lg text-destructive hover:bg-destructive/10 transition-colors font-medium text-sm md:text-xs"
          >
            <LogOut className="w-5 h-5 md:w-3.5 md:h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        {/* Bottom accent strip — mirrors the one atop the header */}
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
      </aside>
    </>
  );
};

// Uppercase, tracked section label with grouped links beneath it.
function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-3 pt-2.5 md:pt-2 pb-1.5 border-t border-foreground/55 first:border-t-0 first:pt-1">
      <p className="px-3 py-1.5 mb-1 font-display text-base md:text-sm font-black uppercase tracking-[0.16em] text-foreground/85">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// A single nav row. Highlights when its route is active and supports an
// optional count badge (cart / wishlist).
function SideLink({
  to,
  icon: Icon,
  label,
  pathname,
  onClick,
  badge,
  badgeClass = "bg-primary",
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  pathname: string;
  onClick: () => void;
  badge?: number;
  badgeClass?: string;
}) {
  const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
  const hasBadge = typeof badge === "number" && badge > 0;
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 px-3 py-2 md:py-1.5 rounded-lg transition-colors ${active
        ? "bg-brand-teal/10 text-[#0F766E] font-semibold"
        : "text-foreground hover:bg-secondary"
        }`}
    >
      <Icon className={`w-5 h-5 md:w-4 md:h-4 shrink-0 ${active ? "text-[#0F766E]" : "text-muted-foreground"}`} />
      <span className="font-medium text-base md:text-sm">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className={`ml-auto min-w-[24px] h-[24px] md:min-w-[18px] md:h-[18px] flex items-center justify-center rounded-full text-white text-sm md:text-[11px] font-bold px-1.5 ${badgeClass}`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <ChevronRight className={`${hasBadge ? "ml-1.5" : "ml-auto"} w-5 h-5 md:w-3.5 md:h-3.5 shrink-0 transition-transform ${active ? "text-[#0F766E]" : "text-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5"}`} />
    </Link>
  );
}

export default UserNavbar;
