import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const CtaBanner = () => (
  <section className="bg-strip-soft border-y border-border/70">
    <div className="container mx-auto px-4 lg:px-8 py-16 text-center">
      <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">
        Join The Lil Edit Family
      </h2>
      <p className="text-muted-foreground font-body max-w-md mx-auto mb-8">
        Create an account to save your favorites, track orders, and get exclusive early access to new drops.
      </p>
      <div className="flex gap-4 justify-center">
        <Link to="/signup">
          <Button size="lg" className="font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8">
            Create Account
          </Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="outline" className="font-body rounded-full px-8 border-border/80 text-primary hover:bg-secondary/60">
            Log In
          </Button>
        </Link>
      </div>
    </div>
  </section>
);

export default CtaBanner;
