"use client";

import { useState, useEffect } from "react";

/**
 * Generate a cryptographically secure user ID
 */
function generateSecureUserId(): string {
  // Use crypto.randomUUID() for secure, unique IDs
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `user-${crypto.randomUUID()}`;
  }
  // Fallback for older browsers (very rare now)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const hex = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `user-${hex}`;
}

/**
 * Non-hook helper so other client components (eg homepage lists) can resolve
 * the same persisted userId without violating Rules of Hooks.
 */
export function getOrCreateUserId(dropId?: string): string {
  const storageKey = dropId ? `dropUserId:${dropId}` : "dropUserId";
  let storedId = localStorage.getItem(storageKey);

  if (!storedId) {
    storedId = generateSecureUserId();
    localStorage.setItem(storageKey, storedId);
  }

  return storedId;
}

/**
 * Hook to get or generate a unique user ID
 * If dropId is provided, creates a drop-specific user ID
 * Uses crypto.randomUUID() for secure ID generation
 */
export function useUserId(dropId?: string): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getOrCreateUserId(dropId));
  }, [dropId]);

  return userId;
}
