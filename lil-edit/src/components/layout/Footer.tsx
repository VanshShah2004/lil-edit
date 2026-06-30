import { Link } from "react-router-dom";
import { Heart } from "lucide-react";

const Footer = () => (
  <footer className="bg-card border-t border-gray-400">
    <div className="container mx-auto px-4 lg:px-8 py-12 md:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
        {/* Brand */}
        <div className="md:col-span-1">
          <h3 className="font-display text-2xl text-foreground mb-2">The Lil Edit</h3>
          <p className="text-muted-foreground text-sm font-body italic">Simply cute. Always adorable.</p>
        </div>

        {/* Shop */}
        <div>
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Shop</h4>
          <ul className="space-y-3 text-sm font-body text-muted-foreground">
            <li><Link to="/shop" className="hover:text-primary transition-colors">New Arrivals</Link></li>
            <li><Link to="/shop" className="hover:text-primary transition-colors">Bestsellers</Link></li>
            <li><Link to="/shop" className="hover:text-primary transition-colors">Sale</Link></li>
            <li><Link to="/shop" className="hover:text-primary transition-colors">Gift Sets</Link></li>
          </ul>
        </div>

        {/* Help */}
        <div>
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Help</h4>
          <ul className="space-y-3 text-sm font-body text-muted-foreground">
            <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            <li><Link to="/shipping" className="hover:text-primary transition-colors">Shipping</Link></li>
            <li><Link to="/returns" className="hover:text-primary transition-colors">Returns</Link></li>
            <li><Link to="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
          </ul>
        </div>

        {/* Newsletter */}
        <div>
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Stay in the loop</h4>
          <p className="text-sm font-body text-muted-foreground mb-4">Get the cutest updates straight to your inbox.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-body hover:bg-primary/90 transition-colors sm:w-auto w-full">
              Join
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground font-body">
          © 2026 The Lil Edit. All rights reserved.
        </p>
        <p className="text-xs text-muted-foreground font-body flex items-center gap-1">
          Made with <Heart className="h-3 w-3 text-primary fill-primary" /> for little ones
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
