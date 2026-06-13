import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCuratedSection } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";
import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";

interface Look {
  id: string;
  label: string;
  title: string;
  img: string;
  to: string;
}

// Local content shown until the curation engine returns tiles.
const FALLBACK: Look[] = [
  { id: "1", label: "FESTIVE EDIT", title: "Celebration Look", img: le3, to: "/collections" },
  { id: "2", label: "EVERYDAY CHIC", title: "School Day Look", img: le0, to: "/collections" },
  { id: "3", label: "PARTY READY", title: "Birthday Look", img: le4, to: "/collections" },
  { id: "4", label: "BOHO BABY", title: "Weekend Look", img: le1, to: "/collections" },
];

const ShopTheLook = ({ previewItems }: { previewItems?: ResolvedItem[] }) => {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const { editorials: fetchedEditorials } = useCuratedSection("home_shop_the_look", { skip: preview });
  const editorials = preview
    ? previewItems.filter((i): i is ResolvedEditorialItem => i.kind === "editorial")
    : fetchedEditorials;

  const go = (link: string) => {
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else navigate(link);
  };

  const curated: Look[] = editorials.map((it) => ({
    id: it.id,
    label: it.subtitle ?? "",
    title: it.title ?? "",
    img: it.image ?? "",
    to: it.link ?? "/collections",
  }));
  // The grid always shows 4 looks: admin tiles first (in their order), remaining
  // slots topped up from the local mock looks. Zero curated = full mock, as before.
  const looks = [...curated, ...FALLBACK.slice(0, Math.max(0, 4 - curated.length))].slice(0, 4);
  console.log(`[ShopTheLook] curated=${curated.length} → rendering ${looks.length} (mock fill=${looks.length - Math.min(curated.length, 4)})`);

  return (
    <section className="pt-2 pb-8 md:pt-4 md:pb-12 bg-white">
      <div className="container px-4">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <p className="text-base font-black tracking-[0.2em] uppercase text-[#0B5B55] mb-0.5 pt-8 sm:pt-12">
            One Click - Full Outfit
          </p>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
              Shop the Look
            </h2>
            <button
              onClick={() => navigate("/collections")}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black text-white hover:bg-gray-800 shadow-md transition-all duration-300 shrink-0"
            >
              <ArrowRight className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Placards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10">
          {looks.map((look) => (
            <div
              key={look.id}
              onClick={() => go(look.to)}
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
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 transition-opacity duration-500 opacity-60 group-hover:opacity-80" />

                {/* Floating Glass Info Card - Redesigned with Organic Shape */}
                <div className="absolute bottom-4 left-4 right-4 p-3 sm:p-4 transition-all duration-700 flex flex-col justify-between bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4)] rounded-[1.5rem_0.5rem_1.5rem_0.5rem] h-[68px] sm:h-[70px] group-hover:h-[120px] sm:group-hover:h-[130px] group-hover:-translate-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-white font-black text-sm sm:text-base leading-tight tracking-tight pr-2 drop-shadow-sm">
                      {look.title}
                    </h3>
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black shadow-lg transform transition-all duration-700 shrink-0 group-hover:rotate-[360deg]">
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                    </div>
                  </div>

                  <div className="overflow-hidden transition-all duration-700 ease-in-out mt-3 h-0 opacity-0 group-hover:h-11 group-hover:opacity-100">
                    <button className="w-full h-full bg-[#0B5B55] hover:bg-[#094742] text-white rounded-[1rem_0.3rem_1rem_0.3rem] text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] shadow-lg transition-all duration-300">
                      Explore Look
                    </button>
                  </div>
                </div>
              </div>

              {/* Decorative background element that peeks out */}
              <div className="absolute -z-10 inset-0 bg-[#0F766E]/5 rounded-[3rem_1rem_3rem_1rem] blur-2xl transform transition-transform duration-700 scale-90 group-hover:scale-110" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ShopTheLook;
