import type { Context, Next } from "hono";
import { calculateTrustScore } from "../../lib/fingerprint.js";
import { verifyPow } from "../../lib/pow.js";
import type { BotValidationRequest } from "../../lib/types.js";

/**
 * Bot guard middleware that validates requests before allowing registration
 * Note: This middleware must be used with routes that expect botValidation in body
 */
export async function botGuard(c: Context, next: Next) {
  // Clone the request to allow body to be read again
  const clonedRequest = c.req.raw.clone();
  let body: Record<string, unknown>;

  try {
    body = (await clonedRequest.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const botValidation = body.botValidation as BotValidationRequest | undefined;

  if (!botValidation) {
    return c.json({ error: "Bot validation required" }, 400);
  }

  // Verify PoW first (now async with NATS KV)
  const powValid = await verifyPow(
    botValidation.powChallenge,
    botValidation.powSolution
  );

  if (!powValid) {
    return c.json({ error: "Invalid proof-of-work" }, 403);
  }

  // Calculate trust score with PoW result
  const result = await calculateTrustScore(botValidation, powValid);

  if (!result.allowed) {
    return c.json(
      { error: "Bot validation failed", reason: result.reason },
      403
    );
  }

  // Attach trust score and parsed body to context
  c.set("trustScore", result.trustScore);
  c.set("parsedBody", body);

  await next();
}
