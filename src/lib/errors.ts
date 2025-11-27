/**
 * Standardized error responses for API endpoints
 * Provides consistent error formatting across all API routes
 */

import type { Context } from "hono";
import { z } from "zod";
import { RestateError, RestateTimeoutError } from "./restate-client.js";

// ============================================================
// Error Types
// ============================================================

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
  retryAfter?: number;
}

/**
 * HTTP status codes we use
 */
export type HttpErrorCode = 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500 | 502 | 503 | 504;

/**
 * Error codes for machine-readable error identification
 */
export const ErrorCodes = {
  // Validation errors
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_FIELD: "MISSING_FIELD",

  // Authentication/Authorization
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ADMIN_REQUIRED: "ADMIN_REQUIRED",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",
  GONE: "GONE",

  // Rate limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // Bot detection
  BOT_DETECTED: "BOT_DETECTED",
  POW_FAILED: "POW_FAILED",
  TRUST_SCORE_LOW: "TRUST_SCORE_LOW",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================
// Error Response Helpers
// ============================================================

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  code?: ErrorCode,
  details?: unknown,
  retryAfter?: number
): ApiErrorResponse {
  const response: ApiErrorResponse = { error };
  if (code) response.code = code;
  if (details) response.details = details;
  if (retryAfter) response.retryAfter = retryAfter;
  return response;
}

/**
 * Map status code to valid Hono status code type
 */
export function toHttpStatusCode(statusCode: number): HttpErrorCode {
  const validCodes: HttpErrorCode[] = [400, 401, 403, 404, 409, 410, 429, 500, 502, 503, 504];
  return validCodes.includes(statusCode as HttpErrorCode)
    ? (statusCode as HttpErrorCode)
    : 500;
}

// ============================================================
// Error Response Factories
// ============================================================

/**
 * Handle Zod validation errors
 */
export function handleZodError(c: Context, error: z.ZodError) {
  const details = error.errors.map((e) => ({
    path: e.path.join("."),
    message: e.message,
  }));

  return c.json(
    createErrorResponse(
      "Validation failed",
      ErrorCodes.VALIDATION_FAILED,
      details
    ),
    400
  );
}

/**
 * Handle Restate errors
 */
export function handleRestateError(c: Context, error: RestateError | RestateTimeoutError) {
  if (error instanceof RestateTimeoutError) {
    return c.json(
      createErrorResponse(
        "Request timed out",
        ErrorCodes.TIMEOUT
      ),
      504
    );
  }

  return c.json(
    createErrorResponse(
      error.message,
      ErrorCodes.UPSTREAM_ERROR
    ),
    toHttpStatusCode(error.statusCode)
  );
}

/**
 * Handle generic errors
 */
export function handleGenericError(c: Context, error: unknown, defaultMessage = "Internal server error") {
  const message = error instanceof Error ? error.message : defaultMessage;

  console.error("Unhandled error:", error);

  return c.json(
    createErrorResponse(message, ErrorCodes.INTERNAL_ERROR),
    500
  );
}

/**
 * Handle any error type and return appropriate response
 */
export function handleError(c: Context, error: unknown, defaultMessage = "An error occurred") {
  if (error instanceof z.ZodError) {
    return handleZodError(c, error);
  }

  if (error instanceof RestateTimeoutError || error instanceof RestateError) {
    return handleRestateError(c, error);
  }

  return handleGenericError(c, error, defaultMessage);
}

// ============================================================
// Specific Error Responses
// ============================================================

/**
 * Not found response
 */
export function notFound(c: Context, resource = "Resource") {
  return c.json(
    createErrorResponse(`${resource} not found`, ErrorCodes.NOT_FOUND),
    404
  );
}

/**
 * Unauthorized response
 */
export function unauthorized(c: Context, message = "Unauthorized") {
  return c.json(
    createErrorResponse(message, ErrorCodes.UNAUTHORIZED),
    401
  );
}

/**
 * Forbidden response
 */
export function forbidden(c: Context, message = "Forbidden") {
  return c.json(
    createErrorResponse(message, ErrorCodes.FORBIDDEN),
    403
  );
}

/**
 * Rate limit exceeded response
 */
export function rateLimitExceeded(c: Context, retryAfterSecs: number, message = "Rate limit exceeded") {
  return c.json(
    createErrorResponse(message, ErrorCodes.RATE_LIMIT_EXCEEDED, undefined, retryAfterSecs),
    429
  );
}

/**
 * Bot detected response
 */
export function botDetected(c: Context, reason?: string) {
  return c.json(
    createErrorResponse(
      reason || "Request blocked",
      ErrorCodes.BOT_DETECTED
    ),
    403
  );
}

/**
 * Conflict response
 */
export function conflict(c: Context, message: string) {
  return c.json(
    createErrorResponse(message, ErrorCodes.CONFLICT),
    409
  );
}

/**
 * Gone response (resource no longer available)
 */
export function gone(c: Context, message: string) {
  return c.json(
    createErrorResponse(message, ErrorCodes.GONE),
    410
  );
}

/**
 * Bad request response
 */
export function badRequest(c: Context, message: string, details?: unknown) {
  return c.json(
    createErrorResponse(message, ErrorCodes.INVALID_INPUT, details),
    400
  );
}

