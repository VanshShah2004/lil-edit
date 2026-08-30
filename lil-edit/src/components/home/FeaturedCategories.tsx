import { useNavigate } from "react-router-dom";
import { useCuratedSection, metaStr } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";
import girlImg from "@/assets/collage/featured-categories-girl.png";
import boyImg from "@/assets/collage/featured-categories-boy.png";

interface Category {
  id: string;
  title: string;
  sub: string;
  img: string;
  objectPos: string;
  to: string;
}

// Local content shown until the curation engine returns tiles.
const FALLBACK: Category[] = [
  { id: "boy", title: "LIL GENTLEMEN", sub: "BOLD & BALLER", img: boyImg, objectPos: "center 50%", to: "/collections" },
  { id: "girl", title: "LIL ANGELS", sub: "GRACEFUL & SWEET", img: girlImg, objectPos: "center 15%", to: "/collections" },
];

const FeaturedCategories = ({ previewItems }: { previewItems?: ResolvedItem[] }) => {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const { editorials: fetchedEditorials } = useCuratedSection("home_featured_categories", { skip: preview });
  const editorials = preview
    ? previewItems.filter((i): i is ResolvedEditorialItem => i.kind === "editorial")
    : fetchedEditorials;

  const go = (link: string) => {
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else navigate(link);
  };

  const curated: Category[] = editorials.map((it) => ({
    id: it.id,
    title: it.title ?? "",
    sub: it.subtitle ?? "",
    img: it.image ?? "",
    objectPos: metaStr(it.meta, "object_position") || "center 50%",
    to: it.link ?? "/collections",
  }));
  // Always show 2 categories: admin tiles first, remaining slots from the local mocks.
  const categories = [...curated, ...FALLBACK.slice(0, Math.max(0, 2 - curated.length))].slice(0, 2);
  console.log(`[FeaturedCategories] curated=${curated.length} → rendering ${categories.length} (mock fill=${categories.length - Math.min(curated.length, 2)})`);

  return (
    <section className="relative py-12 md:py-16 bg-white overflow-hidden">
      <div className="container px-4 relative z-10">
        <div className="flex flex-col md:flex-row items-stretch justify-center gap-0 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-border">
          {categories.map((category, idx) => (
            <div
              key={category.id}
              onClick={() => go(category.to)}
              className="relative flex-1 group cursor-pointer overflow-hidden min-h-[300px] md:min-h-[420px]"
            >
              {/* Natural Image */}
              <img
                src={category.img}
                alt={category.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" style={{ objectPosition: category.objectPos }}
              />

              {/* Content Overlay - Minimal for maximum image vibrancy */}
              <div className="absolute inset-0 px-6 pt-6 pb-4 md:px-10 md:pt-10 md:pb-6 flex flex-col justify-end items-start bg-black/5 group-hover:bg-black/0 transition-all duration-500">
                <h2 className="text-3xl md:text-6xl font-bold text-black tracking-tight mb-2 drop-shadow-md">
                  {category.title}
                </h2>
                <p className="text-[#0F766E] text-xs md:text-sm font-bold tracking-widest drop-shadow-sm">
                  {category.sub}
                </p>
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
