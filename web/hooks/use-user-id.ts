"use client";

import { useState, useEffect } from "react";

/**
 * Hook to get or generate a unique user ID
 * If dropId is provided, creates a drop-specific user ID
 */
export function useUserId(dropId?: string): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Use drop-specific key so users get unique IDs per drop
    const storageKey = dropId ? `dropUserId:${dropId}` : "dropUserId";
    let storedId = localStorage.getItem(storageKey);

    if (!storedId) {
      // Generate a new unique ID
      storedId = `user-${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem(storageKey, storedId);
    }

    setUserId(storedId);
  }, [dropId]);

  return userId;
}
