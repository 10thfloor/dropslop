/**
 * Shared k6 Configuration
 *
 * Centralizes environment variables and default values.
 */

// API endpoints
export const API_URL = __ENV.API_URL || "http://localhost:3003";
export const RESTATE_URL = __ENV.RESTATE_URL || "http://localhost:8080";
export const SSE_URL = __ENV.SSE_URL || "http://localhost:3004";

// Drop configuration
export const DROP_ID = __ENV.DROP_ID || "demo-drop-1";

// Common request headers
export const JSON_HEADERS = {
  "Content-Type": "application/json",
};

