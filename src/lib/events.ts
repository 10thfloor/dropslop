import type { SSEEvent } from "./types.js";

// Re-use SSEEvent type for consistency with client
export type DropStateEvent = Omit<SSEEvent, "type" | "dropId"> & {
  type: "drop";
};

export type UserStateEvent = Omit<SSEEvent, "type" | "dropId"> & {
  type: "user";
};

export function getDropTopic(dropId: string): string {
  return `drop.${dropId}.state`;
}

export function getUserTopic(dropId: string, userId: string): string {
  return `drop.${dropId}.user.${userId}`;
}
