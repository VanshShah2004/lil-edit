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
  stock: number;
  images: ProductImage[];
}

export interface Product {
  title: string;
  brand: string;
  sku: string;
  category: string;
  gender: string;
  price: number;
  originalPrice: number;
  stock: number;
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
}
