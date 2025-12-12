/**
 * Queue API routes for token-sequencing bot defense
 *
 * Endpoints:
 * - POST /queue/:dropId/join - Join the queue (returns token + position)
 * - GET /queue/:dropId/status/:token - Check queue status
 * - POST /queue/:dropId/heartbeat - Keep-alive + submit behavioral signals
 */

import { Hono } from "hono";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  callRestate,
  RestateError,
  RestateTimeoutError,
} from "../../lib/restate-client.js";
import { hashIpForQueue } from "../../lib/nats-kv.js";
import { config } from "../../lib/config.js";
import { z } from "zod";
import { formatZodError, dropIdSchema } from "../../lib/schemas.js";
import type { QueueBehaviorSignals } from "../../../shared/types.js";
import type { QueueTokenStatus } from "../../../shared/types.js";

// Request timeout for Restate calls (ms)
const RESTATE_TIMEOUT = 15000;

type JoinQueueResult = {
  success: boolean;
  token?: string;
  position?: number;
  estimatedWaitSeconds?: number;
  status?: QueueTokenStatus;
  error?: string;
};

type CheckTokenResult = {
  found: boolean;
  status?: QueueTokenStatus;
  position?: number;
  estimatedWaitSeconds?: number;
  expiresAt?: number;
  readyAt?: number;
};

type QueueStatsResult = {
  waitingCount: number;
  readyCount: number;
  totalIssued: number;
  totalAdmitted: number;
  admissionLoopActive: boolean;
};

/**
 * Helper to map error status codes to Hono-compatible types
 */
type HttpErrorCode = 400 | 401 | 403 | 404 | 409 | 410 | 500 | 502 | 503 | 504;

function toHttpErrorCode(statusCode: number): HttpErrorCode {
  const validCodes: HttpErrorCode[] = [400, 401, 403, 404, 409, 410, 500, 502, 503, 504];
  return validCodes.includes(statusCode as HttpErrorCode)
    ? (statusCode as HttpErrorCode)
    : 500;
}

/**
 * Extract client IP from request headers
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

// Validation schemas
const joinQueueSchema = z.object({
  fingerprint: z.string().min(4, "Fingerprint too short"),
});

const heartbeatSchema = z.object({
  token: z.string().min(1, "Token required"),
  behaviorSignals: z.object({
    mouseMovements: z.number().int().min(0),
    scrollEvents: z.number().int().min(0),
    keyPresses: z.number().int().min(0),
    focusBlurEvents: z.number().int().min(0),
    visibilityChanges: z.number().int().min(0),
    timeOnPage: z.number().int().min(0),
    interactionPatterns: z.string(),
  }).optional(),
});

const tokenSchema = z.string().min(1, "Token required");

const queueRouter = new Hono();

/**
 * Join the queue for a drop
 * Rate limited to prevent queue flooding
 *
 * Returns:
 * - token: Queue token (used for registration)
 * - position: Current position in queue
 * - estimatedWaitSeconds: Estimated wait time
 * - status: "waiting" | "ready"
 */
queueRouter.post("/:dropId/join", rateLimit, async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("dropId"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Check if queue is enabled
    if (!config.queue.enabled) {
      // Return a mock "ready" response when queue is disabled
      return c.json({
        success: true,
        token: "queue-disabled",
        position: 0,
        estimatedWaitSeconds: 0,
        status: "ready",
        queueEnabled: false,
      });
    }

    // Validate request body
    const body = await c.req.json();
    const validationResult = joinQueueSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(formatZodError(validationResult.error), 400);
    }

    const { fingerprint } = validationResult.data;

    // Hash IP for privacy
    const clientIp = getClientIp(c);
    const ipHash = hashIpForQueue(clientIp);

    // Call Restate queue admission service
    const result = await callRestate<JoinQueueResult>(
      "QueueAdmission",
      dropId,
      "joinQueue",
      { fingerprint, ipHash },
      { timeoutMs: RESTATE_TIMEOUT }
    );

    if (!result.success) {
      return c.json({ error: result.error }, 429);
    }

    return c.json({
      success: true,
      token: result.token,
      position: result.position,
      estimatedWaitSeconds: result.estimatedWaitSeconds,
      status: result.status,
      queueEnabled: true,
    });
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Queue join request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Queue join error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to join queue" },
      500
    );
  }
});

/**
 * Check queue status for a token
 *
 * Returns:
 * - status: "waiting" | "ready" | "used" | "expired"
 * - position: Current position (if waiting)
 * - estimatedWaitSeconds: Estimated wait time (if waiting)
 * - expiresAt: Expiration timestamp (if ready)
 */
queueRouter.get("/:dropId/status/:token", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("dropId"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Validate token
    const tokenResult = tokenSchema.safeParse(c.req.param("token"));
    if (!tokenResult.success) {
      return c.json({ error: "Invalid token" }, 400);
    }
    const tokenId = tokenResult.data;

    // Check if queue is enabled
    if (!config.queue.enabled) {
      return c.json({
        found: true,
        status: "ready",
        queueEnabled: false,
      });
    }

    // Call Restate queue admission service
    const result = await callRestate<CheckTokenResult>(
      "QueueAdmission",
      dropId,
      "checkToken",
      { tokenId },
      { timeoutMs: RESTATE_TIMEOUT }
    );

    if (!result.found) {
      return c.json({ error: "Token not found" }, 404);
    }

    return c.json({
      found: true,
      status: result.status,
      position: result.position,
      estimatedWaitSeconds: result.estimatedWaitSeconds,
      expiresAt: result.expiresAt,
      readyAt: result.readyAt,
      queueEnabled: true,
    });
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Queue status request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Queue status error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to check queue status" },
      500
    );
  }
});

/**
 * Heartbeat - keep token alive and submit behavioral signals
 * Called periodically by the frontend while waiting
 */
queueRouter.post("/:dropId/heartbeat", rateLimit, async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("dropId"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Validate request body
    const body = await c.req.json();
    const validationResult = heartbeatSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(formatZodError(validationResult.error), 400);
    }

    const { token, behaviorSignals } = validationResult.data;

    // Check if queue is enabled
    if (!config.queue.enabled) {
      return c.json({
        success: true,
        status: "ready",
        queueEnabled: false,
      });
    }

    // Check token status
    const result = await callRestate<CheckTokenResult>(
      "QueueAdmission",
      dropId,
      "checkToken",
      { tokenId: token },
      { timeoutMs: RESTATE_TIMEOUT }
    );

    if (!result.found) {
      return c.json({ error: "Token not found" }, 404);
    }

    // For now, we just acknowledge the heartbeat and return current status
    // Behavioral signals are collected and will be submitted with registration
    return c.json({
      success: true,
      status: result.status,
      position: result.position,
      estimatedWaitSeconds: result.estimatedWaitSeconds,
      expiresAt: result.expiresAt,
      queueEnabled: true,
    });
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Heartbeat request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Heartbeat error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Heartbeat failed" },
      500
    );
  }
});

/**
 * Get queue statistics for a drop (admin/debug)
 */
queueRouter.get("/:dropId/stats", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("dropId"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Check if queue is enabled
    if (!config.queue.enabled) {
      return c.json({
        waitingCount: 0,
        readyCount: 0,
        totalIssued: 0,
        totalAdmitted: 0,
        admissionLoopActive: false,
        queueEnabled: false,
      });
    }

    const result = await callRestate<QueueStatsResult>(
      "QueueAdmission",
      dropId,
      "getQueueStats",
      {},
      { timeoutMs: RESTATE_TIMEOUT }
    );

    return c.json({
      ...result,
      queueEnabled: true,
    });
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Stats request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Queue stats error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get queue stats" },
      500
    );
  }
});

export default queueRouter;

