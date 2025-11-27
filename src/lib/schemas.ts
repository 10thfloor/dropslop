/**
 * Zod schemas for input validation
 * Centralized validation schemas for API endpoints
 */

import { z } from "zod";

// ============================================================
// Common Schemas
// ============================================================

/**
 * User ID schema - validates user ID format
 */
export const userIdSchema = z
  .string()
  .min(1, "User ID is required")
  .max(100, "User ID too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid user ID format");

/**
 * Drop ID schema - validates drop ID format
 */
export const dropIdSchema = z
  .string()
  .min(1, "Drop ID is required")
  .max(100, "Drop ID too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid drop ID format");

// ============================================================
// Bot Validation Schemas
// ============================================================

/**
 * Bot validation request schema
 */
export const botValidationSchema = z.object({
  fingerprint: z
    .string()
    .min(1, "Fingerprint is required")
    .max(500, "Fingerprint too long"),
  fingerprintConfidence: z
    .number()
    .min(0, "Confidence must be >= 0")
    .max(100, "Confidence must be <= 100"),
  timingMs: z
    .number()
    .min(0, "Timing must be >= 0")
    .max(3600000, "Timing too large"), // Max 1 hour
  powSolution: z
    .string()
    .min(1, "PoW solution is required")
    .max(100, "PoW solution too long"),
  powChallenge: z
    .string()
    .min(1, "PoW challenge is required")
    .max(200, "PoW challenge too long"),
});

export type BotValidation = z.infer<typeof botValidationSchema>;

// ============================================================
// Registration Schemas
// ============================================================

/**
 * Registration request schema
 */
export const registerRequestSchema = z.object({
  userId: userIdSchema,
  tickets: z
    .number()
    .int("Tickets must be an integer")
    .min(1, "Must request at least 1 ticket")
    .max(10, "Maximum 10 tickets allowed")
    .default(1),
  botValidation: botValidationSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// ============================================================
// Purchase Schemas
// ============================================================

/**
 * Purchase start request schema
 */
export const purchaseStartSchema = z.object({
  userId: userIdSchema,
});

export type PurchaseStartRequest = z.infer<typeof purchaseStartSchema>;

/**
 * Purchase complete request schema
 */
export const purchaseCompleteSchema = z.object({
  userId: userIdSchema,
  purchaseToken: z
    .string()
    .min(1, "Purchase token is required")
    .max(500, "Purchase token too long"),
});

export type PurchaseCompleteRequest = z.infer<typeof purchaseCompleteSchema>;

// ============================================================
// Drop Configuration Schemas
// ============================================================

/**
 * Drop initialization schema
 */
export const dropConfigSchema = z.object({
  dropId: dropIdSchema,
  inventory: z
    .number()
    .int("Inventory must be an integer")
    .min(1, "Must have at least 1 item")
    .max(10000, "Maximum 10000 items"),
  registrationStart: z
    .number()
    .int()
    .min(0, "Invalid timestamp"),
  registrationEnd: z
    .number()
    .int()
    .min(0, "Invalid timestamp"),
  purchaseWindow: z
    .number()
    .int()
    .min(60, "Purchase window must be at least 60 seconds")
    .max(86400, "Purchase window cannot exceed 24 hours"),
  ticketPriceUnit: z.number().min(0).optional(),
  maxTicketsPerUser: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
});

export type DropConfig = z.infer<typeof dropConfigSchema>;

// ============================================================
// SSE Schemas
// ============================================================

/**
 * SSE connection params schema
 */
export const sseParamsSchema = z.object({
  dropId: dropIdSchema,
  userId: userIdSchema,
});

export type SSEParams = z.infer<typeof sseParamsSchema>;

// ============================================================
// Validation Helpers
// ============================================================

/**
 * Validate and parse input with schema
 * Returns { success: true, data } or { success: false, error }
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod error for API response
 */
export function formatZodError(error: z.ZodError): {
  error: string;
  details: Array<{ path: string; message: string }>;
} {
  return {
    error: "Validation failed",
    details: error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  };
}

