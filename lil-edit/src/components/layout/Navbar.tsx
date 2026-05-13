import { useState, useRef, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Heart, ShoppingBag, Menu, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import MegaMenu from "@/components/MegaMenu";
import SearchPanel from "@/components/search/SearchPanel";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isSignupHovered, setIsSignupHovered] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const isProductPage = location.pathname.startsWith("/product");

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
  }, [location.pathname, mobileOpen]); // Re-run when path or mobile menu state changes

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border shadow-sm">
      <nav className="container mx-auto flex items-center justify-between h-[5rem] md:h-[3.1rem] lg:h-[3.4rem] px-3 sm:px-4 lg:px-8">
        {/* Logo and Branding */}
        <Link to="/" className="flex-shrink flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
          <img src={logo} alt="The Lil Edit" className="h-9 sm:h-12 md:h-10 lg:h-11 w-auto shrink-0" />
          <div className="text-lg sm:text-2xl md:text-[20px] lg:text-[22px] text-foreground leading-none truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
            The Lil Edit
          </div>
        </Link>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-8 font-body text-sm tracking-wide">
          <li><Link to="/" className="text-foreground/80 hover:text-primary transition-colors">Home</Link></li>
          <li><Link to="/shop" className="text-foreground/80 hover:text-primary transition-colors">Shop</Link></li>
          <li><Link to="/collections" className="text-foreground/80 hover:text-primary transition-colors">Collections</Link></li>
          <li><Link to="/about" className="text-foreground/80 hover:text-primary transition-colors">About</Link></li>
        </ul>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button 
            type="button" 
            onClick={() => setIsSearchOpen(true)}
            className="hidden md:flex text-foreground/60 hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link to="/wishlist" className="hidden md:flex text-foreground/60 hover:text-primary transition-colors">
            <Heart className="h-5 w-5" />
          </Link>
          <Link to="/cart" className="hidden md:flex text-foreground/60 hover:text-primary transition-colors">
            <ShoppingBag className="h-5 w-5" />
          </Link>
          <Link to="/login"
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
          >
            <Button size="sm" className={`hidden md:inline-flex text-sm font-body transition-all duration-300 border-2 ${isSignupHovered
              ? "bg-primary/10 text-primary border-primary"
              : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
              }`}>
              Log in
            </Button>
          </Link>
          <Link to="/signup"
            onMouseEnter={() => setIsSignupHovered(true)}
            onMouseLeave={() => setIsSignupHovered(false)}
          >
            <Button size="sm" className={`hidden md:inline-flex text-sm font-body transition-all duration-300 border-2 ${isLoginHovered
              ? "bg-primary/10 text-primary border-primary"
              : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
              }`}>
              Sign up
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden text-foreground/70 p-1 mr-1"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-foreground/70 p-1"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background animate-fade-in">
          <div className="container mx-auto px-4 py-6 flex flex-col gap-4">
            <Link to="/" className="text-foreground/80 py-2 font-body" onClick={() => setMobileOpen(false)}>Home</Link>
            <Link to="/shop" className="text-foreground/80 py-2 font-body" onClick={() => setMobileOpen(false)}>Shop</Link>
            <Link to="/collections" className="text-foreground/80 py-2 font-body" onClick={() => setMobileOpen(false)}>Collections</Link>
            <Link to="/about" className="text-foreground/80 py-2 font-body" onClick={() => setMobileOpen(false)}>About</Link>
            <div className="flex gap-3 pt-4 border-t border-border"
              onMouseEnter={() => setIsLoginHovered(false)}
              onMouseLeave={() => setIsSignupHovered(false)}
            >
              <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}
                onMouseEnter={() => setIsLoginHovered(true)}
                onMouseLeave={() => setIsLoginHovered(false)}
              >
                <Button className={`w-full font-body transition-all duration-300 border-2 ${isSignupHovered
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                  }`}>Log in</Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setMobileOpen(false)}
                onMouseEnter={() => setIsSignupHovered(true)}
                onMouseLeave={() => setIsSignupHovered(false)}
              >
                <Button className={`w-full font-body transition-all duration-300 border-2 ${isLoginHovered
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                  }`}>Sign up</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <MegaMenu />
      <SearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
};

export default Navbar;
