"use client";

import { clsx } from "clsx";
import type { Phase } from "@/lib/types";

interface HeaderProps {
  connected: boolean;
  phase?: Phase;
}

const phaseLabels: Record<Phase, string> = {
  registration: "REGISTRATION OPEN",
  lottery: "LOTTERY IN PROGRESS",
  purchase: "PURCHASE WINDOW",
  completed: "DROP COMPLETED",
};

const phaseColors: Record<Phase, string> = {
  registration: "bg-accent",
  lottery: "bg-amber-500",
  purchase: "bg-emerald-500",
  completed: "bg-foreground-muted",
};

export function Header({ connected, phase }: HeaderProps) {
  const statusLabel = !connected
    ? "CONNECTING..."
    : phase
      ? phaseLabels[phase]
      : "DROP ACTIVE";

  const dotColor = !connected
    ? "bg-foreground-muted"
    : phase
      ? phaseColors[phase]
      : "bg-accent";

  const shouldPulse = connected && phase !== "completed";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="font-bold text-xl tracking-wider">ARC&apos;TERYX</div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              dotColor,
              shouldPulse && "animate-pulse"
            )}
          />
          <span>{statusLabel}</span>
        </div>
      </div>
    </header>
  );
}
