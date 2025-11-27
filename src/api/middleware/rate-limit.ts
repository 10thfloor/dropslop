/**
 * Rate limiting middleware using NATS KV for distributed state
 * Uses shared config for settings
 */

import type { Context, Next } from "hono";
import { incrementRateLimit } from "../../lib/nats-kv.js";
import { rateLimitExceeded } from "../../lib/errors.js";
import { config } from "../../lib/config.js";

/** Skip rate limiting for local load testing */
const SKIP_RATE_LIMIT = process.env.SKIP_RATE_LIMIT === "true";

/**
 * Extract client IP from request headers
 */
function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate limiter middleware using NATS KV for distributed state
 * Works correctly across multiple instances
 */
export async function rateLimit(c: Context, next: Next) {
  // Skip rate limiting for local load testing
  if (SKIP_RATE_LIMIT) {
    return next();
  }

  const ip = getClientIp(c);

  const { exceeded } = await incrementRateLimit(
    ip,
    config.rateLimit.maxRequests,
    config.rateLimit.windowMs
  );

  if (exceeded) {
    return rateLimitExceeded(
      c,
      Math.ceil(config.rateLimit.windowMs / 1000),
      "Rate limit exceeded"
    );
  }

  await next();
}

/**
 * Stricter rate limiter for sensitive endpoints (e.g., registration)
 */
export async function strictRateLimit(c: Context, next: Next) {
  // Skip rate limiting for local load testing
  if (SKIP_RATE_LIMIT) {
    return next();
  }

  const ip = getClientIp(c);

  const { exceeded } = await incrementRateLimit(
    ip,
    config.rateLimit.strict.maxRequests,
    config.rateLimit.strict.windowMs
  );

  if (exceeded) {
    return rateLimitExceeded(
      c,
      Math.ceil(config.rateLimit.strict.windowMs / 1000),
      "Too many registration attempts"
    );
  }

  await next();
}
