import logo from "@/assets/logo.png";
import { Sparkles, ShieldCheck, Globe } from "lucide-react";

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
    <section className="py-12 md:py-16 lg:py-20 bg-[#E8DDF7]">
      <div className="container px-6 lg:px-16 mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-24">

          {/* Logo Block (Always First in DOM for clean accessibility and mobile-top behavior) */}
          <div className="w-full md:w-[35%] lg:w-[30%] flex justify-center md:justify-end">
            <div className="relative group w-full max-w-[220px] sm:max-w-[260px] md:max-w-none">
              <div className="absolute inset-0 bg-white/20 blur-[60px] group-hover:bg-white/40 transition-colors duration-1000 rounded-full" />
              <img
                src={logo}
                alt="The Lil Edit"
                className="relative w-full h-auto object-contain drop-shadow-xl transform transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          </div>

          {/* Content Block */}
          <div className="w-full md:w-[65%] lg:w-[60%] flex flex-col items-center md:items-start text-center md:text-left">
            <span className="text-xs md:text-sm font-black tracking-[0.6em] uppercase text-[#0F766E] mb-5 block">
              The Lil Edit Story
            </span>

            <h2 className="font-display text-2xl md:text-3xl lg:text-[2.75rem] font-black text-foreground mb-6 leading-tight">
              Where Culture Meets <br className="hidden sm:block" />
              <span className="text-[#0B5B55] inline-block mt-2">Cool</span>
            </h2>

            <p className="text-sm md:text-base text-foreground/70 leading-relaxed mb-8 max-w-xl font-medium">
              At LilEdit, we believe style has no age. Our curated collections bring high-fashion aesthetics to the playground, blending premium fabrics with effortless silhouettes for the little ones who are born to stand out.
            </p>

            {/* Brand Values */}
            <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-8">
              {values.map((value, index) => (
                <div key={index} className="flex items-center gap-2.5 group">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-md transform transition-transform duration-500 group-hover:scale-110">
                    {value.icon}
                  </div>
                  <h3 className="font-bold text-[11px] md:text-xs text-foreground tracking-tight">
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
