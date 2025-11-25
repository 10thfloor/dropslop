"use client";

import { clsx } from "clsx";
import type { Phase } from "@/lib/types";

interface StatsGridProps {
  phase: Phase;
  entries: number;
  totalTickets?: number;
  inventory: number;
  maxInventory: number;
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

export function StatsGrid({
  phase,
  entries,
  totalTickets = 0,
  inventory,
  maxInventory,
}: StatsGridProps) {
  // During registration/lottery, if inventory is 0 (default/loading state), 
  // show maxInventory since nothing has been purchased yet
  const displayInventory = 
    (phase === "registration" || phase === "lottery") && inventory === 0
      ? maxInventory
      : inventory;

  return (
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
            {totalTickets.toLocaleString()}
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
  );
}
