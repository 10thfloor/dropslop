import { Hono } from "hono";
import { botGuard } from "../middleware/bot-guard.js";
import { strictRateLimit } from "../middleware/rate-limit.js";
import {
  callRestate,
  RestateError,
  RestateTimeoutError,
} from "../../lib/restate-client.js";
import {
  registerRequestSchema,
  purchaseCompleteSchema,
  purchaseStartSchema,
  userIdSchema,
  dropIdSchema,
  formatZodError,
} from "../../lib/schemas.js";
import type { RegisterRequest } from "../../lib/types.js";
import { z } from "zod";

// Define context variables type
type Variables = {
  trustScore: number;
  parsedBody: Record<string, unknown>;
};

const dropRouter = new Hono<{ Variables: Variables }>();

// Request timeout for Restate calls (ms)
const RESTATE_TIMEOUT = 15000; // 15 seconds

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
 * Register for a drop (with ticket count)
 * Rollover entries are automatically applied from user's balance
 * Protected by rate limiting and bot validation middleware
 */
dropRouter.post("/:id/register", strictRateLimit, botGuard, async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Get parsed body from middleware (already validated for bot signals)
    const body = c.get("parsedBody") || (await c.req.json());
    const validationResult = registerRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(formatZodError(validationResult.error), 400);
    }

    const validated = validationResult.data;
    const request: RegisterRequest = {
      userId: validated.userId,
      tickets: validated.tickets,
      botValidation: validated.botValidation,
    };

    // Call Restate drop service with timeout
    const result = await callRestate("Drop", dropId, "register", request, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Registration request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Registration error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      500
    );
  }
});

/**
 * Get drop status (includes ticket pricing)
 */
dropRouter.get("/:id/status", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    const state = await callRestate("Drop", dropId, "getState", {}, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(state);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Status request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Status error:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get status",
      },
      500
    );
  }
});

/**
 * Trigger lottery manually
 * NOTE: In production, this should be admin-only or removed
 * The lottery runs automatically on schedule
 */
dropRouter.post("/:id/lottery", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    const result = await callRestate("Drop", dropId, "runLottery", {}, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Lottery request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Lottery error:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to run lottery",
      },
      500
    );
  }
});

/**
 * Start purchase (get token)
 */
dropRouter.post("/:id/purchase/start", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Validate request body
    const body = await c.req.json();
    const validationResult = purchaseStartSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(formatZodError(validationResult.error), 400);
    }

    const result = await callRestate(
      "Drop",
      dropId,
      "startPurchase",
      { userId: validationResult.data.userId },
      { timeoutMs: RESTATE_TIMEOUT }
    );

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Purchase start request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Purchase start error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start purchase",
      },
      500
    );
  }
});

/**
 * Complete purchase
 */
dropRouter.post("/:id/purchase", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    // Validate request body
    const body = await c.req.json();
    const validationResult = purchaseCompleteSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(formatZodError(validationResult.error), 400);
    }

    const validated = validationResult.data;

    // Verify token format: shortId.expiry.signature (e.g., "aBc1DeF2gHi3jKl4.m1abc2d.mNo5PqR6sTu7vWx8")
    const tokenParts = validated.purchaseToken.split(".");
    if (tokenParts.length !== 3 || !tokenParts[0] || !tokenParts[1] || !tokenParts[2]) {
      return c.json({ error: "Invalid purchase token format" }, 400);
    }

    const result = await callRestate(
      "Drop",
      dropId,
      "completePurchase",
      {
      userId: validated.userId,
      purchaseToken: validated.purchaseToken,
      },
      { timeoutMs: RESTATE_TIMEOUT }
    );

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Purchase request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Purchase error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Purchase failed" },
      500
    );
  }
});

/**
 * Get user's rollover balance (cross-drop)
 */
dropRouter.get("/rollover/:userId", async (c) => {
  try {
    // Validate user ID
    const userIdResult = userIdSchema.safeParse(c.req.param("userId"));
    if (!userIdResult.success) {
      return c.json(formatZodError(userIdResult.error), 400);
    }
    const userId = userIdResult.data;

    const result = await callRestate("UserRollover", userId, "getBalance", {}, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Rollover balance request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Rollover balance error:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get rollover balance",
      },
      500
    );
  }
});

/**
 * Get lottery proof for verification
 * Returns the commitment (before lottery) or full proof (after lottery)
 * Anyone can use this to verify the lottery was fair
 */
dropRouter.get("/:id/lottery-proof", async (c) => {
  try {
    // Validate drop ID
    const dropIdResult = dropIdSchema.safeParse(c.req.param("id"));
    if (!dropIdResult.success) {
      return c.json(formatZodError(dropIdResult.error), 400);
    }
    const dropId = dropIdResult.data;

    const result = await callRestate("Drop", dropId, "getLotteryProof", {}, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Lottery proof request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Lottery proof error:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get lottery proof",
      },
      500
    );
  }
});

/**
 * Get user's loyalty stats (cross-drop)
 */
dropRouter.get("/loyalty/:userId", async (c) => {
  try {
    // Validate user ID
    const userIdResult = userIdSchema.safeParse(c.req.param("userId"));
    if (!userIdResult.success) {
      return c.json(formatZodError(userIdResult.error), 400);
    }
    const userId = userIdResult.data;

    const result = await callRestate("UserLoyalty", userId, "getMultiplier", {}, {
      timeoutMs: RESTATE_TIMEOUT,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      return c.json({ error: "Loyalty stats request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, toHttpErrorCode(error.statusCode));
    }
    console.error("Loyalty stats error:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get loyalty stats",
      },
      500
    );
  }
});

export default dropRouter;
