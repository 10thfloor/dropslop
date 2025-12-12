/**
 * Queue Guard Middleware
 *
 * Validates that a user has a valid, ready queue token before allowing registration.
 * This is the enforcement layer for token-sequencing bot defense.
 *
 * Validates:
 * 1. Queue token exists and is in "ready" status
 * 2. Token hasn't expired
 * 3. Fingerprint matches the token
 * 4. Behavioral signals meet minimum threshold
 */

import type { Context, Next } from "hono";
import { config } from "../../lib/config.js";
import { getQueueToken } from "../../lib/nats-kv.js";
import {
  scoreBehavior,
  validateBehavior,
  createEmptyBehaviorSignals,
} from "../../lib/behavior-score.js";
import { callRestate } from "../../lib/restate-client.js";
import { createLogger } from "../../lib/logger.js";
import type { QueueBehaviorSignals } from "../../../shared/types.js";

const logger = createLogger("queue-guard");

/**
 * Context variables set by queue guard middleware
 */
export interface QueueGuardVariables {
  queueToken: string;
  queueTokenValid: boolean;
  behaviorScore: number;
}

/**
 * Queue guard middleware that validates queue tokens before registration
 *
 * Expects request body to contain:
 * - queueToken: string - The queue token from joining the queue
 * - behaviorSignals: QueueBehaviorSignals - Behavioral data collected during wait
 * - botValidation.fingerprint: string - Device fingerprint (must match token)
 */
export async function queueGuard(c: Context, next: Next) {
  // Skip queue validation if disabled
  if (!config.queue.enabled) {
    c.set("queueTokenValid", true);
    c.set("behaviorScore", 100);
    return next();
  }

  let body: Record<string, unknown>;

  // Prefer parsed body from earlier middleware (eg botGuard)
  body = (c.get("parsedBody") as Record<string, unknown> | undefined) ?? {};
  if (!Object.keys(body).length) {
    const clonedRequest = c.req.raw.clone();
    try {
      body = (await clonedRequest.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
  }

  // Extract queue token
  const queueToken = body.queueToken as string | undefined;

  if (!queueToken) {
    logger.debug("Missing queue token in request");
    return c.json({ error: "Queue token required" }, 400);
  }

  // Handle disabled queue case (special token)
  if (queueToken === "queue-disabled") {
    c.set("queueToken", queueToken);
    c.set("queueTokenValid", true);
    c.set("behaviorScore", 100);
    c.set("parsedBody", body);
    return next();
  }

  // Get drop ID from URL
  const dropId = c.req.param("id");
  if (!dropId) {
    return c.json({ error: "Drop ID required" }, 400);
  }

  // Get fingerprint from bot validation
  const botValidation = body.botValidation as { fingerprint?: string } | undefined;
  const fingerprint = botValidation?.fingerprint;

  if (!fingerprint) {
    return c.json({ error: "Fingerprint required" }, 400);
  }

  // Fetch token (do NOT consume yet) to validate status and attributes
  const token = await getQueueToken(dropId, queueToken);

  if (!token) {
    logger.warn({ dropId, queueToken }, "Queue token not found or already used");
    return c.json({ error: "Invalid or expired queue token" }, 403);
  }

  // Must be ready (otherwise user is early, or token already used/expired)
  if (token.status !== "ready") {
    logger.warn({ dropId, queueToken, status: token.status }, "Queue token not ready");
    return c.json({ error: "Queue token not ready - please wait for your turn" }, 429);
  }

  // Check if token was actually ready before being marked used
  // (readyAt should be set)
  if (!token.readyAt) {
    logger.warn(
      { dropId, queueToken },
      "Queue token was never marked ready"
    );
    return c.json(
      { error: "Queue token not ready - please wait for your turn" },
      429
    );
  }

  // Check expiration
  const now = Date.now();
  if (now > token.expiresAt) {
    logger.warn(
      { dropId, queueToken, expiresAt: token.expiresAt, now },
      "Queue token expired"
    );

    // Notify via Restate to clean up
    try {
      await callRestate("QueueAdmission", dropId, "markTokenExpired", {
        tokenId: queueToken,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to mark token as expired in Restate");
    }

    return c.json({ error: "Queue token expired" }, 410);
  }

  // Verify fingerprint matches
  if (token.fingerprint !== fingerprint) {
    logger.warn(
      {
        dropId,
        queueToken,
        expectedFingerprint: token.fingerprint.substring(0, 8) + "...",
        actualFingerprint: fingerprint.substring(0, 8) + "...",
      },
      "Fingerprint mismatch"
    );
    return c.json({ error: "Fingerprint mismatch" }, 403);
  }

  // Extract and validate behavioral signals
  const rawBehaviorSignals = body.behaviorSignals as Partial<QueueBehaviorSignals> | undefined;
  const behaviorSignals: QueueBehaviorSignals = rawBehaviorSignals
    ? {
        mouseMovements: rawBehaviorSignals.mouseMovements ?? 0,
        scrollEvents: rawBehaviorSignals.scrollEvents ?? 0,
        keyPresses: rawBehaviorSignals.keyPresses ?? 0,
        focusBlurEvents: rawBehaviorSignals.focusBlurEvents ?? 0,
        visibilityChanges: rawBehaviorSignals.visibilityChanges ?? 0,
        timeOnPage: rawBehaviorSignals.timeOnPage ?? 0,
        interactionPatterns: rawBehaviorSignals.interactionPatterns ?? "{}",
      }
    : createEmptyBehaviorSignals();

  // Score behavioral signals
  const behaviorResult = validateBehavior(behaviorSignals);

  if (!behaviorResult.valid) {
    logger.warn(
      {
        dropId,
        queueToken,
        behaviorScore: behaviorResult.score,
        minScore: config.queue.minBehaviorScore,
      },
      "Behavioral validation failed"
    );
    return c.json(
      {
        error: "Suspicious behavior detected",
        reason: behaviorResult.reason,
      },
      403
    );
  }

  // Consume token in Restate (single-writer). If this fails, don't proceed.
  try {
    const used = await callRestate<{ success: boolean }>(
      "QueueAdmission",
      dropId,
      "markTokenUsed",
      {
      tokenId: queueToken,
      }
    );
    if (!used?.success) {
      return c.json({ error: "Invalid or expired queue token" }, 403);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to mark token as used in Restate");
    return c.json({ error: "Invalid or expired queue token" }, 403);
  }

  logger.info(
    {
      dropId,
      queueToken,
      behaviorScore: behaviorResult.score,
    },
    "Queue token validated successfully"
  );

  // Attach validated data to context
  c.set("queueToken", queueToken);
  c.set("queueTokenValid", true);
  c.set("behaviorScore", behaviorResult.score);
  c.set("parsedBody", body);

  await next();
}

/**
 * Optional queue guard - doesn't fail if queue is disabled or token missing
 * Useful for endpoints that should work with or without queue
 */
export async function optionalQueueGuard(c: Context, next: Next) {
  // Skip if queue is disabled
  if (!config.queue.enabled) {
    c.set("queueTokenValid", true);
    c.set("behaviorScore", 100);
    return next();
  }

  // Clone the request to allow body to be read again
  const clonedRequest = c.req.raw.clone();
  let body: Record<string, unknown>;

  try {
    body = (await clonedRequest.json()) as Record<string, unknown>;
  } catch {
    // No body or invalid JSON - proceed without queue validation
    c.set("queueTokenValid", false);
    c.set("behaviorScore", 0);
    return next();
  }

  const queueToken = body.queueToken as string | undefined;

  // No token provided - proceed without validation
  if (!queueToken) {
    c.set("queueTokenValid", false);
    c.set("behaviorScore", 0);
    c.set("parsedBody", body);
    return next();
  }

  // Token provided - use full validation
  return queueGuard(c, next);
}

