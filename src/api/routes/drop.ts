import { Hono } from "hono";
import { z } from "zod";
import { botGuard } from "../middleware/bot-guard.js";
import type { RegisterRequest } from "../../lib/types.js";

const dropRouter = new Hono();

const RESTATE_URL = process.env.RESTATE_INGRESS_URL || "http://localhost:8080";

const registerSchema = z.object({
  userId: z.string().min(1),
  tickets: z.number().min(1).max(10).default(1), // 1-10 tickets, default 1 (free)
  botValidation: z.object({
    fingerprint: z.string().min(1),
    fingerprintConfidence: z.number().min(0).max(100),
    timingMs: z.number().min(0),
    powSolution: z.string().min(1),
    powChallenge: z.string().min(1),
  }),
});

const purchaseSchema = z.object({
  userId: z.string().min(1),
  purchaseToken: z.string().min(1),
});

/**
 * Custom error that preserves HTTP status code from Restate
 */
class RestateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "RestateError";
    this.statusCode = statusCode;
  }
}

/**
 * Call Restate ingress API
 */
async function callRestate(
  service: string,
  key: string,
  method: string,
  payload: unknown
): Promise<unknown> {
  const url = `${RESTATE_URL}/${service}/${key}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Try to extract error message from Restate response
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.message || errorText;
    } catch {
      // Keep raw text
    }
    throw new RestateError(message, response.status);
  }

  return response.json();
}

/**
 * Register for a drop (with ticket count)
 * Rollover entries are automatically applied from user's balance
 * Protected by bot validation middleware
 */
dropRouter.post("/:id/register", botGuard, async (c) => {
  try {
    const dropId = c.req.param("id");

    // Get parsed body from middleware (already validated for bot signals)
    const body = c.get("parsedBody") || (await c.req.json());
    const validated = registerSchema.parse(body);

    const request: RegisterRequest = {
      userId: validated.userId,
      tickets: validated.tickets,
      botValidation: validated.botValidation,
    };

    // Call Restate drop service
    const result = await callRestate("Drop", dropId, "register", request);

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Invalid request", details: error.errors }, 400);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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
    const dropId = c.req.param("id");

    const state = await callRestate("Drop", dropId, "getState", {});

    return c.json(state);
  } catch (error) {
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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
 */
dropRouter.post("/:id/lottery", async (c) => {
  try {
    const dropId = c.req.param("id");

    const result = await callRestate("Drop", dropId, "runLottery", {});

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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
    const dropId = c.req.param("id");
    const body = await c.req.json();
    const userId = body.userId;

    if (!userId) {
      return c.json({ error: "userId required" }, 400);
    }

    const result = await callRestate("Drop", dropId, "startPurchase", {
      userId,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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
    const dropId = c.req.param("id");
    const body = await c.req.json();
    const validated = purchaseSchema.parse(body);

    // Verify token format matches expected pattern
    const tokenParts = validated.purchaseToken.split(":");
    if (tokenParts.length < 3) {
      return c.json({ error: "Invalid purchase token format" }, 400);
    }

    const [tokenDropId, tokenUserId] = tokenParts;
    if (tokenDropId !== dropId || tokenUserId !== validated.userId) {
      return c.json({ error: "Invalid purchase token" }, 400);
    }

    const result = await callRestate("Drop", dropId, "completePurchase", {
      userId: validated.userId,
      purchaseToken: validated.purchaseToken,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Invalid request", details: error.errors }, 400);
    }
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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
    const userId = c.req.param("userId");

    const result = await callRestate("UserRollover", userId, "getBalance", {});

    return c.json(result);
  } catch (error) {
    if (error instanceof RestateError) {
      return c.json({ error: error.message }, error.statusCode);
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

export default dropRouter;
