/**
 * Shared CORS configuration for all servers
 * Uses shared config for consistent allowed origins
 */

import { config } from "./config.js";

/**
 * Get allowed CORS origins from config
 */
export function getAllowedOrigins(): string[] {
  return config.security.corsOrigins;
}
