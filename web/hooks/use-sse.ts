"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DropState, UserState, SSEEvent, TicketPricing } from "@/lib/types";

interface SSEConnectedEvent {
  type: "connected";
  phase: DropState["phase"];
  inventory?: number;
  participantCount?: number;
  totalTickets?: number;
  totalEffectiveTickets?: number;
  registrationEnd?: number;
  purchaseEnd?: number;
  serverTime?: number;
  ticketPricing?: TicketPricing;
  lotteryCommitment?: string;
}

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

const defaultTicketPricing: TicketPricing = {
  priceUnit: 1,
  maxTickets: 10,
  costs: [0, 0, 1, 5, 14, 30, 55, 91, 140, 204, 285], // Pre-calculated for 0-10 tickets
};

const defaultDropState: DropState = {
  phase: "registration",
  inventory: 0,
  initialInventory: 0,
  participantCount: 0,
  totalTickets: 0,
  totalEffectiveTickets: 0,
  winnerCount: 0,
  backupWinnerCount: 0,
  registrationEnd: 0,
  purchaseEnd: undefined,
  ticketPricing: defaultTicketPricing,
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
        const data = JSON.parse(e.data) as SSEConnectedEvent;
        if (data.type === "connected") {
          // Sync clock on initial connection
          updateClockOffset(data.serverTime);

          setDropState((prev) => ({
            ...prev,
            phase: data.phase,
            inventory: data.inventory ?? prev.inventory,
            participantCount: data.participantCount ?? prev.participantCount,
            totalTickets: data.totalTickets || 0,
            totalEffectiveTickets: data.totalEffectiveTickets || 0,
            registrationEnd: data.registrationEnd || 0,
            purchaseEnd: data.purchaseEnd,
            ticketPricing: data.ticketPricing || prev.ticketPricing,
            lotteryCommitment: data.lotteryCommitment,
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
            lotteryCommitment: data.lotteryCommitment || prev.lotteryCommitment,
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
          setUserState((prev) => ({
            ...prev,
            status: data.status,
            tickets: data.tickets || 0,
            effectiveTickets: data.effectiveTickets,
            queuePosition: data.position,
            purchaseToken: data.token,
            rolloverUsed: data.rolloverUsed,
            rolloverBalance: data.rolloverBalance,
            // Backup winner info
            backupPosition: data.backupPosition,
            promoted: data.promoted,
            // Loyalty info
            loyaltyTier: data.loyaltyTier,
            loyaltyMultiplier: data.loyaltyMultiplier,
          }));
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
