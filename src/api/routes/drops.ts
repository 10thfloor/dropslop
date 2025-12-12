import { Hono } from "hono";
import { createLogger } from "../../lib/logger.js";
import { listDropIndexIds } from "../../lib/nats-kv.js";
import {
  callRestate,
  RestateError,
  RestateTimeoutError,
} from "../../lib/restate-client.js";

const logger = createLogger("drops");

const dropsRouter = new Hono();

type DropSummary = {
  dropId: string;
  phase: "registration" | "lottery" | "purchase" | "completed";
  participantCount: number;
  totalTickets: number;
  inventory: number;
  initialInventory: number;
  registrationEnd: number;
  purchaseEnd?: number;
  lotteryCommitment?: string;
};

function deadlineMs(
  d: Pick<DropSummary, "phase" | "registrationEnd" | "purchaseEnd">
): number {
  if (d.phase === "purchase" && d.purchaseEnd) return d.purchaseEnd;
  return d.registrationEnd;
}

async function mapDropIdsToStates(dropIds: string[]): Promise<DropSummary[]> {
  // Chunk requests to avoid overloading Restate ingress if there are many drops.
  const chunkSize = 25;
  const results: DropSummary[] = [];

  for (let i = 0; i < dropIds.length; i += chunkSize) {
    const chunk = dropIds.slice(i, i + chunkSize);
    const chunkStates = await Promise.all(
      chunk.map(async (dropId) => {
        const state = await callRestate(
          "Drop",
          dropId,
          "getState",
          {},
          { timeoutMs: 8000 }
        );
        return {
          dropId,
          ...(state as Omit<DropSummary, "dropId">),
        } as DropSummary;
      })
    );
    results.push(...chunkStates);
  }

  return results;
}

/**
 * List active drops (registration/lottery/purchase) sorted by soonest deadline.
 * Backed by the NATS KV drop index.
 */
dropsRouter.get("/active", async (c) => {
  const startedAt = Date.now();
  try {
    const ids = await listDropIndexIds();

    if (!ids.length) {
      return c.json({ drops: [], serverTime: Date.now() });
    }

    const states = await mapDropIdsToStates(ids);

    const active = states
      .filter(
        (d) =>
          d.phase === "registration" ||
          d.phase === "lottery" ||
          d.phase === "purchase"
      )
      .sort((a, b) => deadlineMs(a) - deadlineMs(b));

    logger.info(
      {
        totalIndexed: ids.length,
        active: active.length,
        ms: Date.now() - startedAt,
      },
      "Listed active drops"
    );

    return c.json({ drops: active, serverTime: Date.now() });
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      logger.warn({ ms: Date.now() - startedAt }, "Drops list timed out");
      return c.json({ error: "Drops request timed out" }, 504);
    }
    if (error instanceof RestateError) {
      logger.warn(
        { statusCode: error.statusCode, ms: Date.now() - startedAt },
        "Drops list Restate error"
      );
      return c.json({ error: error.message }, 502);
    }
    logger.error(
      { err: error, ms: Date.now() - startedAt },
      "Failed to list active drops"
    );
    return c.json({ error: "Failed to list active drops" }, 500);
  }
});

export default dropsRouter;
