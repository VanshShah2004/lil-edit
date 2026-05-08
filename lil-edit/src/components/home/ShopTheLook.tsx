import { useState } from "react";
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
  const [activeId, setActiveId] = useState<number | null>(null);

  const toggleLook = (id: number) => {
    setActiveId(activeId === id ? null : id);
  };

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
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-foreground hover:bg-[#0F766E] hover:text-white shadow-sm border-2 border-black transition-all duration-300 shrink-0">
              <ArrowRight className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Placards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10">
          {looks.map((look) => {
            const isActive = activeId === look.id;
            
            return (
              <div
                key={look.id}
                onClick={() => toggleLook(look.id)}
                className="group relative h-[260px] sm:h-[340px] md:h-[380px] cursor-pointer"
              >
                {/* Main Card Container with Organic Shapes */}
                <div className={`relative w-full h-full rounded-[2rem_0.5rem_2rem_0.5rem] sm:rounded-[3rem_1rem_3rem_1rem] overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.2)] border border-white/20 transition-all duration-700 ${isActive ? 'shadow-[0_20px_50px_-12px_rgba(15,118,110,0.3)]' : 'group-hover:shadow-[0_20px_50px_-12px_rgba(15,118,110,0.3)]'}`}>

                  {/* Image with subtle zoom & pan */}
                  <img
                    src={look.img}
                    alt={look.title}
                    className={`w-full h-full object-cover transition-transform duration-1000 ease-out ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}
                  />

                  {/* Aesthetic Vignette Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 transition-opacity duration-500 ${isActive ? 'opacity-80' : 'opacity-60 group-hover:opacity-80'}`} />

                  {/* Vertical Side Label */}
                  <div className="absolute top-8 sm:top-10 -left-1 origin-top-left -rotate-90 scale-75 sm:scale-100">
                    <span className={`text-[10px] font-black tracking-[0.3em] uppercase transition-colors duration-500 bg-black/20 backdrop-blur-md px-4 py-1 rounded-full border border-white/10 ${isActive ? 'text-white/90' : 'text-white/40 group-hover:text-white/90'}`}>
                      {look.label}
                    </span>
                  </div>

                  {/* Floating Glass Info Card - Redesigned with Organic Shape */}
                  <div className={`absolute bottom-4 left-4 right-4 p-3 sm:p-4 transition-all duration-700 flex flex-col justify-between bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4)] rounded-[1.5rem_0.5rem_1.5rem_0.5rem] ${
                    isActive 
                      ? 'h-[105px] sm:h-[130px] -translate-y-2' 
                      : 'h-[55px] sm:h-[70px] group-hover:h-[105px] sm:group-hover:h-[130px] group-hover:-translate-y-2'
                  }`}>
                    <div className="flex justify-between items-center">
                      <h3 className="text-white font-black text-[11px] sm:text-base leading-tight tracking-tight pr-2 drop-shadow-sm">
                        {look.title}
                      </h3>
                      <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-[0.8rem_0.3rem_0.8rem_0.3rem] bg-white flex items-center justify-center text-black shadow-lg transform transition-all duration-700 shrink-0 ${isActive ? 'rotate-[360deg] bg-teal-600 text-white' : 'group-hover:rotate-[360deg]'}`}>
                        <ArrowRight className="w-3.5 h-3.5 sm:w-5 sm:h-5" strokeWidth={3} />
                      </div>
                    </div>

                    <div className={`overflow-hidden transition-all duration-700 ease-in-out mt-3 ${isActive ? 'h-11 opacity-100' : 'h-0 opacity-0 group-hover:h-11 group-hover:opacity-100'}`}>
                      <button className="w-full h-full bg-[#0F766E] hover:bg-[#0D635C] text-white rounded-[1rem_0.3rem_1rem_0.3rem] text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] shadow-lg transition-all duration-300">
                        Explore Look
                      </button>
                    </div>
                  </div>
                </div>

                {/* Decorative background element that peeks out */}
                <div className={`absolute -z-10 inset-0 bg-[#0F766E]/5 rounded-[3rem_1rem_3rem_1rem] blur-2xl transform transition-transform duration-700 ${isActive ? 'scale-110' : 'scale-90 group-hover:scale-110'}`} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ShopTheLook;
