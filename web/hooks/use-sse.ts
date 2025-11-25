"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DropState, UserState, SSEEvent } from "@/lib/types";

interface UseSSEOptions {
  dropId: string;
  userId: string | null;
  enabled?: boolean;
}

interface UseSSEReturn {
  dropState: DropState;
  userState: UserState;
  connected: boolean;
  error: string | null;
  clockOffset: number; // serverTime - clientTime (for countdown sync)
}

const defaultDropState: DropState = {
  phase: "registration",
  inventory: 0,
  participantCount: 0,
  totalTickets: 0,
  winnerCount: 0,
  registrationEnd: 0,
  purchaseEnd: undefined,
};

const defaultUserState: UserState = {
  status: "not_registered",
  tickets: 0,
};

export function useSSE({
  dropId,
  userId,
  enabled = true,
}: UseSSEOptions): UseSSEReturn {
  const [dropState, setDropState] = useState<DropState>(defaultDropState);
  const [userState, setUserState] = useState<UserState>(defaultUserState);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update clock offset from server time
   * Uses exponential moving average to smooth out network jitter
   */
  const updateClockOffset = useCallback((serverTime: number | undefined) => {
    if (!serverTime) return;

    const clientTime = Date.now();
    const newOffset = serverTime - clientTime;

    setClockOffset((prevOffset) => {
      // If this is the first measurement, use it directly
      if (prevOffset === 0) return newOffset;

      // Exponential moving average (alpha = 0.3) to smooth jitter
      // Prevents countdown from jumping around due to network latency
      const alpha = 0.3;
      return Math.round(prevOffset * (1 - alpha) + newOffset * alpha);
    });
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !userId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Connect directly to SSE server (Next.js proxy doesn't handle SSE well)
    const sseBaseUrl =
      process.env.NEXT_PUBLIC_SSE_URL || "http://localhost:3004";
    const url = `${sseBaseUrl}/events/${dropId}/${userId}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent;
        if (data.type === "connected") {
          // Sync clock on initial connection
          updateClockOffset(data.serverTime);

          setDropState((prev) => ({
            ...prev,
            phase: data.phase,
            totalTickets: data.totalTickets || 0,
            registrationEnd: data.registrationEnd || 0,
            purchaseEnd: data.purchaseEnd,
          }));
        }
      } catch (err) {
        console.error("Failed to parse connected event:", err);
      }
    });

    eventSource.addEventListener("drop", (e) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent;
        if (data.type === "drop") {
          // Update clock offset on each poll
          updateClockOffset(data.serverTime);

          setDropState((prev) => ({
            ...prev,
            phase: data.phase,
            inventory: data.inventory,
            participantCount: data.participantCount,
            totalTickets: data.totalTickets || 0,
            registrationEnd: data.registrationEnd,
            purchaseEnd: data.purchaseEnd,
          }));
        }
      } catch (err) {
        console.error("Failed to parse drop event:", err);
      }
    });

    eventSource.addEventListener("user", (e) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent;
        if (data.type === "user") {
          setUserState({
            status: data.status,
            tickets: data.tickets || 0,
            queuePosition: data.position,
            purchaseToken: data.token,
            rolloverUsed: data.rolloverUsed,
            rolloverBalance: data.rolloverBalance,
          });
        }
      } catch (err) {
        console.error("Failed to parse user event:", err);
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
      setError("Connection lost");
      eventSource.close();

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [dropId, userId, enabled, updateClockOffset]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { dropState, userState, connected, error, clockOffset };
}
