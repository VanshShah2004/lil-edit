import { getBackendBaseUrl } from "./backend";

const MAX_WIDTH     = 1200;
const JPEG_QUALITY  = 0.82;

async function compressToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale   = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const canvas  = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Image decode failed")); };
    img.src = blobUrl;
  });
}

/**
 * Compresses a File and uploads it to Supabase Storage via a backend-issued
 * signed URL (service role never touches the browser). Returns the public CDN URL.
 *
 * Path pattern: products/{baseSku}/{context}/{uuid}.jpg
 */
export async function uploadProductImage(
  file: File,
  baseSku: string,
  context: "global" | string,
): Promise<string> {
  const blob    = await compressToBlob(file);
  const slug    = context === "global" ? "global" : context.toLowerCase().replace(/\s+/g, "-");
  const path    = `products/${baseSku || "temp"}/${slug}/${crypto.randomUUID()}.jpg`;

  // 1. Request a signed upload URL from the backend (uses service role key)
  const urlRes = await fetch(`${getBackendBaseUrl()}/api/products/upload-url`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ path }),
  });
  if (!urlRes.ok) {
    const { error } = await urlRes.json().catch(() => ({ error: "Upload URL request failed" }));
    throw new Error(error ?? "Failed to get upload URL");
  }
  const { signedUrl, publicUrl } = await urlRes.json() as { signedUrl: string; publicUrl: string };

  // 2. PUT the compressed blob directly to Supabase Storage (no backend proxy)
  const uploadRes = await fetch(signedUrl, {
    method:  "PUT",
    body:    blob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!uploadRes.ok) throw new Error(`Storage upload failed (${uploadRes.status})`);

  return publicUrl;
}
