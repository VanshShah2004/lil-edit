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
  rating: number;
  date: string;
  title: string;
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
  care: string;
  sizes: string[];
  images: ProductImage[];
  colors: ProductColor[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
  isUnlimited?: boolean;
  reviewsData: ReviewsData;
}

