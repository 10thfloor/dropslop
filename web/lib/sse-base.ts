/**
 * Decide how the browser should connect to the SSE server.
 *
 * - Local dev: connect directly to the backend SSE server (default http://localhost:3004)
 *   because Next.js dev doesn't reliably proxy SSE.
 * - Production (Fly): connect via the Next.js app origin using relative /events/*
 *   so Fly's internal rewrites proxy to drop-sse.internal.
 */
export function getSseBaseUrl(): string {
  // Explicit override (useful for custom setups)
  const explicit = process.env.NEXT_PUBLIC_SSE_URL;
  if (explicit) return explicit;

  if (typeof window === "undefined") return "";

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3004";

  // Default on Fly: use same-origin relative URLs so Next.js rewrites can proxy.
  return "";
}


