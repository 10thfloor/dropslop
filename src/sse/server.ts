import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  getNatsConnection,
  subscribeDropState,
  subscribeUserState,
  decodeMessage,
} from "../lib/nats.js";
import type {
  SSEEvent,
  ParticipantState,
  TicketPricing,
} from "../lib/types.js";

const sseApp = new Hono();

// CORS middleware
sseApp.use(
  "*",
  cors({
    origin: [
      "http://localhost:3005",
      "http://localhost:3003",
      "http://127.0.0.1:3005",
    ],
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cache-Control"],
    exposeHeaders: ["Content-Type"],
    credentials: true,
  })
);

const RESTATE_URL = process.env.RESTATE_INGRESS_URL || "http://localhost:8080";

/**
 * Call Restate ingress API
 */
async function callRestate(
  service: string,
  key: string,
  method: string,
  payload: unknown = {}
): Promise<unknown> {
  const url = `${RESTATE_URL}/${service}/${key}/${method}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Restate error: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Failed to call Restate:", error);
    return null;
  }
}

interface DropStateResponse {
  phase: string;
  participantCount: number;
  totalTickets: number;
  inventory: number;
  winnerCount: number;
  registrationEnd: number;
  purchaseEnd?: number;
  ticketPricing: TicketPricing;
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
      // Get drop state
      const dropState = (await callRestate(
        "Drop",
        dropId,
        "getState",
        {}
      )) as DropStateResponse | null;

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
        };

        await stream.writeSSE({
          data: JSON.stringify(connectedEvent),
          event: "connected",
        });
      }

      // Get user state (includes rolloverBalance from global user state)
      const participantState = (await callRestate(
        "Participant",
        connectionKey,
        "getState",
        {}
      )) as (ParticipantState & { rolloverBalance?: number }) | null;

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
      console.log(`Client disconnected: ${userId}`);
      dropSub.unsubscribe();
      userSub.unsubscribe();
    });

    // Keep connection open
    while (!c.req.raw.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

export default sseApp;
