import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";

interface HeroSectionProps {
  hidePhoto?: boolean;
}

const HeroSection = ({ hidePhoto = false }: HeroSectionProps) => {
  const [isExploreHovered, setIsExploreHovered] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-b-[2rem] md:rounded-b-[2.5rem]">
      <div className="container mx-auto px-4 lg:px-8 py-2 lg:py-2 pb-8 lg:pb-12">
        <div className={`grid grid-cols-1 ${!hidePhoto ? "lg:grid-cols-2" : ""} gap-8 lg:gap-6 items-center`}>
          {/* Text */}
          <div className={`flex flex-col gap-2 animate-fade-in-up text-center ${!hidePhoto ? "lg:text-left" : "items-center"}`}>
            <span className="text-[11px] sm:text-xs md:text-sm font-body uppercase tracking-[0.2em] md:tracking-[0.25em] font-medium bg-gradient-to-r from-teal-700 to-primary bg-clip-text text-transparent">
              The Lil Edit Collection 2026
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] text-foreground">
              Simply cute,
              <br />
              <span className="text-gradient-blush italic">Always adorable.</span>
            </h1>
            <p className={`text-muted-foreground font-body text-sm sm:text-base max-w-md lg:max-w-lg leading-relaxed mx-auto ${!hidePhoto ? "lg:mx-0" : ""}`}>
              Thoughtfully curated baby essentials designed for comfort, crafted with love, and styled for the tiniest trendsetters.
            </p>
            <div className={`flex flex-row gap-3 sm:gap-4 pt-2 justify-center ${!hidePhoto ? "lg:justify-start" : ""}`}>
              <Link to="/shop">
                <Button
                  size="lg"
                  className={`font-body rounded-full w-auto px-5 sm:px-8 gap-1.5 sm:gap-2 transition-all duration-300 border-2 ${isExploreHovered
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                    }`}
                >
                  Shop Now <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link
                to="/collections"
                onMouseEnter={() => setIsExploreHovered(true)}
                onMouseLeave={() => setIsExploreHovered(false)}
              >
                <Button
                  size="lg"
                  className={`font-body rounded-full w-auto px-5 sm:px-8 transition-all duration-300 border-2 ${isExploreHovered
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-primary text-primary bg-primary/10 backdrop-blur-[2px] hover:text-primary-foreground hover:bg-primary"
                    }`}
                >
                  Explore
                </Button>
              </Link>
            </div>
          </div>

          {/* Image */}
          {!hidePhoto && (
            <div className="relative animate-scale-in" style={{ animationDelay: "0.2s" }}>
            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/[0.25] ring-2 ring-primary/35">
              <img
                src={heroImage}
                alt="Adorable baby clothing collection"
                className="w-full h-[280px] sm:h-[350px] lg:h-[450px] object-cover"
                width={1024}
                height={1024}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/10 to-transparent" />
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-3 left-3 sm:-bottom-4 sm:-left-4 bg-cream/95 backdrop-blur-sm rounded-2xl p-3 sm:p-4 shadow-xl shadow-primary/[0.20] border-2 border-primary/45 animate-fade-in" style={{ animationDelay: "0.6s" }}>
              <p className="font-display text-xs sm:text-sm text-foreground">✨ 100% Original Fashion</p>
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
