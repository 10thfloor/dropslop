"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useCountdown } from "@/hooks/use-countdown";

export type DropListItem = {
  dropId: string;
  phase: "registration" | "lottery" | "purchase" | "completed" | string;
  participantCount: number;
  totalTickets: number;
  inventory: number;
  initialInventory: number;
  registrationEnd: number;
  purchaseEnd?: number;
  lotteryCommitment?: string;
};

type UserStatus =
  | "not_registered"
  | "registered"
  | "winner"
  | "backup_winner"
  | "loser"
  | "purchased"
  | "expired"
  | (string & {});

function phaseLabel(phase: string): string {
  switch (phase) {
    case "registration":
      return "Registration";
    case "lottery":
      return "Lottery";
    case "purchase":
      return "Purchase";
    case "completed":
      return "Completed";
    default:
      return phase;
  }
}

function countdownLabel(phase: string): string {
  if (phase === "purchase") return "Purchase ends in";
  return "Registration ends in";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function userBadge(
  status: UserStatus,
  tickets?: number
): {
  label: string;
  className: string;
} | null {
  switch (status) {
    case "registered":
      return {
        label:
          typeof tickets === "number" && tickets > 0
            ? `Registered (${tickets})`
            : "Registered",
        className: "bg-emerald-500/10 text-emerald-300",
      };
    case "winner":
      return { label: "Winner", className: "bg-amber-500/10 text-amber-300" };
    case "backup_winner":
      return {
        label: "Waitlist",
        className: "bg-sky-500/10 text-sky-300",
      };
    case "purchased":
      return {
        label: "Purchased",
        className: "bg-emerald-500/10 text-emerald-300",
      };
    case "expired":
      return { label: "Expired", className: "bg-rose-500/10 text-rose-300" };
    case "loser":
      return {
        label: "Not selected",
        className: "bg-foreground/10 text-foreground-secondary",
      };
    case "not_registered":
      return null;
    default:
      return null;
  }
}

export function DropCard({
  drop,
  clockOffset,
  userStatus,
  userTickets,
}: {
  drop: DropListItem;
  clockOffset: number;
  userStatus?: UserStatus;
  userTickets?: number;
}) {
  const target =
    drop.phase === "purchase" && drop.purchaseEnd
      ? drop.purchaseEnd
      : drop.registrationEnd;

  const countdown = useCountdown(target || 0, clockOffset);

  const totalSeconds = Math.ceil(countdown.total / 1000);
  const isUrgent = totalSeconds > 0 && totalSeconds <= 60;

  const formatted = `${countdown.hours
    .toString()
    .padStart(2, "0")}:${countdown.minutes
    .toString()
    .padStart(2, "0")}:${countdown.seconds.toString().padStart(2, "0")}`;

  const badge = userStatus ? userBadge(userStatus, userTickets) : null;
  const invRatio =
    drop.initialInventory > 0
      ? clamp(drop.inventory / drop.initialInventory, 0, 1)
      : 0;

  return (
    <Link
      href={`/drop/${drop.dropId}`}
      className={clsx(
        "block rounded-2xl border border-border p-4 transition-colors",
        "hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-accent/40"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-mono text-foreground-muted truncate">
            {drop.dropId}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {phaseLabel(drop.phase)}
            </span>
            {badge && (
              <span
                className={clsx(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  badge.className
                )}
              >
                {badge.label}
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-foreground/5 px-3 py-2">
              <div className="text-foreground-muted">Inventory</div>
              <div className="mt-1 font-semibold tabular-nums">
                {drop.inventory}/{drop.initialInventory}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-foreground/10">
                <div
                  className={clsx(
                    "h-1.5 rounded-full",
                    invRatio <= 0.1
                      ? "bg-rose-400"
                      : invRatio <= 0.3
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  )}
                  style={{ width: `${Math.round(invRatio * 100)}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl bg-foreground/5 px-3 py-2">
              <div className="text-foreground-muted">Participants</div>
              <div className="mt-1 font-semibold tabular-nums">
                {drop.participantCount.toLocaleString()}
              </div>
              <div className="mt-1 text-foreground-secondary">
                Total tickets:{" "}
                <span className="text-foreground tabular-nums">
                  {drop.totalTickets.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-foreground/5 px-3 py-2">
              <div className="text-foreground-muted">
                {countdownLabel(drop.phase)}
              </div>
              <div
                className={clsx(
                  "mt-1 font-semibold tabular-nums",
                  isUrgent ? "text-amber-400" : "text-foreground"
                )}
              >
                {!target ? "—" : countdown.isExpired ? "Ended" : formatted}
              </div>
              {drop.lotteryCommitment && (
                <div className="mt-1 text-foreground-muted font-mono truncate">
                  commit: {drop.lotteryCommitment.slice(0, 10)}…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function DropCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="h-3 w-28 rounded bg-foreground/10" />
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-24 rounded-full bg-foreground/10" />
        <div className="h-5 w-28 rounded-full bg-foreground/10" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-foreground/5 px-3 py-2">
          <div className="h-3 w-16 rounded bg-foreground/10" />
          <div className="mt-2 h-4 w-20 rounded bg-foreground/10" />
          <div className="mt-2 h-1.5 w-full rounded bg-foreground/10" />
        </div>
        <div className="rounded-xl bg-foreground/5 px-3 py-2">
          <div className="h-3 w-20 rounded bg-foreground/10" />
          <div className="mt-2 h-4 w-24 rounded bg-foreground/10" />
          <div className="mt-2 h-3 w-28 rounded bg-foreground/10" />
        </div>
        <div className="rounded-xl bg-foreground/5 px-3 py-2">
          <div className="h-3 w-24 rounded bg-foreground/10" />
          <div className="mt-2 h-4 w-24 rounded bg-foreground/10" />
          <div className="mt-2 h-3 w-28 rounded bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
