import { Hono } from "hono";
import { generateChallenge } from "../../lib/pow.js";
import { rateLimit } from "../middleware/rate-limit.js";

const powRouter = new Hono();

/**
 * Get a PoW challenge
 * Rate limited to prevent challenge farming
 */
powRouter.get("/challenge", rateLimit, async (c) => {
  const challenge = await generateChallenge();
  return c.json(challenge);
});

export default powRouter;
