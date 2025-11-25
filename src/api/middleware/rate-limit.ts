import type { Context, Next } from "hono";

// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // requests per window

export async function rateLimit(c: Context, next: Next) {
  const ip =
    c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const now = Date.now();

  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    // New window
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    await next();
    return;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  record.count++;
  await next();
}
