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
  const [activeMegaTab, setActiveMegaTab] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileCloseTimeoutRef = useRef<number | null>(null);
  const megaMenuRef = useRef<HTMLDivElement | null>(null);
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
  const megaMenuItems = [
    "NEW ARRIVALS",
    "GIRLS",
    "BOYS",
    "TRENDING",
    "BY OCCASSION",
  ];
  const megaMenuContent: Record<
    string,
    { title: string; links: string[] }[]
  > = {
    "NEW ARRIVALS": [
      { title: "JUST IN", links: ["All", "Daily New", "Ready To Ship", "Bestsellers", "Latest Sets"] },
      { title: "TRENDING", links: ["Ethnic Wear", "Western Wear", "Fusion Looks", "Party Wear", "Lookbook"] },
      { title: "SHOP BY AGE", links: ["0-2 Years", "2-4 Years", "4-6 Years", "6-8 Years", "8+ Years"] },
      { title: "MORE", links: ["Accessories", "Shoes", "Bags", "Hair Essentials", "Stationery"] },
    ],
    "GIRLS": [
      { title: "ETHNIC WEAR", links: ["All", "Lehengas", "Kurtis", "Shararas", "Sarees", "Sets"] },
      { title: "TRENDING", links: ["New Arrivals", "Ready To Ship", "Wedding", "Reels", "Lookbook"] },
      { title: "DRESSES & SETS", links: ["All", "Dresses", "Gowns", "Jumpsuits", "Co-ords", "Party Looks"] },
      { title: "MORE", links: ["Hair Accessories", "Sleepwear", "Shoes", "Bags", "Jewellery", "Other Apparel"] },
    ],
    "BOYS": [
      { title: "ETHNIC WEAR", links: ["All", "Kurta Pajama", "Nehru Jackets", "Sherwanis", "Pathani Sets"] },
      { title: "CASUAL", links: ["T-Shirts", "Shirts", "Jeans", "Trousers", "Co-ord Sets"] },
      { title: "OCCASION", links: ["Wedding", "Festive", "Birthday", "Party", "Photoshoot"] },
      { title: "MORE", links: ["Footwear", "Accessories", "Innerwear", "Sleepwear", "Bags"] },
    ],
    "TRENDING": [
      { title: "HOT RIGHT NOW", links: ["Instagram Reels", "Celebrity Picks", "Top Rated", "Festive Edits", "Wedding Edit"] },
      { title: "SEASONAL", links: ["Summer Picks", "Monsoon Ready", "Winter Layers", "Spring Colors"] },
      { title: "SHOP BY LOOK", links: ["Traditional", "Modern Ethnic", "Streetwear", "Elegant", "Minimal"] },
      { title: "INSPIRATION", links: ["Lookbook", "Style Guide", "Mix & Match", "Gift Ideas"] },
    ],
    "BY OCCASSION": [
      { title: "EVENTS", links: ["Birthday", "Wedding", "Festive", "School Events", "Family Function"] },
      { title: "STYLE TYPE", links: ["Traditional", "Contemporary", "Comfort Wear", "Party Wear", "Premium Edit"] },
      { title: "SHOP FAST", links: ["Ready To Ship", "Under 1999", "Matching Siblings", "Quick Picks"] },
      { title: "DISCOVER", links: ["Top Collections", "Gift Sets", "Accessories", "New In"] },
    ],
  };

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

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!megaMenuRef.current) return;
      if (!megaMenuRef.current.contains(event.target as Node)) {
        setActiveMegaTab(null);
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
      <div className="container mx-auto flex items-center justify-between h-[4.25rem] md:h-[4.5rem] px-3 sm:px-4 lg:px-8">
        <Link to="/dashboard" className="flex-shrink flex items-center gap-2 sm:gap-3 min-w-0">
          <img src={logo} alt="The Lil Edit" className="h-9 sm:h-11 md:h-14 w-auto shrink-0" />
          <div className="text-lg sm:text-xl md:text-2xl text-foreground leading-none truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
            The Lil Edit
          </div>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 shrink-0">
          <button
            type="button"
            className="h-8 w-8 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <button className="h-8 w-8 rounded-full border border-border bg-background text-foreground hover:bg-secondary transition-colors relative flex items-center justify-center">
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
              className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border-2 border-teal-600 bg-gradient-to-br from-[#F8FFFE] via-[#F1FEFB] to-[#E9FCF8] text-[#0F766E] shadow-[0_4px_14px_rgba(13,148,136,0.14)] p-[2px] flex items-center justify-center transition-all duration-200 hover:from-[#F2FFFD] hover:via-[#E9FCF8] hover:to-[#DEFAF4] hover:border-teal-600 hover:shadow-[0_8px_18px_rgba(13,148,136,0.22)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/45 focus-visible:ring-offset-1"
            >
              <div className="px-0.5 py-[1px] text-[1.05rem] sm:text-[1.2rem] font-black font-display leading-none text-teal-600">
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
      <div 
        ref={megaMenuRef}
        className="border-t border-border/60 bg-background w-full"
        onMouseLeave={() => window.innerWidth >= 768 && setActiveMegaTab(null)}
      >
        <div className="container mx-auto px-1 sm:px-4 lg:px-8 py-2 md:py-3">
          <div className="flex items-center justify-center whitespace-nowrap overflow-hidden">
            {megaMenuItems.map((item, index) => (
              <div key={`unified-${item}`} className="flex items-center">
                <button
                  type="button"
                  onMouseEnter={() => window.innerWidth >= 768 && setActiveMegaTab(item)}
                  onClick={() => setActiveMegaTab((prev) => (prev === item ? null : item))}
                  className={`px-1 sm:px-2 md:px-4 text-[9px] min-[360px]:text-[10px] sm:text-xs md:text-sm lg:text-base font-bold tracking-tighter min-[360px]:tracking-tight sm:tracking-wide transition-colors ${
                    activeMegaTab === item ? "text-teal-600" : "text-foreground hover:text-teal-600"
                  }`}
                >
                  {item}
                </button>
                {index < megaMenuItems.length - 1 && (
                  <span className="px-0.5 sm:px-2 md:px-4 text-foreground/30 font-light select-none text-[10px] sm:text-xs md:text-sm lg:text-base">|</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {activeMegaTab && (
          <div 
            className="absolute left-0 right-0 top-full border-b border-border/70 bg-background shadow-md max-h-[75vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
                {(megaMenuContent[activeMegaTab] ?? []).map((section) => (
                  <div key={`section-${section.title}`} className="space-y-2.5">
                    <h3 className="text-[11px] md:text-xs lg:text-sm font-semibold tracking-[0.1em] lg:tracking-[0.12em] text-foreground">{section.title}</h3>
                    <ul className="space-y-1.5 md:space-y-2">
                      {section.links.map((link) => (
                        <li key={`link-${section.title}-${link}`}>
                          <Link 
                            to="/products" 
                            onClick={() => setActiveMegaTab(null)}
                            className="text-sm lg:text-base text-muted-foreground hover:text-teal-600 active:text-teal-700 transition-colors"
                          >
                            {link}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </header>
  );
};

export default UserNavbar;
