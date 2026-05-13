import { Link } from "react-router-dom";
import { ChevronRight, Heart, Star, BadgeCheck, ThumbsUp } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";
import ProductPreviewView from "@/components/ProductPreviewView";
import type { Product } from "@/types/product";

const LAVENDER = "#B19CD9";
const TEAL = "#0B5B55";
const TEAL_DARK = "#08423E";
const SWATCH_GAP_PX = 12; // gap-3
const BETWEEN_BLOCKS_GAP_PX = SWATCH_GAP_PX * 4; // 4x swatch gap

// MOCK DATA
const product: Product & { reviewsData: any } = {
  title: "Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga",
  brand: "The Lil Edit",
  sku: "LIL-12345",
  category: "Kids Ethnic Wear",
  gender: "Girls",
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
  stock: 35,
  tags: ["Festive", "Girlswear", "Lehenga"],
  badges: ["Premium Edit"],
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
  featured: true,
  newArrival: false,
  bestseller: true,
  trending: true,
  reviewsData: {
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
        images: [product_images["product-0001"]["lil-edit-product-0001-1-2.png"]]
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
        images: [product_images["product-0001"]["lil-edit-product-0001-1-4.png"]]
      },
      {
        id: "rev-4",
        user: "Sameer M.",
        rating: 5,
        date: "15 Dec 2023",
        title: "Exceptional craftsmanship",
        comment: "I was hesitant to buy organza for a toddler, but this is so soft. The lining is pure cotton which is a big plus.",
        verified: true,
      },
      {
        id: "rev-5",
        user: "Ritu G.",
        rating: 3,
        date: "20 Dec 2023",
        title: "Runs a bit small",
        comment: "The dress is lovely but I had to exchange for a larger size. The customer service was helpful though.",
        verified: true,
      }
    ]
  }
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

export default function ProductDetail() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Breadcrumb */}
      <div className="page-container py-3 sm:py-4 text-sm text-gray-500">
        <Link to="/">Home</Link> <ChevronRight className="inline w-4 h-4 mx-1" />
        <span className="text-gray-800">{product.title}</span>
      </div>

      <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-6">
        <ProductPreviewView product={product} />

        {/* Reviews & Ratings - Full Width Section */}
        <section className="mt-16 sm:mt-24 pt-12 border-t border-gray-100">
          <div className="flex flex-col md:flex-row gap-12">
            {/* Left Column: Summary */}
            <div className="w-full md:w-1/3">
              <div className="sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                    Customer Reviews
                  </h2>
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: TEAL }}
                  >
                    <Star size={12} fill="currentColor" />
                    {product.reviewsData.averageRating}
                  </span>
                </div>

                <div
                  className="relative rounded-3xl overflow-hidden p-8 sm:p-10 mb-8"
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #f5f3ff 50%, #fef9ee 100%)",
                    border: "1px solid rgba(15,118,110,0.1)",
                  }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1.5"
                    style={{ background: `linear-gradient(90deg, ${TEAL}, ${LAVENDER}, ${TEAL})` }}
                  />


                  <div className="flex flex-col items-center">
                    <div
                      className="text-6xl font-extrabold mb-3 tracking-tighter"
                      style={{ color: TEAL }}
                    >
                      {product.reviewsData.averageRating}
                    </div>
                    <div className="flex gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={22}
                          fill={i < Math.floor(product.reviewsData.averageRating) ? "#F59E0B" : "none"}
                          stroke={i < Math.floor(product.reviewsData.averageRating) ? "#F59E0B" : "#D1D5DB"}
                          className="drop-shadow-sm"
                        />
                      ))}
                    </div>
                    <p className="text-gray-500 font-medium mb-8">
                      Based on {product.reviewsData.totalReviews} reviews
                    </p>

                    <div className="w-full space-y-3">
                      {product.reviewsData.distribution.map((item) => {
                        const pct = Math.round((item.count / product.reviewsData.totalReviews) * 100);
                        return (
                          <div key={item.stars} className="flex items-center gap-4 group">
                            <div className="w-12 shrink-0 flex items-center gap-1.5 text-sm font-bold text-slate-600">
                              {item.stars}
                              <Star size={14} fill="#F59E0B" stroke="#F59E0B" />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200/50 rounded-full overflow-hidden shadow-inner">
                              <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: item.stars >= 4
                                    ? `linear-gradient(90deg, ${TEAL}, #14B8A6)`
                                    : item.stars === 3
                                      ? "#F59E0B"
                                      : "#EF4444",
                                }}
                              />
                            </div>
                            <div className="w-10 text-right text-xs font-bold text-gray-400 group-hover:text-slate-600 transition-colors">
                              {item.count}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      className="w-full mt-10 py-4 rounded-2xl text-sm font-bold text-white shadow-xl shadow-teal-900/10 hover:brightness-95 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                      style={{ backgroundColor: TEAL }}
                    >
                      WRITE A REVIEW
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Review List */}
            <div className="w-full md:w-2/3">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-slate-800">
                  Most Relevant Reviews
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                  Sort by: <span className="text-slate-900 font-bold cursor-pointer hover:underline">Newest</span>
                </div>
              </div>

              <div className="space-y-6">
                {product.reviewsData.reviews.map((review: any) => (
                  <div
                    key={review.id}
                    className="relative p-6 sm:p-8 rounded-[2rem] border border-gray-100 bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-teal-100/50 transition-all duration-500 group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold text-white shadow-inner transform group-hover:rotate-6 transition-transform duration-500"
                          style={{ background: `linear-gradient(135deg, ${TEAL}, #14B8A6)` }}
                        >
                          {review.user.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {review.user}
                            </span>
                            {review.verified && (
                              <BadgeCheck size={16} className="text-teal-600" fill="rgba(20, 184, 166, 0.1)" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  fill={i < review.rating ? "#F59E0B" : "none"}
                                  stroke={i < review.rating ? "#F59E0B" : "#D1D5DB"}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-gray-400 font-bold tracking-tight uppercase">
                              {review.date}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 text-lg leading-snug">
                        {review.title}
                      </h4>
                      <p className="text-slate-600 leading-relaxed text-[15px]">
                        {review.comment}
                      </p>

                      {review.images && (
                        <div className="flex flex-wrap gap-3 mt-6">
                          {review.images.map((img: any, idx: number) => (
                            <div key={idx} className="relative w-24 h-32 rounded-xl overflow-hidden border border-gray-100 shadow-sm cursor-zoom-in group/img">
                              <img src={img} alt="Review" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-6 pt-4 mt-6 border-t border-gray-50">
                        <button className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-teal-700 transition-colors font-bold uppercase tracking-widest">
                          <ThumbsUp size={14} />
                          Helpful (0)
                        </button>
                        <button className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-slate-700 transition-colors font-bold uppercase tracking-widest">
                          Report
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="w-full mt-10 py-5 rounded-2xl text-sm font-bold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-200 transition-all duration-300 uppercase tracking-[0.2em] shadow-sm"
              >
                View All {product.reviewsData.totalReviews} Reviews
              </button>
            </div>
          </div>
        </section>

        {/* YOU MAY ALSO LIKE SECTION */}
        <section className="page-container w-full mt-14 pb-0 border-t border-gray-100 pt-6">
          <div className="flex items-end justify-between mb-6 sm:mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
                You May Also Like
              </h2>
              <p className="text-sm text-gray-500 mt-1">Similar styles you’ll love</p>
            </div>
            <button className="hidden sm:block text-sm font-semibold hover:underline" style={{ color: TEAL }}>
              View All
            </button>
          </div>

          {/* Mobile: Horizontal scroll | Desktop: Grid */}
          <div className="flex sm:grid overflow-x-auto sm:overflow-visible flex-nowrap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 no-scrollbar snap-x snap-mandatory px-1 sm:px-0">
            {recommendedProducts.map((item) => (
              <Link
                to={`/product/${item.id}`}
                key={item.id}
                className="w-[150px] sm:w-auto shrink-0 snap-start group flex flex-col"
              >
                {/* Image Container */}
                <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden bg-gray-50 mb-3 shadow-sm group-hover:shadow-md transition-shadow">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Wishlist Button */}
                  <button
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/70 backdrop-blur-md hover:bg-white text-slate-700 transition"
                    onClick={(e) => { e.preventDefault(); }}
                  >
                    <Heart size={14} />
                  </button>
                  {/* Add to Cart Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <button
                      className="w-full py-1.5 bg-white/90 backdrop-blur text-foreground rounded-lg font-medium text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm"
                      onClick={(e) => { e.preventDefault(); }}
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="flex justify-between items-start gap-2 px-0.5">
                  <h3 className="text-sm font-medium text-slate-800 leading-snug">
                    {item.title}
                  </h3>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-bold" style={{ color: TEAL }}>
                      ₹{item.price}
                    </span>
                    <span className="text-[10px] line-through text-gray-400">
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