import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";

const HeroSection = () => (
  <section className="relative overflow-hidden rounded-b-[2.5rem]">
    <div className="container mx-auto px-4 lg:px-8 py-1 lg:py-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
        {/* Text */}
        <div className="flex flex-col gap-1 animate-fade-in-up">
          <span className="text-sm font-body uppercase tracking-[0.25em] text-primary/90 font-medium">
            New Collection 2026
          </span>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] text-foreground">
            Simply cute,
            <br />
            <span className="text-gradient-blush italic">Always adorable.</span>
          </h1>
          <p className="text-muted-foreground font-body text-base max-w-md leading-relaxed">
            Thoughtfully curated baby essentials designed for comfort, crafted with love, and styled for the tiniest trendsetters.
          </p>
          <div className="flex gap-4 pt-2">
            <Link to="/shop">
              <Button size="lg" className="font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 gap-2">
                Shop Now <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/collections">
              <Button size="lg" variant="outline" className="font-body rounded-full px-8 border-border/70 bg-background/40 backdrop-blur-[2px] hover:bg-secondary/50">
                Explore
              </Button>
            </Link>
          </div>
        </div>

        {/* Image */}
        <div className="relative animate-scale-in" style={{ animationDelay: "0.2s" }}>
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/[0.07] ring-1 ring-border/30">
            <img
              src={heroImage}
              alt="Adorable baby clothing collection"
              className="w-full h-[350px] lg:h-[450px] object-cover"
              width={1024}
              height={1024}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/10 to-transparent" />
          </div>
          {/* Floating badge */}
          <div className="absolute -bottom-4 -left-4 bg-cream/95 backdrop-blur-sm rounded-2xl p-4 shadow-lg shadow-primary/[0.06] border border-border/50 animate-fade-in" style={{ animationDelay: "0.6s" }}>
            <p className="font-display text-sm text-foreground">✨ 100% Organic Cotton</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HeroSection;
