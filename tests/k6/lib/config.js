/**
 * Shared k6 Configuration
 *
 * Centralizes environment variables and default values.
 */

// API endpoints
export const API_URL = __ENV.API_URL || "http://localhost:3003";
export const RESTATE_URL = __ENV.RESTATE_URL || "http://localhost:8080";
export const SSE_URL = __ENV.SSE_URL || "http://localhost:3004";

// Common request headers
export const JSON_HEADERS = {
  "Content-Type": "application/json",
};

/**
 * Generate a unique drop ID for testing
 * Format: {prefix}-{timestamp}-{random}
 * @param {string} prefix - Optional prefix for the drop ID
 * @returns {string} Unique drop ID
 */
export function generateDropId(prefix = "k6-test") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

