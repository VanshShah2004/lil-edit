import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ShoppingBag, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isSignupHovered, setIsSignupHovered] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="container mx-auto flex items-center justify-between py-3 px-4 lg:px-8">
        {/* Logo and Branding */}
        <Link to="/" className="flex-shrink-0 flex items-center gap-4">
          <img src={logo} alt="The Lil Edit" className="h-16 w-auto" />
          <div className="text-4xl text-foreground" style={{ fontFamily: "'Pinyon Script', cursive" }}>
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
        <div className="flex items-center gap-3">
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
            <Button size="sm" className={`hidden md:inline-flex text-sm font-body transition-all duration-300 border-2 ${
              isSignupHovered
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
            <Button size="sm" className={`hidden md:inline-flex text-sm font-body transition-all duration-300 border-2 ${
              isLoginHovered
                ? "bg-primary/10 text-primary border-primary"
                : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
            }`}>
              Sign up
            </Button>
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-foreground/70"
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
                <Button className={`w-full font-body transition-all duration-300 border-2 ${
                  isSignupHovered
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-transparent text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                }`}>Log in</Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setMobileOpen(false)}
                onMouseEnter={() => setIsSignupHovered(true)}
                onMouseLeave={() => setIsSignupHovered(false)}
              >
                <Button className={`w-full font-body transition-all duration-300 border-2 ${
                  isLoginHovered
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                }`}>Sign up</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
