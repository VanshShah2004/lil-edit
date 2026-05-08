import { ArrowRight } from "lucide-react";
import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";

const looks = [
  {
    id: 1,
    label: "FESTIVE EDIT",
    title: "Celebration Look",
    img: le3,
  },
  {
    id: 2,
    label: "EVERYDAY CHIC",
    title: "School Day Look",
    img: le0,
  },
  {
    id: 3,
    label: "PARTY READY",
    title: "Birthday Look",
    img: le4,
  },
  {
    id: 4,
    label: "BOHO BABY",
    title: "Weekend Look",
    img: le1,
  },
];

const ShopTheLook = () => {
  return (
    <section className="pt-2 pb-8 md:pt-4 md:pb-12 bg-white">
      <div className="container px-4">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <p className="text-base font-black tracking-[0.2em] uppercase text-[#0F766E] mb-0.5 pt-8 sm:pt-12">
            One Click - Full Outfit
          </p>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
              Shop the Look
            </h2>
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-foreground hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0">
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Placards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10">
          {looks.map((look) => (
            <div
              key={look.id}
              className="group relative h-[260px] sm:h-[340px] md:h-[380px] cursor-pointer"
            >
              {/* Main Card Container with Organic Shapes */}
              <div className="relative w-full h-full rounded-[2rem_0.5rem_2rem_0.5rem] sm:rounded-[3rem_1rem_3rem_1rem] overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.2)] border border-white/20 transition-all duration-700 group-hover:shadow-[0_20px_50px_-12px_rgba(15,118,110,0.3)]">

                {/* Image with subtle zoom & pan */}
                <img
                  src={look.img}
                  alt={look.title}
                  className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
                />

                {/* Aesthetic Vignette Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

                {/* Vertical Side Label */}
                <div className="absolute top-8 sm:top-10 -left-1 origin-top-left -rotate-90 scale-75 sm:scale-100">
                  <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/40 group-hover:text-white/90 transition-colors duration-500 bg-black/20 backdrop-blur-md px-4 py-1 rounded-full border border-white/10">
                    {look.label}
                  </span>
                </div>

                {/* Floating Glass Info Card */}
                <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 p-2 sm:p-3 h-[50px] sm:h-[65px] group-hover:h-[90px] sm:group-hover:h-[110px] rounded-lg sm:rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-500 flex flex-col justify-between group-hover:-translate-y-1 sm:group-hover:-translate-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-white font-bold text-[10px] sm:text-sm leading-tight tracking-tight pr-1">
                      {look.title}
                    </h3>
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#0F766E] flex items-center justify-center text-white shadow-lg transform transition-transform duration-500 group-hover:rotate-[360deg] shrink-0">
                      <ArrowRight className="w-3 h-3 sm:w-4 h-4" />
                    </div>
                  </div>

                  <div className="h-0 opacity-0 overflow-hidden group-hover:h-10 group-hover:opacity-100 transition-all duration-500 ease-in-out mt-2">
                    <button className="w-full h-full bg-white text-[#0F766E] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black hover:text-white transition-colors duration-300">
                      Explore Look
                    </button>
                  </div>
                </div>
              </div>

              {/* Decorative background element that peeks out */}
              <div className="absolute -z-10 inset-0 bg-[#0F766E]/5 rounded-[3rem_1rem_3rem_1rem] blur-2xl transform scale-90 group-hover:scale-110 transition-transform duration-700" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ShopTheLook;
