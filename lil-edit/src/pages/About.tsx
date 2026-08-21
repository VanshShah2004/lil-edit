import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import CategoryStrip from "@/components/collections/CategoryStrip";
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
        {/* SHOP BY CATEGORY — the same section the Collections page carries
            (components/collections/CategoryStrip): the four real wear types, on
            their own placard grounds, with live counts. It replaces a hand-rolled
            three-card grid whose names ("Ethnic Elegance", "Cozy Essentials")
            weren't the taxonomy any product actually carries and whose links
            pointed at /collections/clothing and /collections/essentials, neither
            of which is a route we serve.

            It sits directly under the story, ahead of the trust bar: the shopper
            has just been told what the brand is, and the next thing to hand them
            is a way in. Delivery and gift wrapping answer a question nobody has
            asked yet at this point on the page.

            The white ground comes from Collections — it is also what keeps the
            blurb, set in gray-500, above contrast, which it would lose on the
            lavender bands either side of it.

            The MEASURE is About's, not Collections': `container mx-auto px-4
            lg:px-8`, character for character what FeaturesBar and CtaBanner below
            use, so every band on the page shares one left and right edge at every
            width. Collections' max-w-5xl would stop this one 1024px wide against
            their 1336 on a 1440 laptop, and page-container — the story band's
            measure — still parts company past 1400px, where the container config
            opens to 1400 and max-w-7xl holds at 1280. */}
        <section className="bg-white border-y border-border/60">
          <div className="container mx-auto px-4 lg:px-8 py-12 md:py-16">
            <CategoryStrip />
          </div>
        </section>

        {/* Lavender, so the page alternates story → categories → trust → CTA as
            tinted, white, tinted, white. On white it would run into the category
            band above and the CTA below as one undifferentiated stretch. Index
            keeps the white default — see the note in FeaturesBar. */}
        <FeaturesBar tone="lavender" />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
};

export default About;
