import { Sparkles, ShieldCheck, Globe } from "lucide-react";
import BrandCardFlip from "@/components/landing/BrandCardFlip";

const AboutLilEdit = () => {
  const values = [
    {
      icon: <Sparkles className="w-5 h-5 text-[#0F766E]" />,
      title: "Unique Design"
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-[#0F766E]" />,
      title: "Premium Quality"
    },
    {
      icon: <Globe className="w-5 h-5 text-[#0B5B55]" />,
      title: "Global Style"
    }
  ];

  return (
    <section className="py-8 md:py-10 lg:py-12 bg-[#E8DDF7]">
      <div className="container px-6 lg:px-16 mx-auto">
        <div className="flex flex-col-reverse md:flex-row items-center justify-center gap-10 md:gap-10 lg:gap-16">

          {/* Brand Card Block (Always First in DOM for clean accessibility and mobile-top behavior) */}
          <div className="w-full md:w-[42%] lg:w-[38%] min-w-0 flex justify-center md:justify-end">
            <BrandCardFlip className="w-full max-w-[260px] sm:max-w-[280px] md:max-w-[340px] lg:max-w-[400px]" />
          </div>

          {/* Content Block */}
          <div className="w-full md:w-[58%] lg:w-[54%] min-w-0 flex flex-col items-center md:items-start text-center md:text-left -mt-[15px] md:-mt-6">
            <span className="text-xs md:text-sm font-black tracking-[0.45em] uppercase text-[#0F766E] mb-3 md:mb-4 block">
              The Lil Edit Story
            </span>

            {/* leading stays at/above Playfair Display's 1.32em content box
                (ascender 1082 + descender 235 / 1000 em) so the two lines can't collide.
                "Cool" is a block from sm up — as a block its margin-top reserves real
                space in flow, where margin on an inline span would only shift the glyph
                down into the line below. Below sm it stays inline and wraps naturally. */}
            <h2 className="font-display text-2xl md:text-4xl lg:text-[2.75rem] xl:text-[3.25rem] font-black text-foreground mb-5 md:mb-6 leading-[1.35] tracking-tight">
              Where Culture Meets{" "}
              <span className="text-[#0B5B55] sm:block sm:mt-4">Cool</span>
            </h2>

            <p className="text-sm md:text-lg text-foreground/70 leading-relaxed mb-4 md:mb-8 max-w-[52ch] font-medium">
              At LilEdit, we believe style has no age. Our curated collections bring high-fashion aesthetics to the playground, blending premium fabrics for the little ones who are born to stand out.
            </p>

            {/* Brand Values */}
            <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-2 md:gap-8">
              {values.map((value, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2.5 group ${
                    index === 0 ? "w-full justify-center md:w-auto md:justify-start" : ""
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-md transform transition-transform duration-500 group-hover:scale-110">
                    {value.icon}
                  </div>
                  <h3 className="font-bold text-sm text-foreground tracking-tight">
                    {value.title}
                  </h3>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AboutLilEdit;
