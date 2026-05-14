/**
 * Base URL for the Express API (Curation Studio → backend preview).
 * Set `VITE_BACKEND_URL` in `.env` if the API is not on localhost:5000.
 */
export function getBackendBaseUrl(): string {
  const raw = import.meta.env.VITE_BACKEND_URL as string | undefined;
  const base = raw?.trim() || "http://localhost:5000";
  return base.replace(/\/$/, "");
}
