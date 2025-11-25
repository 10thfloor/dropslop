import { connect } from "@nats-io/transport-node";
import type { NatsConnection, Subscription } from "@nats-io/nats-core";
import {
  type DropStateEvent,
  type UserStateEvent,
  getDropTopic,
  getUserTopic,
} from "./events.js";

let nc: NatsConnection | null = null;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// For Restate (durable) connections and SSE server
export async function getNatsConnection(): Promise<NatsConnection> {
  if (!nc) {
    nc = await connect({
      servers: process.env.NATS_URL || "nats://localhost:4222",
      maxReconnectAttempts: -1, // Retry forever
    });
    console.log("Connected to NATS");

    // Handle close
    nc.closed().then((err) => {
      console.log(
        `NATS connection closed: ${err ? err.message : "successfully"}`
      );
      nc = null;
    });
  }
  return nc;
}

// Publishing helpers
export async function publishDropState(dropId: string, state: DropStateEvent) {
  try {
    const conn = await getNatsConnection();
    const topic = getDropTopic(dropId);
    conn.publish(topic, textEncoder.encode(JSON.stringify(state)));
  } catch (error) {
    console.error(`Failed to publish drop state for ${dropId}:`, error);
  }
}

export async function publishUserState(
  dropId: string,
  userId: string,
  state: UserStateEvent
) {
  try {
    const conn = await getNatsConnection();
    const topic = getUserTopic(dropId, userId);
    conn.publish(topic, textEncoder.encode(JSON.stringify(state)));
  } catch (error) {
    console.error(`Failed to publish user state for ${userId}:`, error);
  }
}

// Subscription helpers for SSE
export async function subscribeDropState(
  dropId: string
): Promise<Subscription> {
  const conn = await getNatsConnection();
  return conn.subscribe(getDropTopic(dropId));
}

export async function subscribeUserState(
  dropId: string,
  userId: string
): Promise<Subscription> {
  const conn = await getNatsConnection();
  return conn.subscribe(getUserTopic(dropId, userId));
}

// Decode helper
export function decodeMessage(data: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(data));
}
