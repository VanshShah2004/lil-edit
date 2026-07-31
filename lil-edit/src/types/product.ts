export interface ProductImage {
  id: string;
  url: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ProductColor {
  name: string;
  hex: string;
  sku: string;
  stock?: number | null;
  isUnlimited?: boolean;
  images: ProductImage[];
}

export interface Review {
  id: string;
  user: string;
  // Variant SKU the review is for ('' = legacy product-level review).
  sku?: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
  images?: string[];
}

export interface RatingDistribution {
  stars: number;
  count: number;
}

export interface ReviewsData {
  averageRating: number;
  totalReviews: number;
  distribution: RatingDistribution[];
  reviews: Review[];
}

// ─── Sizing chart (admin-authored, served embedded in the PDP payload) ────────

export interface SizeChartMeasurements {
  topLength: number;
  chest: number;
  sleeve: number;
  bottomLength: number;
  waist: number;
}

export interface SizeChartRow {
  /** Display label composed server-side, e.g. "6 - 12 Months". */
  size: string;
  sizeFrom: number;
  sizeTo: number;
  sizeUnit: "Months" | "Years";
  inches: SizeChartMeasurements;
  centimeters: SizeChartMeasurements;
}

export interface ProductSizeChart {
  name: string;
  rows: SizeChartRow[];
}

export interface Product {
  title: string;
  slug: string;
  categorySlug: string;
  brand: string;
  sku: string;
  category: string;
  gender: string;
  price: number;
  originalPrice: number;
  tags: string[];
  badges: string[];
  descriptionPoints: string[];
  fabric: string;
  fit: string;
  occasion: string;
  care_instructions: string;
  sizes: string[];
  images: ProductImage[];
  colors: ProductColor[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
  isUnlimited?: boolean;
  /** Sizing chart linked via size_chart_id; null/absent = no chart (button hidden). */
  sizeChart?: ProductSizeChart | null;
  /** Loaded separately via GET /api/products/reviews on PDP */
  reviewsData?: ReviewsData;
}

