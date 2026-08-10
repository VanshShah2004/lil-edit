import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesBar from "@/components/landing/FeaturesBar";
import CtaBanner from "@/components/landing/CtaBanner";
import BrandCardFlip from "@/components/landing/BrandCardFlip";

const About = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <RouteFallback />;
  }


  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--navbar-height)]">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1">
        {/* The Lil Edit Story Section */}
        <section className="w-full bg-[#E9DFF5] border-y border-[#DCD0EB]/50">
          <div className="page-container py-8 md:py-10 lg:pt-2 lg:pb-12">
              <div className="flex flex-col lg:flex-row items-center">
               {/* Left Side: the flipping visiting card, same component and same size
                   ladder as the home page story section. Unlike home this section is the
                   top of the page, so the card stays above the copy on mobile rather than
                   below it. */}
               <div className="w-full lg:w-[45%] min-w-0 p-3 flex justify-center items-center">
                 <BrandCardFlip className="w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[400px]" />
               </div>

              {/* Right Side: Content. From lg up this mirrors the home story section's
                  type scale, spacing and "Cool" treatment; below lg the original
                  About-page styling is kept. */}
              <div className="w-full lg:w-[55%] min-w-0 p-8 pb-3 lg:p-8 lg:pl-4 flex flex-col items-center text-center lg:items-start lg:text-left justify-center -mt-[20px] lg:-mt-6">
                <span className="text-xs md:text-sm font-body font-bold tracking-[0.4em] text-[#0B5B55] mb-6 uppercase lg:font-black lg:tracking-[0.45em] lg:text-[#0F766E] lg:mb-4">
                  THE LIL EDIT STORY
                </span>
                {/* leading stays at/above Playfair Display's 1.32em content box
                    (ascender 1082 + descender 235 / 1000 em) so the two lines can't
                    collide. "Cool" goes block at lg so its margin-top reserves real
                    space in flow, where margin on an inline span would not. */}
                <h2 className="font-display text-4xl md:text-5xl lg:text-[2.75rem] xl:text-[3.25rem] leading-[1.35] mb-8 lg:mb-6 font-semibold lg:font-black lg:tracking-tight">
                  <span className="text-black whitespace-nowrap lg:whitespace-normal">Where Culture Meets</span>{" "}
                  <br className="lg:hidden" />
                  <span className="text-[#0B5B55] lg:block lg:mt-4">Cool</span>
                </h2>
                <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed mb-2 max-w-xl lg:text-foreground/70 lg:font-medium lg:mb-8 lg:max-w-[52ch]">
                  At LilEdit, we believe style has no age. Our curated collections bring high-fashion aesthetics to the playground, blending premium fabrics for the little ones who are born to stand out.
                </p>

              </div>
            </div>
          </div>
        </section>
        <FeaturesBar />
        <CategoriesSection />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
};

export default About;
