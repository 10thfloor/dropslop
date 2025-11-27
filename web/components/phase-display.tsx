"use client";

import { clsx } from "clsx";
import type { Phase } from "@/lib/types";
import { Countdown } from "./countdown";

interface CountdownData {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

interface PhaseDisplayProps {
  phase: Phase;
  countdown: CountdownData;
  purchaseCountdown?: CountdownData;
  isRegistered: boolean;
  userStatus?:
    | "not_registered"
    | "registered"
    | "winner"
    | "backup_winner"
    | "loser"
    | "purchased"
    | "expired";
}

type PhaseVariant = "accent" | "emerald" | "amber" | "muted";

/**
 * Phase status badge component for consistent styling
 */
function PhaseBadge({
  label,
  variant,
  pulsing = true,
  icon,
}: {
  label: string;
  variant: PhaseVariant;
  pulsing?: boolean;
  icon?: "dot" | "check" | "spinner";
}) {
  const colorClasses: Record<PhaseVariant, string> = {
    accent: "bg-accent/10 border-accent/30 text-accent",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    muted:
      "bg-foreground-muted/10 border-foreground-muted/20 text-foreground-muted",
  };

  const dotClasses: Record<PhaseVariant, string> = {
    accent: "bg-accent",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    muted: "bg-foreground-muted",
  };

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full border",
        colorClasses[variant]
      )}
    >
      {icon === "check" ? (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : icon === "spinner" ? (
        <svg
          className="w-4 h-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <span
          className={clsx(
            "w-2 h-2 rounded-full",
            dotClasses[variant],
            pulsing && "animate-pulse"
          )}
        />
      )}
      <span className="text-sm font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

/**
 * Get phase configuration for consistent display
 */
function getPhaseConfig(
  phase: Phase,
  countdown: CountdownData,
  purchaseCountdown: CountdownData | undefined,
  isRegistered: boolean
): {
  badge: {
    label: string;
    variant: PhaseVariant;
    pulsing: boolean;
    icon?: "dot" | "check" | "spinner";
  };
  countdownLabel: string;
  countdownData: CountdownData;
  sublabel?: string;
} {
  switch (phase) {
    case "registration":
      return {
        badge: {
          label: countdown.isExpired
            ? "Registration Closed"
            : "Registration Open",
          variant: "accent",
          pulsing: !countdown.isExpired,
        },
        countdownLabel: countdown.isExpired
          ? "REGISTRATION CLOSED"
          : "REGISTRATION ENDS IN",
        countdownData: countdown,
        sublabel: countdown.isExpired
          ? isRegistered
            ? "Lottery starting soon..."
            : "Registration has ended"
          : undefined,
      };

    case "lottery":
      return {
        badge: {
          label: "Lottery In Progress",
          variant: "amber",
          pulsing: false,
          icon: "spinner",
        },
        countdownLabel: "SELECTING WINNERS",
        countdownData: { hours: 0, minutes: 0, seconds: 0, isExpired: false },
        sublabel: isRegistered ? "Good luck!" : "Selecting winners...",
      };

    case "purchase": {
      const cd = purchaseCountdown || {
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: true,
      };
      return {
        badge: {
          label: cd.isExpired
            ? "Purchase Window Closed"
            : "Purchase Window Open",
          variant: "emerald",
          pulsing: !cd.isExpired,
        },
        countdownLabel: cd.isExpired
          ? "PURCHASE WINDOW CLOSED"
          : "PURCHASE WINDOW CLOSES IN",
        countdownData: cd,
        sublabel: cd.isExpired ? "Time's up!" : undefined,
      };
    }

    case "completed":
      return {
        badge: {
          label: "Drop Completed",
          variant: "muted",
          pulsing: false,
          icon: "check",
        },
        countdownLabel: "",
        countdownData: { hours: 0, minutes: 0, seconds: 0, isExpired: true },
        sublabel: isRegistered
          ? "Thanks for participating!"
          : "This drop has ended.",
      };

    default:
      return {
        badge: { label: "Unknown", variant: "muted", pulsing: false },
        countdownLabel: "",
        countdownData: { hours: 0, minutes: 0, seconds: 0, isExpired: true },
      };
  }
}

/**
 * Displays the current drop phase with consistent structure:
 * 1. Phase badge (status)
 * 2. Countdown timer
 * 3. Optional sublabel
 */
export function PhaseDisplay({
  phase,
  countdown,
  purchaseCountdown,
  isRegistered,
  userStatus,
}: PhaseDisplayProps) {
  const config = getPhaseConfig(
    phase,
    countdown,
    purchaseCountdown,
    isRegistered
  );

  // Hide countdown for lottery (show animation)
  // Also hide for purchased users - they don't need to see the timer anymore
  const showCountdown = phase !== "lottery" && userStatus !== "purchased";

  // Special display for purchased users
  if (userStatus === "purchased") {
    return (
      <div className="space-y-4">
        <PhaseBadge
          label="Purchase Complete"
          variant="emerald"
          pulsing={false}
          icon="check"
        />
        <p className="text-lg text-foreground-secondary">
          Congratulations! Your order is confirmed.
        </p>
      </div>
    );
  }

  // Special display for winners who missed their purchase window
  const isExpiredWinner = userStatus === "winner" && phase === "completed";
  if (isExpiredWinner) {
    return (
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-rose-500/10 border-rose-500/30 text-rose-400">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium uppercase tracking-wider">
            Time Expired
          </span>
        </div>
        <p className="text-lg text-foreground-secondary">
          You won, but the purchase window has closed.
        </p>
      </div>
    );
  }

  // Special display for non-registered users who missed the drop entirely
  const missedEntireDrop =
    userStatus === "not_registered" && phase === "completed";
  if (missedEntireDrop) {
    return (
      <div className="space-y-4">
        <PhaseBadge
          label="Drop Ended"
          variant="muted"
          pulsing={false}
          icon="check"
        />
        <p className="text-lg text-foreground-secondary">
          This drop has concluded. Stay tuned for the next one!
        </p>
      </div>
    );
  }

  // Special display for non-registered users watching lottery/purchase in progress
  const missedRegistration =
    userStatus === "not_registered" &&
    (phase === "lottery" ||
      phase === "purchase" ||
      (phase === "registration" && countdown.isExpired));
  if (missedRegistration) {
    const sublabelText =
      phase === "lottery"
        ? "The lottery is in progress. Watch along!"
        : phase === "purchase"
        ? "Winners are completing their purchases."
        : "Registration has closed. The lottery will begin soon.";

    return (
      <div className="space-y-4">
        <PhaseBadge
          label={
            phase === "lottery"
              ? "Lottery In Progress"
              : phase === "purchase"
              ? "Purchase Window"
              : "Registration Closed"
          }
          variant={
            phase === "lottery"
              ? "amber"
              : phase === "purchase"
              ? "emerald"
              : "muted"
          }
          pulsing={phase === "lottery" || phase === "purchase"}
          icon={phase === "lottery" ? "spinner" : undefined}
        />
        {phase === "lottery" && (
          <div className="flex justify-center items-center gap-2">
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        )}
        <p className="text-lg text-foreground-secondary">{sublabelText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PhaseBadge
        label={config.badge.label}
        variant={config.badge.variant}
        pulsing={config.badge.pulsing}
        icon={config.badge.icon}
      />
      {showCountdown && (
        <Countdown
          hours={config.countdownData.hours}
          minutes={config.countdownData.minutes}
          seconds={config.countdownData.seconds}
          label={config.countdownLabel}
          expired={config.countdownData.isExpired}
        />
      )}
      {phase === "lottery" && (
        <div className="text-center space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-400">
            {config.countdownLabel}
          </p>
          <div className="flex justify-center items-center gap-2">
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
      )}
      {config.sublabel && (
        <p className="text-lg text-foreground-secondary">{config.sublabel}</p>
      )}
    </div>
  );
}
