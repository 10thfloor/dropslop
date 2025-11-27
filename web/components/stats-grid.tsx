"use client";

import { clsx } from "clsx";
import type { Phase, LoyaltyTier } from "@/lib/types";

interface StatsGridProps {
  phase: Phase;
  entries: number;
  totalTickets?: number;
  totalEffectiveTickets?: number;
  inventory: number;
  maxInventory: number;
  // User-specific for odds calculation
  userTickets?: number;
  userEffectiveTickets?: number;
  loyaltyTier?: LoyaltyTier;
  loyaltyMultiplier?: number;
}

const phaseLabels: Record<Phase, string> = {
  registration: "REGISTRATION",
  lottery: "LOTTERY",
  purchase: "PURCHASE",
  completed: "COMPLETED",
};

const phaseColors: Record<Phase, string> = {
  registration: "bg-accent",
  lottery: "bg-yellow-500",
  purchase: "bg-green-500",
  completed: "bg-foreground-muted",
};

const tierColors: Record<LoyaltyTier, string> = {
  bronze: "text-orange-400",
  silver: "text-slate-300",
  gold: "text-yellow-400",
};

const tierLabels: Record<LoyaltyTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

/**
 * Calculate estimated win probability
 */
function calculateWinProbability(
  userEffectiveTickets: number,
  totalEffectiveTickets: number,
  inventory: number,
  participantCount: number
): number {
  if (totalEffectiveTickets === 0 || userEffectiveTickets === 0) return 0;
  if (inventory >= participantCount) return 1; // Everyone wins

  const poolShare = userEffectiveTickets / totalEffectiveTickets;
  // Approximate probability
  return Math.min(1, poolShare * Math.min(inventory, participantCount));
}

export function StatsGrid({
  phase,
  entries,
  totalTickets = 0,
  totalEffectiveTickets,
  inventory,
  maxInventory,
  userTickets,
  userEffectiveTickets,
  loyaltyTier,
  loyaltyMultiplier,
}: StatsGridProps) {
  // During registration/lottery, if inventory is 0 (default/loading state), 
  // show maxInventory since nothing has been purchased yet
  const displayInventory = 
    (phase === "registration" || phase === "lottery") && inventory === 0
      ? maxInventory
      : inventory;

  // Calculate win probability if user is registered
  const hasUserData = userTickets !== undefined && userTickets > 0;
  const effectivePool = totalEffectiveTickets || totalTickets;
  const effectiveUserTickets = userEffectiveTickets || userTickets || 0;
  
  const winProbability = hasUserData
    ? calculateWinProbability(
        effectiveUserTickets,
        effectivePool,
        displayInventory,
        entries
      )
    : null;

  // Only show odds during registration phase when user is registered
  const showOdds = phase === "registration" && hasUserData && winProbability !== null;

  return (
    <div className="space-y-3">
      {/* Main Stats Grid */}
    <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
      {/* Phase */}
      <div className="bg-background-card p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-foreground-secondary mb-3">
          PHASE
        </p>
        <div className="flex items-center justify-center gap-2">
          <span
            className={clsx(
              "w-2 h-2 rounded-full animate-pulse",
              phaseColors[phase]
            )}
          />
          <span className="font-medium">{phaseLabels[phase]}</span>
        </div>
      </div>

      {/* Entries / Tickets */}
      <div className="bg-background-card p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-foreground-secondary mb-3">
          POOL
        </p>
        <div className="space-y-1">
          <span className="font-mono text-2xl font-medium tabular-nums">
              {(effectivePool).toLocaleString()}
          </span>
          <p className="text-xs text-foreground-muted">
            {entries.toLocaleString()} {entries === 1 ? "person" : "people"}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-background-card p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-foreground-secondary mb-3">
          ITEMS
        </p>
        <div className="font-mono text-2xl tabular-nums">
          <span className="font-medium">{displayInventory}</span>
          <span className="text-foreground-muted mx-1">/</span>
          <span className="text-foreground-secondary">{maxInventory}</span>
        </div>
      </div>
      </div>

      {/* Odds Display - only shown when user is registered during registration */}
      {showOdds && (
        <div className="bg-background-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Loyalty Tier Badge with icon */}
              {loyaltyTier && (
                <div className="flex items-center gap-2">
                  <div className={clsx(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                    loyaltyTier === "gold" && "bg-yellow-500/20",
                    loyaltyTier === "silver" && "bg-slate-400/20",
                    loyaltyTier === "bronze" && "bg-orange-500/20"
                  )}>
                    {loyaltyTier === "gold" && "🥇"}
                    {loyaltyTier === "silver" && "🥈"}
                    {loyaltyTier === "bronze" && "🥉"}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={clsx(
                        "text-xs font-medium uppercase tracking-wider",
                        tierColors[loyaltyTier]
                      )}
                    >
                      {tierLabels[loyaltyTier]}
                    </span>
                    {loyaltyMultiplier && loyaltyMultiplier > 1 && (
                      <span className="text-[10px] text-foreground-muted">
                        {loyaltyMultiplier.toFixed(1)}x bonus
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Odds with visual indicator */}
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-foreground-secondary mb-1">
                YOUR ODDS
              </p>
              <div className="flex items-center gap-3">
                {/* Visual bar */}
                <div className="w-16 h-2 bg-background rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-accent to-accent/70 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(winProbability * 100, 100)}%` }}
                  />
                </div>
                <span className={clsx(
                  "font-mono text-xl font-medium tabular-nums",
                  winProbability >= 0.5 ? "text-emerald-400" : "text-accent"
                )}>
                  ~{(winProbability * 100).toFixed(1)}%
                </span>
              </div>
              <span className="text-xs text-foreground-muted">
                {effectiveUserTickets} of {effectivePool} in pool
              </span>
            </div>
          </div>

          {/* How odds are calculated - educational */}
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            {loyaltyMultiplier && loyaltyMultiplier > 1 && userTickets && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-muted">
                  {userTickets} {userTickets === 1 ? "ticket" : "tickets"} × {loyaltyMultiplier.toFixed(1)}x {loyaltyTier}
                </span>
                <span className="text-foreground font-medium">
                  = {effectiveUserTickets} effective
                </span>
              </div>
            )}
            <p className="text-[10px] text-foreground-muted/70 italic">
              Odds = your entries ÷ total pool × available items. More tickets = better odds!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
