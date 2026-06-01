import { ArrowRight } from "lucide-react";
import girlImg from "@/assets/collage/featured-categories-girl.png";
import boyImg from "@/assets/collage/featured-categories-boy.png";

const FeaturedCategories = () => {
  const categories = [
    { 
      title: "LIL GENTLEMEN", 
      sub: "BOLD & BALLER", 
      accent: "from-blue-600/20",
      img: boyImg,
      objectPos: 'center 50%'
    },
    { 
      title: "LIL DIVAS",
      sub: "GRACEFUL & SWEET", 
      accent: "from-rose-600/20",
      img: girlImg,
      objectPos: 'center 15%'
    },
  ];

  return (
    <section className="relative py-12 md:py-16 bg-white overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-[100px]" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-rose-500 rounded-full blur-[100px]" />
      </div>

      <div className="container px-4 relative z-10">
        <div className="flex flex-col md:flex-row items-stretch justify-center gap-0 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-border">
          {categories.map((category, idx) => (
            <div key={category.title} className="relative flex-1 group cursor-pointer overflow-hidden min-h-[400px] md:min-h-[550px]">
              {/* Natural Image */}
              <img
                src={category.img}
                alt={category.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" style={{ objectPosition: category.objectPos }}
              />
              
              {/* Content Overlay - Minimal for maximum image vibrancy */}
              <div className="absolute inset-0 p-6 md:p-10 flex flex-col justify-end items-start bg-black/5 group-hover:bg-black/0 transition-all duration-500">
                <h2 className="text-3xl md:text-6xl font-bold text-black tracking-tight mb-2 transition-transform duration-500 group-hover:-translate-y-2 drop-shadow-md">
                  {category.title}
                </h2>
                <p className="text-[#0F766E] text-xs md:text-sm font-bold tracking-widest mb-3 transition-transform duration-500 group-hover:-translate-y-2 drop-shadow-sm">
                  {category.sub}
                </p>
                
                <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                  <span className="text-black font-black text-sm uppercase tracking-widest">Discover Collection</span>
                  <div className="w-10 h-10 rounded-full border border-black/20 flex items-center justify-center bg-white/80 backdrop-blur-md hover:bg-black hover:text-white transition-all">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Center Divider Line (Desktop only) */}
              {idx === 0 && (
                <div className="hidden md:block absolute right-0 top-1/4 bottom-1/4 w-[1px] bg-[#9B7EC8]/10 z-20" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedCategories;
