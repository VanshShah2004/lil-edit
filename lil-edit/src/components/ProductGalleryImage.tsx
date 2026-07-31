import { useState } from "react";
import {
  buildProductImageSrcSet,
  getOptimizedUrlForVariant,
  HERO_SRCSET_WIDTHS,
  type ProductImageVariant,
} from "@/lib/productImage";

export interface ProductGalleryImageProps {
  src: string;
  alt: string;
  variant: ProductImageVariant;
  className?: string;
  /** LCP hero — eager load + fetchpriority high */
  priority?: boolean;
  /** Carousel / gallery: defer off-screen slides */
  lazy?: boolean;
  draggable?: boolean;
  onClick?: () => void;
}

/**
 * Optimized <img> for PDP gallery: WebP + resize via Supabase render API, srcset on hero, lazy by default.
 */
export default function ProductGalleryImage({
  src,
  alt,
  variant,
  className = "",
  priority = false,
  lazy,
  draggable,
  onClick,
}: ProductGalleryImageProps) {
  const [useOriginal, setUseOriginal] = useState(false);
  const optimizedSrc = getOptimizedUrlForVariant(src, variant);
  const useLazy = lazy ?? !priority;
  const srcSet =
    !useOriginal && (variant === "hero" || variant === "carousel")
      ? buildProductImageSrcSet(src, HERO_SRCSET_WIDTHS)
      : undefined;

  const sizes =
    variant === "hero"
      ? "(max-width: 768px) 100vw, 55vw"
      : variant === "carousel"
        ? "100vw"
        : undefined;

  return (
    <img
      src={useOriginal ? src : optimizedSrc}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      loading={useLazy ? "lazy" : "eager"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      draggable={draggable}
      onClick={onClick}
      onError={() => {
        if (!useOriginal) setUseOriginal(true);
      }}
    />
  );
}
