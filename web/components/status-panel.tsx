"use client";

import { clsx } from "clsx";
import type { UserStatus } from "@/lib/types";
import { MAX_ROLLOVER_ENTRIES } from "@/lib/api";
import { RolloverIcon } from "./rollover-explainer";

interface StatusPanelProps {
  status: UserStatus;
  position?: number;
  tickets?: number;
  purchaseToken?: string;
  rolloverUsed?: number;
  rolloverEarned?: number;
  totalRolloverBalance?: number;
  onPurchase?: () => void;
  purchaseLoading?: boolean;
  registrationClosed?: boolean;
  dropCompleted?: boolean;
}

const statusConfig: Record<
  UserStatus,
  { label: string; description: string; color: string; bgGradient?: string }
> = {
  not_registered: {
    label: "NOT REGISTERED",
    description: "Enter the drop to secure your spot",
    color: "text-foreground-secondary",
  },
  registered: {
    label: "REGISTERED",
    description: "You're in! Waiting for the lottery...",
    color: "text-accent",
    bgGradient: "from-accent/5 to-transparent",
  },
  winner: {
    label: "WINNER!",
    description: "Congratulations! Complete your purchase now",
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/10 to-transparent",
  },
  loser: {
    label: "NOT SELECTED",
    description: "Your entries are building for next time",
    color: "text-foreground-muted",
    bgGradient: "from-amber-500/5 to-transparent",
  },
  purchased: {
    label: "PURCHASED",
    description: "Congratulations! Thank you for your order.",
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/10 to-transparent",
  },
};

export function StatusPanel({
  status,
  position,
  tickets,
  purchaseToken,
  rolloverUsed = 0,
  rolloverEarned = 0,
  totalRolloverBalance = 0,
  onPurchase,
  purchaseLoading = false,
  registrationClosed = false,
  dropCompleted = false,
}: StatusPanelProps) {
  // Override config based on phase state
  const baseConfig = statusConfig[status];
  let config = baseConfig;

  // Detect missed registration states
  const missedRegistration = status === "not_registered" && registrationClosed;
  const missedEntireDrop = status === "not_registered" && dropCompleted;

  if (missedEntireDrop) {
    config = {
      ...baseConfig,
      label: "MISSED THIS DROP",
      description: "This drop has ended, but more are coming",
      color: "text-foreground-muted",
      bgGradient: "from-foreground-muted/5 to-transparent",
    };
  } else if (missedRegistration) {
    config = {
      ...baseConfig,
      label: "REGISTRATION CLOSED",
      description: "You didn't make it in time for this one",
      color: "text-foreground-muted",
      bgGradient: "from-foreground-muted/5 to-transparent",
    };
  }

  // Detect expired winner state (won lottery but didn't purchase in time)
  const isExpiredWinner = status === "winner" && dropCompleted;

  if (isExpiredWinner) {
    config = {
      ...baseConfig,
      label: "TIME EXPIRED",
      description: "You won, but the purchase window has closed",
      color: "text-rose-400",
      bgGradient: "from-rose-500/10 to-transparent",
    };
  }

  // Don't show purchase button if drop is completed
  const showPurchaseButton = onPurchase && !dropCompleted;

  return (
    <div
      className={clsx(
        "rounded-2xl p-6 border border-border overflow-hidden relative",
        "bg-gradient-to-br",
        config.bgGradient || "from-background-card to-background-card",
        "bg-background-card"
      )}
    >
      <h2 className="text-xs uppercase tracking-wider text-foreground-secondary mb-4">
        YOUR STATUS
      </h2>

      <div className="space-y-4">
        {/* Main Status */}
        <div className="space-y-2">
          <p className={clsx("text-xl font-semibold", config.color)}>
            {config.label}
          </p>
          <p className="text-foreground-secondary text-sm">
            {config.description}
          </p>
        </div>

        {/* Show position and tickets for registered users */}
        {status === "registered" && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {position && (
              <div className="px-3 py-2 rounded-lg bg-background/50 border border-border">
                <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-0.5">
                  Position
                </p>
                <p className="font-mono font-bold text-accent">#{position}</p>
              </div>
            )}
            {tickets && tickets > 0 && (
              <div className="px-3 py-2 rounded-lg bg-background/50 border border-border">
                <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-0.5">
                  Entries
                </p>
                <p className="font-mono font-bold text-foreground">{tickets}</p>
              </div>
            )}
            {rolloverUsed > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-0.5">
                  Rollover Used
                </p>
                <p className="font-mono font-bold text-amber-400">{rolloverUsed}</p>
              </div>
            )}
          </div>
        )}

        {/* Winner purchase button - only show when purchase is still possible */}
        {status === "winner" && !isExpiredWinner && (
          <div className="pt-2 space-y-4">
            {purchaseToken && (
              <div className="p-3 bg-background rounded-lg border border-border">
                <p className="text-xs text-foreground-muted mb-1">Purchase Token</p>
                <code className="text-xs font-mono text-accent break-all">
                  {purchaseToken}
                </code>
              </div>
            )}
            {/* Purchase Button */}
            {showPurchaseButton && (
              <button
                type="button"
                onClick={onPurchase}
                disabled={purchaseLoading}
                className={clsx(
                  "w-full py-4 px-6 rounded-xl font-semibold text-sm uppercase tracking-wider",
                  "transition-all duration-200",
                  "bg-gradient-to-r from-emerald-500 to-emerald-600",
                  "hover:from-emerald-400 hover:to-emerald-500",
                  "text-white shadow-lg shadow-emerald-500/25",
                  "focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
                  purchaseLoading && "opacity-70 cursor-wait"
                )}
              >
                {purchaseLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  "Complete Purchase"
                )}
              </button>
            )}
          </div>
        )}

        {/* EXPIRED WINNER STATE - Empathetic messaging for missed purchase */}
        {isExpiredWinner && (
          <div className="pt-2 space-y-4">
            {/* What happened explanation */}
            <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-rose-400">
                    Purchase Window Closed
                  </p>
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    You were selected as a winner, but the time to complete your purchase has passed. 
                    We know this is disappointing — life happens.
                  </p>
                </div>
              </div>
            </div>

            {/* Encouragement for next time */}
            <div className="p-4 rounded-xl bg-background/50 border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Ready for the Next Drop?
                  </p>
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    Set a reminder and keep notifications on for future drops. 
                    Winners who act fast secure their spot!
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Stay tuned for upcoming drops
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip */}
            <p className="text-xs text-foreground-muted text-center italic">
              Pro tip: Keep this tab open during the purchase window to ensure you don't miss your chance.
            </p>
          </div>
        )}

        {/* MISSED REGISTRATION STATE - Empathetic messaging for those who didn't register in time */}
        {(missedRegistration || missedEntireDrop) && (
          <div className="pt-2 space-y-4">
            {/* What happened explanation */}
            <div className="p-4 rounded-xl bg-foreground-muted/5 border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground-muted/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground-secondary">
                    {missedEntireDrop ? "This Drop Has Ended" : "Registration Window Closed"}
                  </p>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    {missedEntireDrop 
                      ? "You arrived after this drop concluded. Don't worry — there will be more opportunities!"
                      : "The registration period for this drop has ended. The lottery is in progress or complete."
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Encouragement for next time */}
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Don't Miss the Next One
                  </p>
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    Turn on notifications to get alerted when the next drop opens. 
                    Registration windows are limited — early birds get in!
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Free entry on every drop
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Rollover protection
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip */}
            <p className="text-xs text-foreground-muted text-center italic">
              Pro tip: Bookmark this page and check back regularly for upcoming drops.
            </p>
          </div>
        )}

        {/* LOSER STATE - Enhanced with rollover messaging */}
        {status === "loser" && (
          <div className="pt-2 space-y-4">
            {/* Rollover Earned Banner */}
            {rolloverEarned > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <RolloverIcon className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-400">
                      +{rolloverEarned} Rollover {rolloverEarned === 1 ? "Entry" : "Entries"} Earned!
                    </p>
                    <p className="text-xs text-foreground-secondary">From your paid entries</p>
                  </div>
                </div>

                {/* What this means */}
                <div className="text-xs text-foreground-secondary space-y-1.5">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Auto-applied to your next entry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Stack up to {MAX_ROLLOVER_ENTRIES} entries max</span>
                  </div>
                </div>
              </div>
            )}

            {/* Total Balance */}
            {totalRolloverBalance > 0 && (
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-background/50 border border-border">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    {Array.from({ length: Math.min(totalRolloverBalance, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-background-card"
                        style={{ zIndex: 3 - i }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-foreground-secondary">Total Balance</span>
                </div>
                <span className="text-sm font-bold text-amber-400">
                  {totalRolloverBalance} {totalRolloverBalance === 1 ? "entry" : "entries"}
                </span>
              </div>
            )}

            {/* Encouragement */}
            <p className="text-xs text-foreground-muted text-center italic">
              Every drop brings you closer to winning. Stay in the game!
            </p>
          </div>
        )}

        {/* Purchased state */}
        {status === "purchased" && (
          <div className="pt-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">Order confirmed — check your email</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
