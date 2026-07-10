import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";

const Footer = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong. Please try again.");
        return;
      }

      toast.success(
        data.action === "already_subscribed"
          ? "You're already on the list!"
          : "You're in! Watch your inbox for cute updates."
      );
      setEmail("");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
  <footer className="bg-card border-t border-gray-400">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 md:py-16">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 sm:gap-8 md:gap-10 text-center sm:text-left">
        {/* Brand */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-1">
          <h3 className="font-display text-2xl text-foreground mb-2">The Lil Edit</h3>
          <p className="text-muted-foreground text-sm font-body italic">Simply cute, Always adorable.</p>
        </div>

        {/* Shop */}
        <div>
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Shop</h4>
          <ul className="space-y-3 text-sm font-body text-muted-foreground">
            <li><Link to="/collections" className="hover:text-primary transition-colors">New Arrivals</Link></li>
            <li><Link to="/collections" className="hover:text-primary transition-colors">Ethnic Wear</Link></li>
            <li><Link to="/collections" className="hover:text-primary transition-colors">Party Wear</Link></li>
            <li><Link to="/collections" className="hover:text-primary transition-colors">Accessories</Link></li>
          </ul>
        </div>

        {/* Help */}
        <div>
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Help</h4>
          <ul className="space-y-3 text-sm font-body text-muted-foreground">
            <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            <li><Link to="/faq#shipping" className="hover:text-primary transition-colors">Shipping</Link></li>
            <li><Link to="/returns" className="hover:text-primary transition-colors">Returns</Link></li>
            <li><Link to="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
          </ul>
        </div>

        {/* Newsletter */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-1">
          <h4 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Stay in the loop</h4>
          <p className="text-sm font-body text-muted-foreground mb-4">Get the cutest updates straight to your inbox.</p>
          <form
            onSubmit={handleSubscribe}
            className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto sm:mx-0"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 min-w-0 px-4 py-2 rounded-lg border border-gray-400 bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-body hover:bg-primary/90 transition-colors w-full sm:w-auto shrink-0 disabled:opacity-60"
            >
              {submitting ? "Joining..." : "Join"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-border flex flex-col-reverse sm:flex-row items-center justify-center sm:justify-between gap-3 sm:gap-4 text-center">
        <p className="text-base text-muted-foreground font-display font-semibold">
          &copy; 2026 The Lil Edit. All rights reserved.
        </p>
        <p className="text-base text-muted-foreground font-display flex items-center gap-1">
          Made with <Heart className="h-4 w-4 text-primary fill-primary" /> for little ones
        </p>
      </div>
    </div>
  </footer>
  );
};

export default Footer;
