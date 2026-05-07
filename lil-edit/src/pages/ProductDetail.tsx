import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Heart,
  ShoppingBag,
  Star,
  Share2,
  Minus,
  Plus,
  X,
  ChevronLeft
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi
} from "@/components/ui/carousel";

const LAVENDER = "#C4B5D9";
const TEAL = "#0F766E";
const TEAL_DARK = "#115E59";
const SWATCH_GAP_PX = 12; // gap-3
const BETWEEN_BLOCKS_GAP_PX = SWATCH_GAP_PX * 4; // 4x swatch gap

// MOCK DATA
const product = {
  title: "Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga",
  sku: "LIL-12345",
  category: "Kids Ethnic Wear",
  descriptionPoints: [
    "Top Closure: Tie-up knot at the back",
    "Bottom Closure: Side hook-and-zip",
    "Lining: Cotton lining",
    "Note: Embroidery placement may vary from the website image",
    "Note: The curve of the lehenga hem may vary as it is machine-wired",
    "Gender: Girls",
    "Material: Organza",
    "Colour: Lavender",
    "Waistband: Drawstring",
    "Sleeve Length: Sleeveless",
    "Image Taken Of: 2 - 3 Years",
    "Washing Care: Dry Clean",
    "Made in India",
  ],
  fabric: "Silk blend with soft inner lining",
  fit: "Regular fit",
  occasion: "Festive, Wedding, Party",
  care: "Dry clean recommended",
  price: 4999,
  originalPrice: 6500,
  images: [
    product_images["product-0001"]["lil-edit-product-0001-1-1.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-2.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-3.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-4.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-5.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-6.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-7.png"],
  ],
  sizes: ["6-12 Months", "1-2 Years", "2-3 Years", "3-4 Years"],
  colors: [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#000000" },
  ],
};

const recommendedProducts = [
  {
    id: "rec-1",
    title: "Lilac Embroidered Georgette Lehenga Set",
    price: 3500,
    originalPrice: 4200,
    image: product_images["product-0001"]["lil-edit-product-0001-1-2.png"]
  },
  {
    id: "rec-2",
    title: "Mint Green Ruffle Trim Party Dress",
    price: 2999,
    originalPrice: 3599,
    image: product_images["product-0001"]["lil-edit-product-0001-1-3.png"]
  },
  {
    id: "rec-3",
    title: "Ivory Organza Peplum Kurta with Dhoti Pants",
    price: 4500,
    originalPrice: 5100,
    image: product_images["product-0001"]["lil-edit-product-0001-1-4.png"]
  },
  {
    id: "rec-4",
    title: "Blush Pink Net Indo-Western Gown",
    price: 5200,
    originalPrice: 6000,
    image: product_images["product-0001"]["lil-edit-product-0001-1-5.png"]
  },
  {
    id: "rec-5",
    title: "Mustard Yellow Silk Blend Sharara Suit",
    price: 3800,
    originalPrice: 4500,
    image: product_images["product-0001"]["lil-edit-product-0001-1-6.png"]
  }
];

const reviewsData = {
  averageRating: 4.8,
  totalReviews: 124,
  distribution: [
    { stars: 5, count: 98 },
    { stars: 4, count: 18 },
    { stars: 3, count: 5 },
    { stars: 2, count: 2 },
    { stars: 1, count: 1 },
  ],
  reviews: [
    {
      id: "rev-1",
      user: "Priya S.",
      rating: 5,
      date: "12 Oct 2023",
      title: "Absolutely gorgeous lehenga!",
      comment: "The quality of the organza is amazing and my daughter loved wearing it for Diwali. Highly recommend!",
      verified: true,
    },
    {
      id: "rev-2",
      user: "Neha Verma",
      rating: 4,
      date: "05 Nov 2023",
      title: "Beautiful color, slightly loose",
      comment: "The lavender color is precisely as shown in the pictures. The fit was a tiny bit loose around the waist but the drawstring helped.",
      verified: true,
    },
    {
      id: "rev-3",
      user: "Anjali K.",
      rating: 5,
      date: "28 Nov 2023",
      title: "Perfect festive wear",
      comment: "Stunning design. The knot top looks very cute and the material is soft enough for kids. Worth the price.",
      verified: true,
    }
  ]
};

export default function ProductDetail() {
  const [activeImage, setActiveImage] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isDesktopViewer, setIsDesktopViewer] = useState(false);
  const [viewerApi, setViewerApi] = useState<CarouselApi>();
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]);
  const [selectedColor, setSelectedColor] = useState(product.colors[0].name);
  const [quantity, setQuantity] = useState(1);
  const [qtyBesideColors, setQtyBesideColors] = useState(true);

  const colorQtyWrapRef = useRef<HTMLDivElement | null>(null);
  const colorsRowRef = useRef<HTMLDivElement | null>(null);
  const qtyBlockRef = useRef<HTMLDivElement | null>(null);
  const normalThumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const canOpenViewer = true;

  useLayoutEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const idx = api.selectedScrollSnap();
      setActiveImage(idx);
      if (viewerApi) viewerApi.scrollTo(idx);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, viewerApi]);

  useLayoutEffect(() => {
    if (!viewerApi) return;
    const onSelect = () => {
      const idx = viewerApi.selectedScrollSnap();
      setActiveImage(idx);
      if (api) api.scrollTo(idx);
    };
    viewerApi.on("select", onSelect);
    return () => {
      viewerApi.off("select", onSelect);
    };
  }, [viewerApi, api]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktopViewer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isViewerOpen) return;

    // Sync initial state when opened
    if (viewerApi) {
      viewerApi.scrollTo(activeImage, true);
    }

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsViewerOpen(false);
      else if (e.key === "ArrowLeft") viewerApi?.scrollPrev();
      else if (e.key === "ArrowRight") viewerApi?.scrollNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isViewerOpen, viewerApi, activeImage]);

  useEffect(() => {
    if (isViewerOpen && thumbnailStripRef.current) {
      const activeEl = thumbnailStripRef.current.children[activeImage] as HTMLElement;
      if (activeEl) {
        const scrollLeft = activeEl.offsetLeft - thumbnailStripRef.current.clientWidth / 2 + activeEl.clientWidth / 2;
        thumbnailStripRef.current.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }

    if (normalThumbnailStripRef.current) {
      const activeEl = normalThumbnailStripRef.current.children[activeImage] as HTMLElement;
      if (activeEl) {
        if (isDesktopViewer) {
          const scrollTop = activeEl.offsetTop - normalThumbnailStripRef.current.clientHeight / 2 + activeEl.clientHeight / 2;
          normalThumbnailStripRef.current.scrollTo({ top: scrollTop, behavior: "smooth" });
        } else {
          const scrollLeft = activeEl.offsetLeft - normalThumbnailStripRef.current.clientWidth / 2 + activeEl.clientWidth / 2;
          normalThumbnailStripRef.current.scrollTo({ left: scrollLeft, behavior: "smooth" });
        }
      }
    }
  }, [activeImage, isViewerOpen, isDesktopViewer]);

  const handleThumbnailClick = (idx: number) => {
    setActiveImage(idx);
    api?.scrollTo(idx);
    viewerApi?.scrollTo(idx);
  };

  const decreaseQuantity = () => setQuantity((prev) => Math.max(1, prev - 1));
  const increaseQuantity = () => setQuantity((prev) => prev + 1);

  useLayoutEffect(() => {
    const el = colorQtyWrapRef.current;
    const colorsEl = colorsRowRef.current;
    const qtyEl = qtyBlockRef.current;
    if (!el || !colorsEl || !qtyEl) return;

    const compute = () => {
      const wrapWidth = el.clientWidth;
      const colorsWidth = colorsEl.offsetWidth;
      const qtyWidth = qtyEl.offsetWidth;
      const fits =
        colorsWidth + BETWEEN_BLOCKS_GAP_PX + qtyWidth <= wrapWidth;
      setQtyBesideColors(fits);
    };

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    ro.observe(colorsEl);
    ro.observe(qtyEl);
    return () => ro.disconnect();
  }, []);

  // FIXED STRUCTURE ONLY
// Main fix: Properly closed RIGHT DETAILS column before "You May Also Like"

return (
  <div className="min-h-screen bg-white flex flex-col">
    <Navbar />

    {/* Breadcrumb */}
    <div className="page-container py-3 sm:py-4 text-sm text-gray-500">
      <Link to="/">Home</Link>
      <ChevronRight className="inline w-4 h-4 mx-1" />
      <span className="text-gray-800">{product.title}</span>
    </div>

    <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-16">

      {/* MAIN TOP SECTION */}
      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">

        {/* LEFT - IMAGES */}
        <div className="w-full lg:w-[55%] flex flex-col lg:flex-row gap-5">

          {/* Mobile title */}
          <div className="sm:hidden order-1">
            <h1 className="text-xl font-semibold text-slate-900 leading-snug">
              {product.title}
            </h1>

            <div className="flex items-center gap-3 mt-2">
              <span
                className="text-lg font-bold"
                style={{ color: TEAL }}
              >
                ₹{product.price}
              </span>

              <span className="line-through text-gray-500">
                ₹{product.originalPrice}
              </span>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="order-3 lg:order-1 w-full lg:w-28 shrink-0 relative">
            <div
              ref={normalThumbnailStripRef}
              className="flex justify-start lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto w-full h-full lg:absolute lg:inset-0 no-scrollbar pb-1 lg:pb-0 snap-x snap-mandatory lg:snap-y scroll-smooth"
            >
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => handleThumbnailClick(idx)}
                  className={`w-20 md:w-24 lg:w-28 aspect-[4/5] rounded-xl overflow-hidden shrink-0 snap-center transition-all ${
                    activeImage === idx
                      ? "border-[3px] border-[#0F766E] shadow-sm"
                      : "border border-gray-200"
                  }`}
                >
                  <img
                    src={img}
                    alt={`${product.title} thumbnail ${idx + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Main Image */}
          <div className="order-2 lg:order-2 flex-1 flex justify-start lg:justify-center items-start">
            <Carousel
              setApi={setApi}
              opts={{ loop: true }}
              className="w-full max-w-[420px] bg-white rounded-2xl overflow-hidden shadow-md"
            >
              <CarouselContent className="ml-0">
                {product.images.map((img, idx) => (
                  <CarouselItem
                    key={idx}
                    className="pl-0 basis-full"
                  >
                    <div className="w-full aspect-[4/5] overflow-hidden">
                      <img
                        src={img}
                        alt={`${product.title} ${idx + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition duration-500"
                        draggable={false}
                        onClick={() => {
                          if (canOpenViewer) setIsViewerOpen(true);
                        }}
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        </div>

        {/* RIGHT - DETAILS */}
        <div className="w-full lg:w-[45%]">

          {/* Title */}
          <h1 className="hidden sm:block text-xl sm:text-2xl lg:text-4xl font-semibold text-slate-900 leading-snug mb-4 sm:mb-6">
            {product.title}
          </h1>

          {/* Price */}
          <div className="hidden sm:flex items-center gap-3 mb-6">
            <span
              className="text-lg sm:text-2xl font-bold"
              style={{ color: TEAL }}
            >
              ₹{product.price}
            </span>

            <span className="line-through text-gray-400">
              ₹{product.originalPrice}
            </span>
          </div>

          {/* Icons */}
          <div
            className="flex gap-4 mb-6"
            style={{ color: "#000000" }}
          >
            <Heart />
            <Share2 />
            <ShoppingBag />
            <Star />
          </div>

          {/* Colors */}
          <div className="mb-6" ref={colorQtyWrapRef}>
            <div
              className="flex items-start"
              style={{ columnGap: BETWEEN_BLOCKS_GAP_PX }}
            >
              <div className="inline-flex flex-col">
                <p className="text-sm font-medium mb-2">Color</p>

                <div
                  ref={colorsRowRef}
                  className={
                    qtyBesideColors
                      ? "inline-flex gap-3"
                      : "flex flex-wrap gap-3"
                  }
                >
                  {product.colors.map((color) => (
                    <div
                      key={color.name}
                      className="flex flex-col items-center"
                    >
                      <button
                        onClick={() =>
                          setSelectedColor(color.name)
                        }
                        className={`w-11 h-11 rounded-full border-2 ${
                          selectedColor === color.name
                            ? "border-[#115E59]"
                            : "border-gray-200"
                        }`}
                        style={{
                          backgroundColor: color.hex,
                        }}
                      />

                      <span className="mt-1 text-xs text-slate-700">
                        {color.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              {qtyBesideColors && (
                <div
                  className="shrink-0"
                  ref={qtyBlockRef}
                >
                  <p className="text-sm font-medium mb-2">
                    Quantity
                  </p>

                  <div
                    className="flex items-center border-2 rounded-full w-fit h-11"
                    style={{ borderColor: TEAL_DARK }}
                  >
                    <button
                      onClick={decreaseQuantity}
                      className="h-11 w-11 flex items-center justify-center"
                    >
                      <Minus size={18} />
                    </button>

                    <span className="px-4 font-bold">
                      {quantity}
                    </span>

                    <button
                      onClick={increaseQuantity}
                      className="h-11 w-11 flex items-center justify-center"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sizes */}
          <div className="mb-6">
            <p className="text-sm font-medium mb-2">Size</p>

            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    selectedSize === size
                      ? "bg-[#C4B5D9] text-black"
                      : "bg-gray-100 text-slate-900"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button
              className="flex-1 text-black py-3 rounded-full font-bold"
              style={{ backgroundColor: LAVENDER }}
            >
              ADD TO CART
            </button>

            <button
              className="flex-1 text-white py-3 rounded-full font-bold"
              style={{ backgroundColor: TEAL }}
            >
              BUY NOW
            </button>
          </div>

          {/* Product Details */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Product Details
            </h2>

            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-800">
              {product.descriptionPoints.map((point) => (
                <li
                  key={point}
                  className="leading-relaxed"
                >
                  {point}
                </li>
              ))}
            </ul>
          </section>

          {/* Reviews */}
          <section className="mb-2 pt-8 border-t border-gray-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">
              Reviews & Ratings
            </h2>

            <div className="space-y-6">
              {reviewsData.reviews.map((review) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 pb-6"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">
                      {review.user}
                    </span>

                    <span className="text-xs text-gray-400">
                      • {review.date}
                    </span>
                  </div>

                  <h4 className="font-medium text-sm mb-1">
                    {review.title}
                  </h4>

                  <p className="text-sm text-gray-600">
                    {review.comment}
                  </p>
                </div>
              ))}
            </div>
          </section>

        </div>
        {/* END RIGHT DETAILS */}

      </div>
      {/* END MAIN FLEX */}

      {/* YOU MAY ALSO LIKE */}
      <section className="w-full mt-0 pb-8 border-t border-gray-100 pt-6">

        <div className="flex items-end justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
              You May Also Like
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Similar styles you’ll love
            </p>
          </div>

          <button
            className="hidden sm:block text-sm font-semibold hover:underline"
            style={{ color: TEAL }}
          >
            View All
          </button>
        </div>

        <div className="flex sm:grid overflow-x-auto sm:overflow-visible flex-nowrap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 no-scrollbar snap-x snap-mandatory px-1 sm:px-0">

          {recommendedProducts.map((item) => (
            <Link
              to={`/product/${item.id}`}
              key={item.id}
              className="w-[150px] sm:w-auto shrink-0 snap-start group flex flex-col"
            >
              <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden bg-gray-50 mb-3 shadow-sm group-hover:shadow-md transition-shadow">

                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                <button
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/70"
                  onClick={(e) => e.preventDefault()}
                >
                  <Heart size={14} />
                </button>
              </div>

              <div className="flex flex-col flex-1 px-0.5">

                <h3 className="text-sm font-medium text-slate-800 line-clamp-2 mb-1.5 leading-snug">
                  {item.title}
                </h3>

                <div className="mt-auto flex items-center gap-2">
                  <span
                    className="font-bold"
                    style={{ color: TEAL }}
                  >
                    ₹{item.price}
                  </span>

                  <span className="text-xs line-through text-gray-400">
                    ₹{item.originalPrice}
                  </span>
                </div>
              </div>
            </Link>
          ))}

        </div>
      </section>

    </main>

    <Footer />
  </div>
);
}