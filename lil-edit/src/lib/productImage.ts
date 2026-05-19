/**
 * Product image CDN / transform helpers for PDP gallery performance.
 * Supports Supabase Storage image transforms (WebP, resize, quality).
 */

export type ProductImageVariant = "hero" | "thumbnail" | "carousel" | "fullscreen";

const VARIANT_WIDTH: Record<ProductImageVariant, number> = {
  thumbnail: 128,
  carousel: 960,
  hero: 1200,
  fullscreen: 1920,
};

const VARIANT_QUALITY: Record<ProductImageVariant, number> = {
  thumbnail: 75,
  carousel: 80,
  hero: 82,
  fullscreen: 88,
};

/** Widths for responsive hero srcset (display ~400–1200px). */
export const HERO_SRCSET_WIDTHS = [480, 720, 960, 1200] as const;

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";

function isTransformableUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return false;
  return url.includes(SUPABASE_OBJECT_PATH) || url.includes(SUPABASE_RENDER_PATH);
}

/**
 * Optional CDN base: set VITE_IMAGE_CDN_BASE to rewrite origins (e.g. Cloudflare in front of Supabase).
 * Example: VITE_IMAGE_CDN_BASE=https://images.yourdomain.com
 */
function applyCdnBase(url: string): string {
  const cdnBase = (import.meta.env.VITE_IMAGE_CDN_BASE as string | undefined)?.trim();
  if (!cdnBase) return url;
  try {
    const parsed = new URL(url);
    const cdn = new URL(cdnBase.replace(/\/$/, ""));
    return `${cdn.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Build an optimized image URL (WebP + resize) for Supabase Storage, or pass through others unchanged.
 */
export function optimizeProductImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "webp" | "origin";
  } = {}
): string {
  if (!url || !isTransformableUrl(url)) return url;

  let base = url.includes(SUPABASE_RENDER_PATH)
    ? url.split("?")[0]!
    : url.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH).split("?")[0]!;

  const params = new URLSearchParams();
  if (options.width) params.set("width", String(Math.round(options.width)));
  if (options.height) params.set("height", String(Math.round(options.height)));
  params.set("quality", String(options.quality ?? 80));
  if (options.format !== "origin") params.set("format", "webp");

  const optimized = `${base}?${params.toString()}`;
  return applyCdnBase(optimized);
}

export function getOptimizedUrlForVariant(url: string, variant: ProductImageVariant): string {
  return optimizeProductImageUrl(url, {
    width: VARIANT_WIDTH[variant],
    quality: VARIANT_QUALITY[variant],
    format: "webp",
  });
}

export function buildProductImageSrcSet(
  url: string,
  widths: readonly number[] = HERO_SRCSET_WIDTHS,
  quality = 82
): string {
  if (!isTransformableUrl(url)) return "";
  return widths
    .map((w) => `${optimizeProductImageUrl(url, { width: w, quality, format: "webp" })} ${w}w`)
    .join(", ");
}

/** Preconnect to Supabase (or CDN) for faster first hero image. Call once per PDP mount. */
export function preconnectProductImageOrigin(): () => void {
  const raw =
    (import.meta.env.VITE_IMAGE_CDN_BASE as string | undefined)?.trim() ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (!raw) return () => {};

  let origin: string;
  try {
    origin = new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return () => {};
  }

  const existing = document.querySelector(`link[rel="preconnect"][href="${origin}"]`);
  if (existing) return () => {};

  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);

  return () => {
    link.remove();
  };
}
