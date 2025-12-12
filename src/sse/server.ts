/**
 * SSE (Server-Sent Events) server for real-time updates
 * Uses NATS for event subscriptions
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  subscribeDropState,
  subscribeUserState,
  subscribeQueueState,
  decodeMessage,
} from "../lib/nats.js";
import { callRestateSafe } from "../lib/restate-client.js";
import { config } from "../lib/config.js";
import { listDropIndexIds } from "../lib/nats-kv.js";
import { createLogger } from "../lib/logger.js";
import type {
  SSEEvent,
  ParticipantState,
  TicketPricing,
} from "../lib/types.js";
import type { QueueSSEEvent, QueueStatusResponse } from "../../shared/types.js";

const sseApp = new Hono();
const logger = createLogger("sse");

// CORS middleware - uses shared config
sseApp.use(
  "*",
  cors({
    origin: config.security.corsOrigins,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cache-Control"],
    exposeHeaders: ["Content-Type"],
    credentials: true,
  })
);

// Health check endpoint
sseApp.get("/health", (c) => c.json({ status: "ok", service: "sse" }));

interface DropStateResponse {
  phase: string;
  participantCount: number;
  totalTickets: number;
  inventory: number;
  winnerCount: number;
  registrationEnd: number;
  purchaseEnd?: number;
  ticketPricing: TicketPricing;
  lotteryCommitment?: string;
  initialInventory?: number;
  totalEffectiveTickets?: number;
  // Geo-fence info
  geoFence?: unknown;
  geoFenceMode?: unknown;
  geoFenceBonusMultiplier?: number;
}

/**
 * SSE endpoint for real-time updates
 * Uses NATS for event subscriptions instead of polling Restate
 */
sseApp.get("/events/:dropId/:userId", async (c) => {
  const dropId = c.req.param("dropId");
  const userId = c.req.param("userId");
  const connectionKey = `${dropId}:${userId}`;

  return streamSSE(c, async (stream) => {
    // 1. Send initial state from Restate (bootstrap)
    try {
      // Get drop state using shared client
      const dropState = await callRestateSafe<DropStateResponse>(
        "Drop",
        dropId,
        "getState",
        {},
        { timeoutMs: config.restate.apiTimeoutMs }
      );

      if (dropState) {
        const connectedEvent: SSEEvent = {
          type: "connected",
          dropId,
          phase: (dropState.phase as SSEEvent["phase"]) || "registration",
          participantCount: dropState.participantCount,
          totalTickets: dropState.totalTickets,
          inventory: dropState.inventory,
          registrationEnd: dropState.registrationEnd,
          purchaseEnd: dropState.purchaseEnd,
          serverTime: Date.now(),
          lotteryCommitment: dropState.lotteryCommitment,
          initialInventory: dropState.initialInventory,
          // Geo-fence info
          geoFence: dropState.geoFence as SSEEvent["geoFence"],
          geoFenceMode: dropState.geoFenceMode as SSEEvent["geoFenceMode"],
          geoFenceBonusMultiplier: dropState.geoFenceBonusMultiplier,
        };

        await stream.writeSSE({
          data: JSON.stringify(connectedEvent),
          event: "connected",
        });
      }

      // Get user state (includes rolloverBalance from global user state)
      const participantState = await callRestateSafe<
        ParticipantState & { rolloverBalance?: number }
      >(
        "Participant",
        connectionKey,
        "getState",
        {},
        { timeoutMs: config.restate.apiTimeoutMs }
      );

      if (participantState) {
        const userEvent: SSEEvent = {
          type: "user",
          status: participantState.status as SSEEvent["status"],
          tickets: participantState.tickets || 0,
          position: participantState.queuePosition,
          token: participantState.purchaseToken,
          // Rollover info
          rolloverUsed: participantState.rolloverUsed,
          rolloverBalance: participantState.rolloverBalance,
        };

        await stream.writeSSE({
          data: JSON.stringify(userEvent),
          event: "user",
        });
      }
    } catch (error) {
      console.error("Initial state bootstrap error:", error);
    }

    // 2. Subscribe to NATS topics
    const dropSub = await subscribeDropState(dropId);
    const userSub = await subscribeUserState(dropId, userId);

    // 3. Forward messages to SSE stream
    const forwardMessages = async () => {
      // Merge iterators or handle them concurrently
      const dropLoop = (async () => {
        for await (const msg of dropSub) {
          try {
            const data = decodeMessage(msg.data);
            await stream.writeSSE({
              data: JSON.stringify(data),
              event: "drop",
            });
          } catch (err) {
            console.error("Error forwarding drop event:", err);
          }
        }
      })();

      const userLoop = (async () => {
        for await (const msg of userSub) {
          try {
            const data = decodeMessage(msg.data);
            await stream.writeSSE({
              data: JSON.stringify(data),
              event: "user",
            });
          } catch (err) {
            console.error("Error forwarding user event:", err);
          }
        }
      })();

      await Promise.all([dropLoop, userLoop]);
    };

    // Start forwarding in background
    forwardMessages().catch((err) => {
      console.error("SSE forwarding error:", err);
    });

    // 4. Handle cleanup on disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      logger.info({ dropId, userId }, "Client disconnected");
      dropSub.unsubscribe();
      userSub.unsubscribe();
    });

    // Keep connection open
    while (!c.req.raw.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

/**
 * SSE endpoint for active drops list
 * Sends a full snapshot (active-only, sorted by soonest deadline) initially and
 * then whenever any drop.*.state event is observed.
 */
sseApp.get("/events/drops", async (c) => {
  return streamSSE(c, async (stream) => {
    const sendSnapshot = async () => {
      const ids = await listDropIndexIds();
      if (!ids.length) {
        await stream.writeSSE({
          event: "drops",
          data: JSON.stringify({ drops: [], serverTime: Date.now() }),
        });
        return;
      }

      const states = await Promise.all(
        ids.map(async (dropId) => {
          const dropState = await callRestateSafe<DropStateResponse>(
            "Drop",
            dropId,
            "getState",
            {},
            { timeoutMs: config.restate.apiTimeoutMs }
          );
          return dropState ? { dropId, ...dropState } : null;
        })
      );

      type DropListItem = DropStateResponse & { dropId: string };
      const isDropListItem = (v: unknown): v is DropListItem =>
        !!v &&
        typeof v === "object" &&
        "dropId" in (v as Record<string, unknown>);

      const active = states
        .filter(isDropListItem)
        .filter(
          (d) =>
            d.phase === "registration" ||
            d.phase === "lottery" ||
            d.phase === "purchase"
        )
        .sort((a, b) => {
          const da =
            a.phase === "purchase" && a.purchaseEnd
              ? a.purchaseEnd
              : a.registrationEnd;
          const db =
            b.phase === "purchase" && b.purchaseEnd
              ? b.purchaseEnd
              : b.registrationEnd;
          return da - db;
        });

      await stream.writeSSE({
        event: "drops",
        data: JSON.stringify({ drops: active, serverTime: Date.now() }),
      });
    };

    // initial snapshot
    try {
      await sendSnapshot();
    } catch (err) {
      logger.error({ err }, "Drops SSE: failed initial snapshot");
    }

    // Subscribe to all drop state changes
    const { subscribeAllDropStates } = await import("../lib/nats.js");
    const sub = await subscribeAllDropStates();

    // Debounce snapshot broadcasts to avoid flooding
    let scheduled: NodeJS.Timeout | null = null;
    const scheduleSnapshot = () => {
      if (scheduled) return;
      scheduled = setTimeout(async () => {
        scheduled = null;
        try {
          await sendSnapshot();
        } catch (err) {
          logger.error({ err }, "Drops SSE: failed snapshot broadcast");
        }
      }, 200);
      scheduled.unref();
    };

    (async () => {
      for await (const msg of sub) {
        // subject is drop.{dropId}.state
        const parts = msg.subject.split(".");
        const changedDropId = parts[1];
        logger.debug(
          { changedDropId },
          "Drop state changed; scheduling drops snapshot"
        );
        scheduleSnapshot();
      }
    })().catch((err) => {
      logger.error({ err }, "Drops SSE: subscription loop crashed");
    });

    c.req.raw.signal.addEventListener("abort", () => {
      sub?.unsubscribe();
      if (scheduled) clearTimeout(scheduled);
      logger.info("Drops SSE client disconnected");
    });

    while (!c.req.raw.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

/**
 * SSE endpoint for queue position updates
 * Clients subscribe with their queue token to receive position updates
 */
sseApp.get("/events/queue/:dropId/:token", async (c) => {
  const dropId = c.req.param("dropId");
  const token = c.req.param("token");

  return streamSSE(c, async (stream) => {
    // 1. Send initial queue status
    try {
      const queueStatus = await callRestateSafe<QueueStatusResponse>(
        "QueueAdmission",
        dropId,
        "checkToken",
        { tokenId: token },
        { timeoutMs: config.restate.apiTimeoutMs }
      );

      if (queueStatus?.status) {
        const initialEvent: QueueSSEEvent = {
          type:
            queueStatus.status === "ready" ? "queue_ready" : "queue_position",
          position: queueStatus.position,
          estimatedWaitSeconds: queueStatus.estimatedWaitSeconds,
          token: token,
          expiresAt: queueStatus.expiresAt,
        };

        await stream.writeSSE({
          data: JSON.stringify(initialEvent),
          event: initialEvent.type,
        });
      }
    } catch (error) {
      console.error("Queue status bootstrap error:", error);
    }

    // 2. Subscribe to queue events for this token
    const queueSub = await subscribeQueueState(dropId, token);

    // 3. Forward queue messages to SSE stream
    const forwardQueue = async () => {
      for await (const msg of queueSub) {
        try {
          const data = decodeMessage(msg.data) as QueueSSEEvent;
          await stream.writeSSE({
            data: JSON.stringify(data),
            event: data.type,
          });
        } catch (err) {
          console.error("Error forwarding queue event:", err);
        }
      }
    };

    // Start forwarding in background
    forwardQueue().catch((err) => {
      console.error("Queue SSE forwarding error:", err);
    });

    // 4. Handle cleanup on disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      logger.info({ dropId, token }, "Queue client disconnected");
      queueSub.unsubscribe();
    });

    // Keep connection open
    while (!c.req.raw.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

export default sseApp;
