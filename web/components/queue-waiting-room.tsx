"use client";

import { useEffect, useState } from "react";
import type { QueueTokenStatus, QueueBehaviorSignals } from "@/lib/types";

interface QueueWaitingRoomProps {
  status: QueueTokenStatus | "not_joined" | "joining" | "error";
  position: number | null;
  estimatedWaitSeconds: number | null;
  expiresAt: number | null;
  error: string | null;
  queueEnabled: boolean;
  isPowSolving: boolean;
  powProgress?: number;
  onRetry?: () => void;
}

/**
 * Format seconds into human-readable time
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Queue Waiting Room Component
 *
 * Displays queue status while user waits for their turn:
 * - Position in queue
 * - Estimated wait time
 * - PoW solving progress
 * - "Your turn!" animation when ready
 */
export function QueueWaitingRoom({
  status,
  position,
  estimatedWaitSeconds,
  expiresAt,
  error,
  queueEnabled,
  isPowSolving,
  powProgress = 0,
  onRetry,
}: QueueWaitingRoomProps) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Countdown timer for ready state
  useEffect(() => {
    if (status !== "ready" || !expiresAt) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [status, expiresAt]);

  // Queue disabled - don't show waiting room
  if (!queueEnabled) {
    return null;
  }

  // Not joined yet
  if (status === "not_joined") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">Preparing to join queue...</p>
        </div>
      </div>
    );
  }

  // Joining queue
  if (status === "joining") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">Joining queue...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-red-900/30 to-slate-900 p-6 border border-red-700/50 shadow-lg">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-red-400 font-medium mb-2">Failed to join queue</p>
          <p className="text-slate-400 text-sm mb-4">{error || "Please try again"}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Ready state - user's turn!
  if (status === "ready") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-emerald-900/50 to-slate-900 p-6 border border-emerald-500/50 shadow-lg shadow-emerald-500/10 animate-pulse">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-emerald-400 mb-2">
            Your turn!
          </h3>
          <p className="text-slate-300 mb-4">
            You can now register for the drop
          </p>
          {countdown !== null && countdown > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-300 text-sm">
                {formatTime(countdown)} remaining
              </span>
            </div>
          )}
          {countdown === 0 && (
            <p className="text-amber-400 text-sm">Time expired - please rejoin queue</p>
          )}
        </div>
      </div>
    );
  }

  // Expired state
  if (status === "expired") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-amber-900/30 to-slate-900 p-6 border border-amber-700/50 shadow-lg">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-amber-400 font-medium mb-2">Queue position expired</p>
          <p className="text-slate-400 text-sm mb-4">Please rejoin the queue</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
            >
              Rejoin Queue
            </button>
          )}
        </div>
      </div>
    );
  }

  // Waiting state
  return (
    <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 border border-slate-700 shadow-lg">
      <div className="text-center">
        {/* Queue animation */}
        <div className="w-16 h-16 mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
          <div
            className="absolute inset-0 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin"
            style={{ animationDuration: "1.5s" }}
          />
          <div className="absolute inset-2 rounded-full bg-slate-800 flex items-center justify-center">
            <span className="text-cyan-400 font-bold text-lg">
              {position || "..."}
            </span>
          </div>
        </div>

        <h3 className="text-xl font-semibold text-white mb-1">
          You&apos;re in the queue
        </h3>

        {position && (
          <p className="text-slate-400 mb-4">
            Position <span className="text-cyan-400 font-medium">#{position}</span>
            {estimatedWaitSeconds && estimatedWaitSeconds > 0 && (
              <> &mdash; approximately {formatTime(estimatedWaitSeconds)}</>
            )}
          </p>
        )}

        {/* PoW progress */}
        {isPowSolving && (
          <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-300 text-sm">Solving verification puzzle...</span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${Math.min(100, powProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Helpful message */}
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <p className="text-slate-400 text-sm">
            <span className="text-cyan-400">Tip:</span> Stay on this page while waiting.
            You&apos;ll be notified when it&apos;s your turn.
          </p>
        </div>
      </div>
    </div>
  );
}

