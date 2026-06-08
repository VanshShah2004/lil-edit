import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  User,
  Menu,
  X,
  Shirt,
  Plus,
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
  const dashboardMenuItems = [
    { to: "/profile", label: "Profile", icon: User, adminOnly: false },
    { to: "/orders", label: "Orders", icon: Package, adminOnly: false },
    // Keep this role-aware list so admin-only options can be expanded easily.
    { to: "/admin/add-product", label: "Add Product", icon: Plus, adminOnly: true },
    { to: "/admin/manage-products", label: "View/Edit Products", icon: Shirt, adminOnly: true },
    { to: "/admin/orders", label: "Manage Orders", icon: ClipboardList, adminOnly: true },
    { to: "#", label: "Admin Settings", icon: Settings, adminOnly: true },
  ];
  const visibleMenuItems = dashboardMenuItems.filter((item) => !item.adminOnly || isAdmin);


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
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
              aria-label="Search"
            >
              <Search className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/wishlist")}
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
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
              className="h-10 w-10 sm:h-10 sm:w-10 md:h-9 md:w-9 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center"
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
                    setIsProfileOpen(false);
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

      {/* Left Menu Overlay */}
      {isLeftMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 transition-opacity"
          onClick={() => setIsLeftMenuOpen(false)}
        />
      )}

      {/* Left Menu Panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-background border-r border-border transform transition-transform duration-300 ease-in-out flex flex-col ${isLeftMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="font-display text-2xl font-semibold">Hey, <span className="font-extrabold">{firstNameCandidate === "U" ? "User" : firstNameCandidate}</span>!</div>
          <button
            type="button"
            onClick={() => setIsLeftMenuOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col flex-1 py-4 px-3 gap-2 overflow-y-auto">
          <Link
            to="/dashboard"
            onClick={() => setIsLeftMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Home</span>
          </Link>
          <Link
            to="/collections"
            onClick={() => setIsLeftMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Shirt className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Collections</span>
          </Link>

          <Link
            to="/cart"
            onClick={() => setIsLeftMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <ShoppingCart className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Cart</span>
            {cartCount > 0 && (
              <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#0F766E] text-white text-[10px] font-bold px-1">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          <Link
            to="/wishlist"
            onClick={() => setIsLeftMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Heart className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Wishlist</span>
            {wishlistCount > 0 && (
              <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold px-1">
                {wishlistCount > 99 ? "99+" : wishlistCount}
              </span>
            )}
          </Link>

          {isAdmin && (
            <Link
              to="/admin/add-product"
              onClick={() => setIsLeftMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Add Product</span>
            </Link>
          )}

          <div className="mt-auto">
            <Link
              to="/profile"
              onClick={() => setIsLeftMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
            >
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Profile</span>
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
};

export default UserNavbar;
