import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Heart, ShoppingCart, Menu, X, Search, Home, Shirt, Info, User, ChevronRight, Sparkles, Star, TrendingUp, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import logo from "@/assets/logo.png";
import MegaMenu from "@/components/MegaMenu";
import SearchPanel from "@/components/search/SearchPanel";

const Navbar = () => {
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isSignupHovered, setIsSignupHovered] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isCollectionsOpen, setIsCollectionsOpen] = useState(true);
  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountBarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

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
  }, [location.pathname, mobileOpen, isAccountOpen]); // Re-run when path, mobile menu, or login/signup bar state changes

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // The login/signup bar renders outside accountRef (it's a full-width row
      // below the header), so guard against it too — otherwise this mousedown
      // handler closes the bar before a login/signup click can navigate.
      const insideButton = accountRef.current?.contains(target);
      const insideBar = accountBarRef.current?.contains(target);
      if (!insideButton && !insideBar) {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleEsc);
    };
  }, [mobileOpen]);

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border shadow-sm">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-[5rem] md:h-[3.1rem] lg:h-[3.4rem] px-3 lg:px-6">
        {/* Left Actions & Logo */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(true);
            }}
            className="p-1 -ml-1 text-foreground hover:bg-secondary rounded-md transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>
          <Link to="/" className="flex-shrink flex items-center gap-2 sm:gap-3 min-w-0">
            <img src={logo} alt="The Lil Edit" className="h-10 sm:h-12 md:h-9 lg:h-9.5 w-auto shrink-0" />
            <div className="hidden min-[430px]:block text-xl md:text-[18px] lg:text-[20px] text-foreground leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
              The Lil Edit
            </div>
          </Link>
        </div>

        <div className="flex-1" />

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-2 md:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-400 bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
            aria-label="Search"
          >
            <Search className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
          <Link
            to="/wishlist"
            className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-400 bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
            aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ""}`}
          >
            <Heart className="w-5 h-5" />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold leading-none px-[3px]">
                {wishlistCount > 99 ? "99+" : wishlistCount}
              </span>
            )}
          </Link>
          <Link
            to="/cart"
            className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-gray-400 bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
            aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#0F766E] text-white text-[10px] font-bold leading-none px-[3px]">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          <Link to="/login"
            className="hidden md:inline-flex"
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
          >
            <Button size="sm" className={`text-sm font-body transition-all duration-300 border-2 ${isSignupHovered
              ? "bg-primary/10 text-primary border-primary"
              : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
              }`}>
              Log in
            </Button>
          </Link>
          <Link to="/signup"
            className="hidden md:inline-flex"
            onMouseEnter={() => setIsSignupHovered(true)}
            onMouseLeave={() => setIsSignupHovered(false)}
          >
            <Button size="sm" className={`text-sm font-body transition-all duration-300 border-2 ${isLoginHovered
              ? "bg-primary/10 text-primary border-primary"
              : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
              }`}>
              Sign up
            </Button>
          </Link>
          <div
            className="relative md:hidden"
            ref={accountRef}
          >
            <button
              type="button"
              onClick={() => setIsAccountOpen((prev) => !prev)}
              className="h-11 w-11 sm:h-11 sm:w-11 rounded-full border-2 border-teal-700 sm:border-teal-600 bg-gradient-to-br from-[#F8FFFE] via-[#F1FEFB] to-[#E9FCF8] text-[#0F766E] shadow-[0_4px_14px_rgba(13,148,136,0.14)] p-[2px] flex items-center justify-center transition-all duration-200 hover:from-[#F2FFFD] hover:via-[#E9FCF8] hover:to-[#DEFAF4]"
              aria-label="Account Menu"
            >
              <User className="w-5 h-5 sm:w-[1.3rem] sm:h-[1.3rem] stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Login / Signup Bar (mobile) */}
      {isAccountOpen && (
        <div ref={accountBarRef} className="border-b border-border bg-background md:hidden">
          <div className="max-w-screen-2xl mx-auto flex items-center px-3 lg:px-6 py-3">
            <div className="flex gap-3 flex-1 max-w-sm"
              onMouseEnter={() => setIsLoginHovered(false)}
              onMouseLeave={() => setIsSignupHovered(false)}
            >
              <Link to="/login" className="flex-1" onClick={() => setIsAccountOpen(false)}
                onMouseEnter={() => setIsLoginHovered(true)}
                onMouseLeave={() => setIsLoginHovered(false)}
              >
                <Button className={`w-full font-body transition-all duration-300 border-2 ${isSignupHovered
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                  }`}>Log in</Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setIsAccountOpen(false)}
                onMouseEnter={() => setIsSignupHovered(true)}
                onMouseLeave={() => setIsSignupHovered(false)}
              >
                <Button className={`w-full font-body transition-all duration-300 border-2 ${isLoginHovered
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                  }`}>Sign up</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Left Menu Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      {/* Left Menu Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className={`fixed top-0 left-0 bottom-0 z-[70] w-80 max-w-[88vw] bg-background shadow-2xl border-r border-border transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex flex-col ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-teal/12 via-[#E8DDF7]/45 to-emerald-50 px-5 pt-7 pb-6">
          <div className="h-1.5 w-full absolute top-0 left-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
          <div className="absolute left-0 right-0 bottom-[3px] h-px bg-foreground" />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground hover:bg-white/60 rounded-full transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-2 border-teal-600 bg-gradient-to-br from-[#F8FFFE] to-[#E9FCF8] text-teal-700 shadow-sm flex items-center justify-center font-display text-2xl font-black shrink-0">
              <User className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F766E]">Welcome to</p>
              <p className="font-display text-xl md:text-lg font-extrabold text-foreground truncate leading-tight">
                The Lil Edit
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col flex-1 pt-[3px] pb-2 overflow-y-auto">
          <SideSection label="Explore">
            <SideLink to="/" icon={Home} label="Home" pathname={location.pathname} onClick={() => setMobileOpen(false)} />
            <SideCollapse
              to="/collections"
              icon={Shirt}
              label="Collections"
              active={location.pathname === "/collections" || location.pathname.startsWith("/collections/")}
              open={isCollectionsOpen}
              onToggle={() => setIsCollectionsOpen((prev) => !prev)}
              onNavigate={() => setMobileOpen(false)}
            >
              <SideSubLink to="/collections/new-arrivals" icon={Sparkles} label="New Arrivals" onClick={() => setMobileOpen(false)} />
              <SideSubLink to="/collections/girls" icon={Heart} label="Girls" onClick={() => setMobileOpen(false)} />
              <SideSubLink to="/collections/boys" icon={Star} label="Boys" onClick={() => setMobileOpen(false)} />
              <SideSubLink to="/collections/trending" icon={TrendingUp} label="Trending" onClick={() => setMobileOpen(false)} />
              <SideSubLink to="/collections/occasion" icon={PartyPopper} label="By Occasion" onClick={() => setMobileOpen(false)} />
            </SideCollapse>
            <SideLink to="/about" icon={Info} label="About Us" pathname={location.pathname} onClick={() => setMobileOpen(false)} />
          </SideSection>

          <SideSection label="Your Items">
            <SideLink to="/wishlist" icon={Heart} label="Wishlist" pathname={location.pathname} onClick={() => setMobileOpen(false)} badge={wishlistCount} badgeClass="bg-primary" />
            <SideLink to="/cart" icon={ShoppingCart} label="Cart" pathname={location.pathname} onClick={() => setMobileOpen(false)} badge={cartCount} badgeClass="bg-[#0F766E]" />
          </SideSection>

        </nav>

        {/* Account — pinned footer */}
        <div className="px-3 py-3 border-t border-foreground shrink-0">
          <div className="flex gap-3"
            onMouseEnter={() => setIsLoginHovered(false)}
            onMouseLeave={() => setIsSignupHovered(false)}
          >
            <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}
              onMouseEnter={() => setIsLoginHovered(true)}
              onMouseLeave={() => setIsLoginHovered(false)}
            >
              <Button className={`w-full font-body transition-all duration-300 border-2 ${isSignupHovered
                ? "bg-primary/10 text-primary border-primary"
                : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                }`}>Log in</Button>
            </Link>
            <Link to="/signup" className="flex-1" onClick={() => setMobileOpen(false)}
              onMouseEnter={() => setIsSignupHovered(true)}
              onMouseLeave={() => setIsSignupHovered(false)}
            >
              <Button className={`w-full font-body transition-all duration-300 border-2 ${isLoginHovered
                ? "bg-primary/10 text-primary border-primary"
                : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                }`}>Sign up</Button>
            </Link>
          </div>
        </div>

        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
      </aside>

      <MegaMenu />
      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
};

export default Navbar;

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-3 pt-1 md:pt-0.5 pb-1.5 border-t border-foreground/55 first:border-t-0 first:pt-1">
      <p className="px-3 py-0.5 mb-1 font-display text-base md:text-sm font-black uppercase tracking-[0.16em] text-foreground/85">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

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
  const active = pathname === to || (to !== "/" && pathname.startsWith(to + "/"));
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

// An expandable nav row that toggles a nested list of sub-links beneath it.
function SideCollapse({
  to,
  icon: Icon,
  label,
  active,
  open,
  onToggle,
  onNavigate,
  children,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`group flex items-center rounded-lg transition-colors ${active
          ? "bg-brand-teal/10 text-[#0F766E] font-semibold"
          : "text-foreground hover:bg-secondary"
          }`}
      >
        <Link
          to={to}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="flex flex-1 items-center gap-3 px-3 py-2 md:py-1.5"
        >
          <Icon className={`w-5 h-5 md:w-4 md:h-4 shrink-0 ${active ? "text-[#0F766E]" : "text-muted-foreground"}`} />
          <span className="font-medium text-base md:text-sm">{label}</span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          className="px-3 py-2 md:py-1.5 self-stretch flex items-center"
        >
          <ChevronRight className={`w-5 h-5 md:w-3.5 md:h-3.5 shrink-0 ${active ? "text-[#0F766E]" : "text-foreground/60 group-hover:text-foreground"}`} />
        </button>
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="ml-4 pl-2 border-l-2 border-gray-400 flex flex-col gap-0.5 py-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}

// A nested sub-link rendered inside a SideCollapse group.
function SideSubLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group flex items-center gap-2.5 px-3 py-1.5 md:py-1 rounded-lg text-foreground hover:bg-secondary transition-colors"
    >
      <Icon className="w-4 h-4 md:w-3.5 md:h-3.5 shrink-0 text-muted-foreground group-hover:text-[#0F766E]" />
      <span className="font-medium text-sm md:text-[13px]">{label}</span>
    </Link>
  );
}
