import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const CtaBanner = () => {
  const [isLoginHovered, setIsLoginHovered] = useState(false);

  return (
    <section className="bg-white border-y border-border/70">
      <div className="container mx-auto px-4 lg:px-8 py-12 md:py-16 text-center">
        <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
        <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">
          Join The Lil Edit Family
        </h2>
        <p className="text-muted-foreground font-body text-sm md:text-base max-w-md mx-auto mb-8">
          Create an account to save your favorites, track orders, and get exclusive early access to new drops.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <div
            onMouseEnter={() => setIsLoginHovered(false)}
            onMouseLeave={() => setIsLoginHovered(false)}
          >
            <Link to="/signup">
              <Button size="lg" className={`font-body w-full sm:w-auto rounded-xl px-6 sm:px-8 transition-all duration-300 border-2 ${
                isLoginHovered
                  ? "bg-white text-primary border-primary"
                  : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
              }`}>
                Create Account
              </Button>
            </Link>
          </div>
          <div
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
          >
            <Link to="/login">
              <Button size="lg" className={`font-body w-full sm:w-auto rounded-xl px-6 sm:px-8 transition-all duration-300 border-2 ${
                isLoginHovered
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-white text-primary border-primary hover:text-primary-foreground hover:bg-primary"
              }`}>
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CtaBanner;
