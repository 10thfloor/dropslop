"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { RolloverIcon } from "./rollover-explainer";
import { MAX_ROLLOVER_ENTRIES } from "@/lib/api";

interface RolloverCelebrationProps {
  earnedEntries: number;
  totalBalance: number;
  onDismiss?: () => void;
}

/**
 * Celebratory component shown when a user doesn't win but earns rollover entries
 * Reframes "losing" as "investing in future drops"
 */
export function RolloverCelebration({
  earnedEntries,
  totalBalance,
  onDismiss,
}: RolloverCelebrationProps) {
  const [animationPhase, setAnimationPhase] = useState<"enter" | "counting" | "complete">("enter");
  const [displayCount, setDisplayCount] = useState(0);

  // Animate entry
  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationPhase("counting"), 300);
    const timer2 = setTimeout(() => setAnimationPhase("complete"), 1500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Count up animation
  useEffect(() => {
    if (animationPhase !== "counting") return;

    const duration = 1000;
    const steps = earnedEntries;
    const stepDuration = duration / steps;

    let current = 0;
    const interval = setInterval(() => {
      current++;
      setDisplayCount(current);
      if (current >= earnedEntries) {
        clearInterval(interval);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [animationPhase, earnedEntries]);

  if (earnedEntries <= 0) return null;

  const atMaxRollover = totalBalance >= MAX_ROLLOVER_ENTRIES;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onDismiss?.()}>
      <Dialog.Portal>
        <Dialog.Overlay 
          className={clsx(
            "fixed inset-0 bg-background/80 backdrop-blur-md",
            "transition-opacity duration-300",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        
        <Dialog.Content 
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md outline-none"
          onPointerDownOutside={onDismiss}
        >
          {/* Celebration particles */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-amber-400/60 animate-celebration-particle"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>

          {/* Main Card */}
          <div
            className={clsx(
              "relative rounded-3xl overflow-hidden",
              "bg-gradient-to-b from-amber-950/50 via-background-card to-background-card",
              "border border-amber-500/30 shadow-2xl shadow-amber-500/10",
              "transform transition-all duration-500 ease-out",
              animationPhase === "enter" ? "scale-90 translate-y-8 opacity-0" : "scale-100 translate-y-0 opacity-100"
            )}
          >
            {/* Glow effect */}
            <div className="absolute inset-x-0 -top-20 h-40 bg-amber-500/20 blur-3xl" />

            {/* Content */}
            <div className="relative p-8 text-center">
              {/* Status Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground-muted/10 border border-foreground-muted/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-foreground-muted" />
                <span className="text-sm text-foreground-secondary">Not Selected This Time</span>
              </div>

              {/* Reframe Message */}
              <Dialog.Title className="text-2xl font-bold text-foreground mb-2">
                But You&apos;re Building Entries!
              </Dialog.Title>
              <Dialog.Description className="text-foreground-secondary mb-8">
                Your investment isn&apos;t lost — it&apos;s rolling over to boost your chances in the next drop
              </Dialog.Description>

              {/* Entry Counter */}
              <div className="mb-8">
                <div className="relative inline-flex items-center justify-center">
                  {/* Animated ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
                  <div
                    className={clsx(
                      "absolute inset-0 rounded-full border-4 border-amber-400",
                      "transition-all duration-1000 ease-out",
                      animationPhase === "complete" ? "opacity-100" : "opacity-0"
                    )}
                    style={{
                      clipPath: animationPhase === "complete" ? "none" : "polygon(0 0, 100% 0, 100% 0, 0 0)",
                    }}
                  />

                  {/* Main display */}
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex flex-col items-center justify-center">
                    <span className="text-xs text-amber-400/70 uppercase tracking-wider">Earned</span>
                    <span
                      className={clsx(
                        "text-5xl font-bold tabular-nums",
                        "bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent",
                        "transition-transform duration-300",
                        animationPhase === "complete" && "scale-110"
                      )}
                    >
                      +{animationPhase === "enter" ? 0 : displayCount}
                    </span>
                    <span className="text-xs text-amber-400/70">{earnedEntries === 1 ? "Entry" : "Entries"}</span>
                  </div>
                </div>
              </div>

              {/* Balance Summary */}
              <div className="p-4 rounded-2xl bg-background/50 border border-border mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <RolloverIcon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-foreground-muted">Total Balance</p>
                      <p className="text-lg font-bold text-foreground">
                        {totalBalance} {totalBalance === 1 ? "Entry" : "Entries"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-foreground-muted">Max</p>
                    <p className="text-sm font-mono text-foreground-secondary">{MAX_ROLLOVER_ENTRIES}</p>
                  </div>
                </div>
                {atMaxRollover && (
                  <p className="text-xs text-amber-400 mt-2 text-center">
                    You&apos;ve reached the maximum — use them on your next entry!
                  </p>
                )}
              </div>

              {/* Benefits reminder */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="p-3 rounded-xl bg-background/30 border border-border/50">
                  <div className="text-lg mb-1">♻️</div>
                  <p className="text-[10px] text-foreground-secondary leading-tight">Auto-applied next drop</p>
                </div>
                <div className="p-3 rounded-xl bg-background/30 border border-border/50">
                  <div className="text-lg mb-1">🎯</div>
                  <p className="text-[10px] text-foreground-secondary leading-tight">Up to {MAX_ROLLOVER_ENTRIES} entries max</p>
                </div>
                <div className="p-3 rounded-xl bg-background/30 border border-border/50">
                  <div className="text-lg mb-1">📈</div>
                  <p className="text-[10px] text-foreground-secondary leading-tight">Stack for bigger odds</p>
                </div>
              </div>

              {/* CTA */}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={clsx(
                    "w-full py-4 px-8 rounded-xl font-semibold text-sm uppercase tracking-wider",
                    "bg-amber-500 text-background hover:bg-amber-400",
                    "transition-all duration-200 active:scale-[0.98]"
                  )}
                >
                  Got It — Ready for Next Drop
                </button>
              </Dialog.Close>

              {/* Fine print */}
              <p className="text-[10px] text-foreground-muted mt-4">
                Your entries are saved to your account and will be automatically applied to your next registration
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Inline rollover earned badge for status panel
 */
export function RolloverEarnedBadge({
  entries,
  animate = true,
}: {
  entries: number;
  animate?: boolean;
}) {
  if (entries <= 0) return null;

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-gradient-to-r from-amber-500/20 to-amber-600/10",
        "border border-amber-500/30",
        animate && "animate-pulse"
      )}
    >
      <RolloverIcon className="w-4 h-4 text-amber-400" />
      <span className="text-sm font-medium text-amber-400">
        +{entries} Rollover {entries === 1 ? "Entry" : "Entries"}
      </span>
    </div>
  );
}
