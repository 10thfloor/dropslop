/**
 * NATS pub/sub utilities for real-time messaging
 * Uses shared config and provides fire-and-forget publishing
 */

import { connect } from "@nats-io/transport-node";
import type { NatsConnection, Subscription } from "@nats-io/nats-core";
import {
  type DropStateEvent,
  type UserStateEvent,
  type QueueStateEvent,
  getDropTopic,
  getUserTopic,
  getQueueTopic,
} from "./events.js";
import { createLogger } from "./logger.js";
import { config } from "./config.js";

const logger = createLogger("nats");
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Connection state with promise-based lock to prevent race conditions
let natsConnection: NatsConnection | null = null;
let connectionPromise: Promise<NatsConnection> | null = null;

/**
 * Get the NATS connection (creates if needed)
 * Uses promise-based lock to prevent race conditions
 */
export async function getNatsConnection(): Promise<NatsConnection> {
  // Return existing connection
  if (natsConnection) return natsConnection;

  // Return pending connection promise (concurrent callers share the same attempt)
  if (connectionPromise) return connectionPromise;

  // Create new connection with lock
  connectionPromise = (async () => {
    try {
      const conn = await connect({
        servers: config.nats.url,
        maxReconnectAttempts: config.nats.maxReconnectAttempts,
      });

      // Handle connection close
      conn.closed().then((err) => {
        logger.info({ err }, "NATS connection closed");
        natsConnection = null;
        connectionPromise = null;
      });

      logger.info({ url: config.nats.url }, "Connected to NATS");
      natsConnection = conn;
      return conn;
    } catch (error) {
      logger.error({ err: error }, "Failed to connect to NATS");
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

// ============================================================
// Publishing helpers
// ============================================================

/**
 * Publish drop state update to NATS
 *
 * DESIGN NOTE: Fire-and-forget pattern
 * -----------------------------------
 * We intentionally don't await these NATS publishes for several reasons:
 *
 * 1. PERFORMANCE: Publishing is on the critical path of user requests.
 *    Awaiting would add latency to every operation.
 *
 * 2. DECOUPLING: SSE clients are "best effort" - missing an update is
 *    acceptable since they can request fresh state on reconnect.
 *
 * 3. RESILIENCE: If NATS is down, we still want the core operation
 *    (Restate state change) to succeed. The state is the source of truth.
 *
 * 4. NATS GUARANTEES: NATS Core is fire-and-forget by design. Even if
 *    we awaited, we'd only know the message reached the server, not
 *    that subscribers received it.
 *
 * For guaranteed delivery, we'd use JetStream streams, but for real-time
 * notifications, fire-and-forget with retry on reconnect is appropriate.
 */
export async function publishDropState(
  dropId: string,
  state: DropStateEvent
): Promise<void> {
  try {
    const conn = await getNatsConnection();
    const topic = getDropTopic(dropId);
    conn.publish(topic, textEncoder.encode(JSON.stringify(state)));
  } catch (error) {
    logger.error({ err: error, dropId }, "Failed to publish drop state");
  }
}

/**
 * Publish user state update to NATS
 *
 * See publishDropState for design rationale on fire-and-forget pattern.
 */
export async function publishUserState(
  dropId: string,
  userId: string,
  state: UserStateEvent
): Promise<void> {
  try {
    const conn = await getNatsConnection();
    const topic = getUserTopic(dropId, userId);
    conn.publish(topic, textEncoder.encode(JSON.stringify(state)));
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to publish user state");
  }
}

/**
 * Publish queue state update to NATS
 *
 * See publishDropState for design rationale on fire-and-forget pattern.
 */
export async function publishQueueState(
  dropId: string,
  tokenId: string,
  state: QueueStateEvent
): Promise<void> {
  try {
    const conn = await getNatsConnection();
    const topic = getQueueTopic(dropId, tokenId);
    conn.publish(topic, textEncoder.encode(JSON.stringify(state)));
  } catch (error) {
    logger.error(
      { err: error, dropId, tokenId },
      "Failed to publish queue state"
    );
  }
}

// ============================================================
// Subscription helpers for SSE
// ============================================================

/**
 * Subscribe to drop state updates with error handling
 */
export async function subscribeDropState(
  dropId: string
): Promise<Subscription> {
  try {
    const conn = await getNatsConnection();
    const topic = getDropTopic(dropId);
    const subscription = conn.subscribe(topic);
    logger.debug({ dropId, topic }, "Subscribed to drop state");
    return subscription;
  } catch (error) {
    logger.error({ err: error, dropId }, "Failed to subscribe to drop state");
    throw error;
  }
}

/**
 * Subscribe to all drop state updates (wildcard)
 * Used for broadcasting drop list snapshots to homepage.
 */
export async function subscribeAllDropStates(): Promise<Subscription> {
  try {
    const conn = await getNatsConnection();
    const topic = "drop.*.state";
    const subscription = conn.subscribe(topic);
    logger.debug({ topic }, "Subscribed to all drop states");
    return subscription;
  } catch (error) {
    logger.error({ err: error }, "Failed to subscribe to all drop states");
    throw error;
  }
}

/**
 * Subscribe to user state updates with error handling
 */
export async function subscribeUserState(
  dropId: string,
  userId: string
): Promise<Subscription> {
  try {
    const conn = await getNatsConnection();
    const topic = getUserTopic(dropId, userId);
    const subscription = conn.subscribe(topic);
    logger.debug({ dropId, userId, topic }, "Subscribed to user state");
    return subscription;
  } catch (error) {
    logger.error(
      { err: error, dropId, userId },
      "Failed to subscribe to user state"
    );
    throw error;
  }
}

/**
 * Subscribe to queue state updates with error handling
 */
export async function subscribeQueueState(
  dropId: string,
  tokenId: string
): Promise<Subscription> {
  try {
    const conn = await getNatsConnection();
    const topic = getQueueTopic(dropId, tokenId);
    const subscription = conn.subscribe(topic);
    logger.debug({ dropId, tokenId, topic }, "Subscribed to queue state");
    return subscription;
  } catch (error) {
    logger.error(
      { err: error, dropId, tokenId },
      "Failed to subscribe to queue state"
    );
    throw error;
  }
}

/**
 * Safely unsubscribe from a subscription
 */
export function safeUnsubscribe(subscription: Subscription | null): void {
  if (subscription) {
    try {
      subscription.unsubscribe();
    } catch (error) {
      logger.warn({ err: error }, "Error unsubscribing");
    }
  }
}

// ============================================================
// Message decoding
// ============================================================

/**
 * Decode message with error handling
 */
export function decodeMessage(data: Uint8Array): unknown {
  try {
    return JSON.parse(textDecoder.decode(data));
  } catch (error) {
    logger.error({ err: error }, "Failed to decode NATS message");
    throw error;
  }
}

/**
 * Safe decode that returns null on error
 */
export function decodeMessageSafe(data: Uint8Array): unknown | null {
  try {
    return JSON.parse(textDecoder.decode(data));
  } catch (error) {
    logger.error({ err: error }, "Failed to decode NATS message");
    return null;
  }
}
