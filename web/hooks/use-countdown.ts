"use client";

import { useState, useEffect } from "react";

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  isExpired: boolean;
}

/**
 * Hook for synchronized countdown timer
 * 
 * @param targetTime - Server-authoritative end timestamp (ms)
 * @param clockOffset - Difference between server and client time (serverTime - clientTime)
 * 
 * The clockOffset corrects for differences between client and server clocks,
 * ensuring all users see the same countdown regardless of their local time.
 */
export function useCountdown(
  targetTime: number | null,
  clockOffset: number = 0
): TimeRemaining {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    total: 0,
    isExpired: false,
  });

  useEffect(() => {
    // Don't start countdown until we have a valid target time from server
    if (!targetTime || targetTime === 0) {
      setTimeRemaining({
        hours: 0,
        minutes: 0,
        seconds: 0,
        total: 0,
        isExpired: false,
      });
      return;
    }

    const calculateTimeRemaining = () => {
      // Apply clock offset to get server-synchronized "now"
      const syncedNow = Date.now() + clockOffset;
      const diff = Math.max(0, targetTime - syncedNow);
      const isExpired = diff === 0;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ hours, minutes, seconds, total: diff, isExpired });
    };

    // Calculate immediately
    calculateTimeRemaining();
    
    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetTime, clockOffset]);

  return timeRemaining;
}
