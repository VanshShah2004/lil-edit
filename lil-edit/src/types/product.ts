export interface ProductColor {
  name: string;
  hex: string;
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
  images: string[];
  sizes: string[];
  colors: ProductColor[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
}
