"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { MAX_ROLLOVER_ENTRIES } from "@/lib/api";

interface RolloverExplainerProps {
  rolloverBalance: number;
  compact?: boolean;
}

/**
 * Educational component explaining the rollover mechanic
 * Designed to incentivize participation by showing the value of entering
 */
export function RolloverExplainer({
  rolloverBalance,
  compact = false,
}: RolloverExplainerProps) {
  const [expanded, setExpanded] = useState(false);

  // Compact inline version for header areas
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all group"
      >
        <RolloverIcon className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-medium text-amber-400">
          {rolloverBalance > 0
            ? `${rolloverBalance} Rollover ${rolloverBalance === 1 ? "Entry" : "Entries"}`
            : "How Rollover Works"}
        </span>
        <svg
          className={clsx(
            "w-3 h-3 text-amber-400/60 transition-transform",
            expanded && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-background-card to-background-card overflow-hidden">
      {/* Header - Always visible */}
      <div className="p-5 pb-4">
        <div className="flex items-start gap-4">
          {/* Icon with glow effect */}
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
              <RolloverIcon className="w-6 h-6 text-amber-400" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              Never Lose Your Investment
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-amber-500/20 text-amber-400 rounded-full font-medium">
                Safety Net
              </span>
            </h3>
            <p className="text-sm text-foreground-secondary mt-1 leading-relaxed">
              Didn't win? Your <span className="text-amber-400 font-medium">paid entries</span> become{" "}
              <span className="text-amber-400 font-medium">rollover entries</span> for future drops
              <span className="text-foreground-muted"> (up to {MAX_ROLLOVER_ENTRIES} max)</span>.
            </p>
          </div>
        </div>

        {/* Rollover Balance Display */}
        {rolloverBalance > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-1">
                  {Array.from({ length: Math.min(rolloverBalance, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-background-card flex items-center justify-center shadow-lg shadow-amber-500/20"
                      style={{ zIndex: 5 - i }}
                    >
                      <span className="text-[10px] font-bold text-background">R</span>
                    </div>
                  ))}
                  {rolloverBalance > 5 && (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 border-2 border-background-card flex items-center justify-center">
                      <span className="text-[10px] font-bold text-amber-400">+{rolloverBalance - 5}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-amber-400/70 uppercase tracking-wider">Your Balance</p>
                  <p className="text-lg font-bold text-amber-400 tabular-nums">
                    {rolloverBalance} {rolloverBalance === 1 ? "Entry" : "Entries"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-foreground-muted">Worth up to</p>
                <p className="text-sm font-mono text-amber-400">${rolloverBalance.toFixed(2)} value</p>
              </div>
            </div>
            {rolloverBalance >= MAX_ROLLOVER_ENTRIES && (
              <p className="text-xs text-amber-400/70 mt-2 text-center">
                Maximum rollover reached — use them before they cap!
              </p>
            )}
          </div>
        )}
      </div>

      {/* Expandable Details */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between border-t border-amber-500/10 hover:bg-amber-500/5 transition-colors"
      >
        <span className="text-xs text-foreground-secondary">
          {expanded ? "Hide details" : "See how it works"}
        </span>
        <svg
          className={clsx(
            "w-4 h-4 text-foreground-muted transition-transform duration-300",
            expanded && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      <div
        className={clsx(
          "overflow-hidden transition-all duration-300 ease-out",
          expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-5 pb-5 space-y-4 border-t border-amber-500/10">
          {/* Visual Flow */}
          <div className="pt-4">
            <p className="text-xs uppercase tracking-wider text-foreground-muted mb-3">How It Works</p>
            <div className="flex items-center justify-between gap-2">
              {/* Step 1 */}
              <div className="flex-1 text-center p-3 rounded-xl bg-background/50">
                <div className="w-8 h-8 rounded-full bg-accent/20 mx-auto mb-2 flex items-center justify-center">
                  <span className="text-xs font-bold text-accent">1</span>
                </div>
                <p className="text-xs text-foreground-secondary">Enter drop with paid entries</p>
              </div>

              {/* Arrow */}
              <svg className="w-4 h-4 text-foreground-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>

              {/* Step 2 */}
              <div className="flex-1 text-center p-3 rounded-xl bg-background/50">
                <div className="w-8 h-8 rounded-full bg-foreground-muted/20 mx-auto mb-2 flex items-center justify-center">
                  <span className="text-xs font-bold text-foreground-muted">2</span>
                </div>
                <p className="text-xs text-foreground-secondary">Not selected this time</p>
              </div>

              {/* Arrow */}
              <svg className="w-4 h-4 text-foreground-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>

              {/* Step 3 */}
              <div className="flex-1 text-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 mx-auto mb-2 flex items-center justify-center">
                  <RolloverIcon className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-xs text-amber-400">Entries roll over</p>
              </div>
            </div>
          </div>

          {/* Key Points */}
          <div className="space-y-2 pt-2">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-foreground-secondary">
                <span className="text-foreground">100% of paid entries</span> convert to rollover entries
              </p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-foreground-secondary">
                <span className="text-foreground">Stack up to {MAX_ROLLOVER_ENTRIES} entries</span> across drops
              </p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-foreground-secondary">
                <span className="text-foreground">Auto-applied first</span> before free entries
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="pt-2 text-center">
            <p className="text-xs text-amber-400/80 italic">
              "The more you participate, the better your odds become over time"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable rollover icon
 */
export function RolloverIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
