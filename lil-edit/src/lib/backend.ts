/**
 * Base URL for the Express API (Curation Studio → backend preview).
 * Set `VITE_BACKEND_URL` in `.env` if the API is not on localhost:5000.
 * Unset in production means same-origin (relative) — correct when the backend
 * serves the built frontend itself (SERVE_FRONTEND=true).
 */
export function getBackendBaseUrl(): string {
  const raw = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (raw?.trim()) return raw.trim().replace(/\/$/, "");
  return import.meta.env.DEV ? "http://localhost:5000" : "";
}
