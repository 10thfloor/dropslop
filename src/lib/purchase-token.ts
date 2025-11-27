/**
 * Purchase Token Utilities
 *
 * Self-verifying HMAC-signed tokens for purchase authorization.
 * Tokens can be verified cryptographically without needing stored state,
 * making them resilient to system outages.
 *
 * Token format: {shortId}.{expiresAt}.{signature}
 * - shortId: 12 random bytes (base64url, 16 chars)
 * - expiresAt: Unix timestamp in seconds (base36 encoded, ~7 chars)
 * - signature: HMAC-SHA256 truncated (base64url, 16 chars)
 *
 * Total length: ~41 chars (vs 60+ for old UUID-based format)
 */

import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * Generate a self-verifying purchase token
 * The token contains all information needed to verify it later
 */
export function generatePurchaseToken(
  dropId: string,
  userId: string,
  expiresAt: number
): string {
  // Generate short random ID (12 bytes → 16 chars base64url)
  const shortId = crypto.randomBytes(12).toString("base64url");

  // Encode expiration as base36 (compact representation)
  // Use seconds instead of ms to save space
  const expiresAtSecs = Math.floor(expiresAt / 1000);
  const expiry = expiresAtSecs.toString(36);

  // Sign dropId:userId:shortId:expiry for integrity verification
  const signature = signTokenData(dropId, userId, shortId, expiry);

  return `${shortId}.${expiry}.${signature}`;
}

/**
 * Verify a purchase token's signature and extract its data
 * Returns null if token is invalid or tampered with
 */
export function verifyPurchaseToken(
  token: string,
  dropId: string,
  userId: string
): { valid: boolean; expiresAt: number | null; error?: string } {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { valid: false, expiresAt: null, error: "Invalid token format" };
  }

  const [shortId, expiry, providedSig] = parts;

  if (!shortId || !expiry || !providedSig) {
    return { valid: false, expiresAt: null, error: "Missing token components" };
  }

  // Verify signature
  const expectedSig = signTokenData(dropId, userId, shortId, expiry);

  // Use timing-safe comparison to prevent timing attacks
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return { valid: false, expiresAt: null, error: "Invalid signature" };
  }

  // Parse expiration
  const expiresAtSecs = parseInt(expiry, 36);
  if (Number.isNaN(expiresAtSecs)) {
    return { valid: false, expiresAt: null, error: "Invalid expiration" };
  }

  const expiresAt = expiresAtSecs * 1000; // Convert back to ms

  return { valid: true, expiresAt };
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiresAt: number, now?: number): boolean {
  return (now ?? Date.now()) > expiresAt;
}

/**
 * Full token validation: verify signature AND check expiration
 */
export function validatePurchaseToken(
  token: string,
  dropId: string,
  userId: string,
  now?: number
): { valid: boolean; error?: string } {
  const result = verifyPurchaseToken(token, dropId, userId);

  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  if (result.expiresAt && isTokenExpired(result.expiresAt, now)) {
    return { valid: false, error: "Token expired" };
  }

  return { valid: true };
}

/**
 * Internal: Generate HMAC signature for token data
 */
function signTokenData(
  dropId: string,
  userId: string,
  shortId: string,
  expiry: string
): string {
  return crypto
    .createHmac("sha256", config.security.purchaseTokenSecret)
    .update(`${dropId}:${userId}:${shortId}:${expiry}`)
    .digest("base64url")
    .slice(0, 16); // 16 chars = 96 bits (plenty secure)
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return crypto.timingSafeEqual(bufA, bufB);
}

