"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  QueueTokenStatus,
  QueueBehaviorSignals,
  QueueSSEEvent,
  QueueJoinResponse,
} from "@/lib/types";

const API_BASE = "/api";

interface UseQueueOptions {
  dropId: string;
  fingerprint: string | null;
  enabled?: boolean;
  autoJoin?: boolean;
}

interface UseQueueReturn {
  status: QueueTokenStatus | "not_joined" | "joining" | "error";
  token: string | null;
  position: number | null;
  estimatedWaitSeconds: number | null;
  expiresAt: number | null;
  behaviorSignals: QueueBehaviorSignals;
  queueEnabled: boolean;
  error: string | null;
  joinQueue: () => Promise<void>;
  isReady: boolean;
}

/**
 * Create empty behavior signals
 */
function createEmptyBehaviorSignals(): QueueBehaviorSignals {
  return {
    mouseMovements: 0,
    scrollEvents: 0,
    keyPresses: 0,
    focusBlurEvents: 0,
    visibilityChanges: 0,
    timeOnPage: 0,
    interactionPatterns: "{}",
  };
}

/**
 * Hook for managing queue state and behavioral signal collection
 *
 * Features:
 * - Auto-join queue on mount (if enabled)
 * - SSE subscription for position updates
 * - Automatic behavioral signal collection
 * - Returns signals for submission with registration
 */
export function useQueue({
  dropId,
  fingerprint,
  enabled = true,
  autoJoin = true,
}: UseQueueOptions): UseQueueReturn {
  const [status, setStatus] = useState<UseQueueReturn["status"]>("not_joined");
  const [token, setToken] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [queueEnabled, setQueueEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [behaviorSignals, setBehaviorSignals] = useState<QueueBehaviorSignals>(
    createEmptyBehaviorSignals()
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pageLoadTimeRef = useRef<number>(Date.now());
  const lastMouseMoveRef = useRef<number>(0);

  // Join the queue
  const joinQueue = useCallback(async () => {
    if (!fingerprint || !enabled) return;

    setStatus("joining");
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/queue/${dropId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to join queue" }));
        throw new Error(errData.error || "Failed to join queue");
      }

      const data: QueueJoinResponse & { queueEnabled?: boolean } = await res.json();

      setQueueEnabled(data.queueEnabled !== false);
      setToken(data.token);
      setPosition(data.position);
      setEstimatedWaitSeconds(data.estimatedWaitSeconds);
      setStatus(data.status);

      // If already ready, set expiration
      if (data.status === "ready") {
        // Ready window is typically 30 seconds from now
        setExpiresAt(Date.now() + 30000);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to join queue");
    }
  }, [dropId, fingerprint, enabled]);

  // Auto-join on mount if enabled
  useEffect(() => {
    if (autoJoin && enabled && fingerprint && status === "not_joined") {
      joinQueue();
    }
  }, [autoJoin, enabled, fingerprint, status, joinQueue]);

  // SSE connection for position updates
  useEffect(() => {
    if (!token || !enabled || status === "ready" || status === "used") return;

    const sseBaseUrl = process.env.NEXT_PUBLIC_SSE_URL || "http://localhost:3004";
    const url = `${sseBaseUrl}/events/queue/${dropId}/${token}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("queue_position", (e) => {
      try {
        const data = JSON.parse(e.data) as QueueSSEEvent;
        setPosition(data.position ?? null);
        setEstimatedWaitSeconds(data.estimatedWaitSeconds ?? null);
        setStatus("waiting");
      } catch (err) {
        console.error("Failed to parse queue_position event:", err);
      }
    });

    eventSource.addEventListener("queue_ready", (e) => {
      try {
        const data = JSON.parse(e.data) as QueueSSEEvent;
        setStatus("ready");
        setExpiresAt(data.expiresAt ?? null);
        setPosition(null);
        setEstimatedWaitSeconds(null);

        // Close SSE connection when ready
        eventSource.close();
      } catch (err) {
        console.error("Failed to parse queue_ready event:", err);
      }
    });

    eventSource.addEventListener("queue_expired", () => {
      setStatus("expired");
      setToken(null);
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();

      // Reconnect after delay if still waiting
      if (status === "waiting") {
        reconnectTimeoutRef.current = setTimeout(() => {
          // Will trigger re-connection via useEffect
        }, 3000);
      }
    };

    return () => {
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [dropId, token, enabled, status]);

  // Behavioral signal collection
  useEffect(() => {
    if (!enabled) return;

    // Track mouse movements (throttled)
    const handleMouseMove = () => {
      const now = Date.now();
      // Throttle to max once per 100ms
      if (now - lastMouseMoveRef.current > 100) {
        lastMouseMoveRef.current = now;
        setBehaviorSignals((prev) => ({
          ...prev,
          mouseMovements: prev.mouseMovements + 1,
        }));
      }
    };

    // Track scroll events
    const handleScroll = () => {
      setBehaviorSignals((prev) => ({
        ...prev,
        scrollEvents: prev.scrollEvents + 1,
      }));
    };

    // Track key presses (count only, not content)
    const handleKeyDown = () => {
      setBehaviorSignals((prev) => ({
        ...prev,
        keyPresses: prev.keyPresses + 1,
      }));
    };

    // Track focus/blur
    const handleFocus = () => {
      setBehaviorSignals((prev) => ({
        ...prev,
        focusBlurEvents: prev.focusBlurEvents + 1,
      }));
    };

    // Track visibility changes
    const handleVisibilityChange = () => {
      setBehaviorSignals((prev) => ({
        ...prev,
        visibilityChanges: prev.visibilityChanges + 1,
      }));
    };

    // Update time on page periodically
    const timeInterval = setInterval(() => {
      setBehaviorSignals((prev) => ({
        ...prev,
        timeOnPage: Date.now() - pageLoadTimeRef.current,
      }));
    }, 1000);

    // Add event listeners
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(timeInterval);
    };
  }, [enabled]);

  // Update time on page when behavior signals change
  useEffect(() => {
    setBehaviorSignals((prev) => ({
      ...prev,
      timeOnPage: Date.now() - pageLoadTimeRef.current,
    }));
  }, [status]);

  return {
    status,
    token,
    position,
    estimatedWaitSeconds,
    expiresAt,
    behaviorSignals,
    queueEnabled,
    error,
    joinQueue,
    isReady: status === "ready",
  };
}

