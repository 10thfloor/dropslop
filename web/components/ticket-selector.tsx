"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  calculateCostWithRollover,
  calculateWinProbability,
  MAX_ROLLOVER_ENTRIES,
} from "@/lib/api";
import { RolloverIcon } from "./rollover-explainer";

interface TicketSelectorProps {
  tickets: number;
  setTickets: (tickets: number) => void;
  maxTickets?: number;
  priceUnit?: number;
  totalTicketsInPool?: number;
  inventory?: number;
  rolloverBalance?: number;
  disabled?: boolean;
}

export function TicketSelector({
  tickets,
  setTickets,
  maxTickets = 10,
  priceUnit = 1,
  totalTicketsInPool = 0,
  inventory = 10,
  rolloverBalance = 0,
  disabled = false,
}: TicketSelectorProps) {
  const [rolloverExpanded, setRolloverExpanded] = useState(false);

  // Calculate cost breakdown with rollover
  const { rolloverUsed, freeEntry, paidEntries, cost } =
    calculateCostWithRollover(tickets, rolloverBalance, priceUnit);

  const isFree = cost === 0;

  // Calculate probability with user's selected tickets
  const estimatedTotalTickets = totalTicketsInPool + tickets;
  const probability = calculateWinProbability(
    tickets,
    estimatedTotalTickets,
    inventory
  );
  const probabilityPercent = Math.round(probability * 100);

  const decrement = () => {
    if (!disabled && tickets > 1) {
      setTickets(tickets - 1);
    }
  };

  const increment = () => {
    if (!disabled && tickets < maxTickets) {
      setTickets(tickets + 1);
    }
  };

  // Helper to calculate cost for a specific ticket count
  const getCostForTickets = (ticketCount: number) => {
    return calculateCostWithRollover(ticketCount, rolloverBalance, priceUnit);
  };

  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-background-card overflow-hidden",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {/* Header with Rollover Explainer integrated */}
      <div className="p-5 pb-4">
        {/* Rollover Explainer - Integrated */}
        {rolloverBalance === 0 && (
          <div className="mb-4 rounded-xl bg-gradient-to-br from-amber-950/30 via-background/50 to-transparent border border-amber-500/20 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-amber-500/20 blur-lg rounded-full" />
                  <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                    <RolloverIcon className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    Never Lose Your Investment
                    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-amber-500/20 text-amber-400 rounded-full font-medium">
                      Safety Net
                    </span>
                  </h4>
                  <p className="text-xs text-foreground-secondary mt-1 leading-relaxed">
                    Didn&apos;t win? Your{" "}
                    <span className="text-amber-400 font-medium">
                      paid entries
                    </span>{" "}
                    become{" "}
                    <span className="text-amber-400 font-medium">
                      rollover entries
                    </span>{" "}
                    for future drops
                    <span className="text-foreground-muted">
                      {" "}
                      (up to {MAX_ROLLOVER_ENTRIES} max)
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>

            {/* Expandable Details Toggle */}
            <button
              type="button"
              onClick={() => setRolloverExpanded((prev) => !prev)}
              className="w-full px-4 py-2.5 flex items-center justify-between border-t border-amber-500/10 hover:bg-amber-500/5 transition-colors"
            >
              <span className="text-xs text-foreground-secondary">
                {rolloverExpanded ? "Hide details" : "See how it works"}
              </span>
              <svg
                className={clsx(
                  "w-4 h-4 text-foreground-muted transition-transform duration-300",
                  rolloverExpanded && "rotate-180"
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Expanded Content */}
            <div
              className={clsx(
                "overflow-hidden transition-all duration-300 ease-out",
                rolloverExpanded
                  ? "max-h-[500px] opacity-100"
                  : "max-h-0 opacity-0"
              )}
            >
              <div className="px-4 pb-4 space-y-4 border-t border-amber-500/10">
                {/* Visual Flow */}
                <div className="pt-4">
                  <p className="text-xs uppercase tracking-wider text-foreground-muted mb-3">
                    How It Works
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    {/* Step 1 */}
                    <div className="flex-1 text-center p-3 rounded-xl bg-background/50">
                      <div className="w-8 h-8 rounded-full bg-accent/20 mx-auto mb-2 flex items-center justify-center">
                        <span className="text-xs font-bold text-accent">1</span>
                      </div>
                      <p className="text-xs text-foreground-secondary">
                        Enter drop with paid entries
                      </p>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 text-foreground-muted flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>

                    {/* Step 2 */}
                    <div className="flex-1 text-center p-3 rounded-xl bg-background/50">
                      <div className="w-8 h-8 rounded-full bg-foreground-muted/20 mx-auto mb-2 flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground-muted">
                          2
                        </span>
                      </div>
                      <p className="text-xs text-foreground-secondary">
                        Not selected this time
                      </p>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 text-foreground-muted flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>

                    {/* Step 3 */}
                    <div className="flex-1 text-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 mx-auto mb-2 flex items-center justify-center">
                        <RolloverIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-xs text-amber-400">
                        Entries roll over
                      </p>
                    </div>
                  </div>
                </div>

                {/* Key Points */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"
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
                    <p className="text-xs text-foreground-secondary">
                      <span className="text-foreground">
                        100% of paid entries
                      </span>{" "}
                      convert to rollover entries
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"
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
                    <p className="text-xs text-foreground-secondary">
                      <span className="text-foreground">
                        Stack up to {MAX_ROLLOVER_ENTRIES} entries
                      </span>{" "}
                      across drops
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"
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
                    <p className="text-xs text-foreground-secondary">
                      <span className="text-foreground">
                        Auto-applied first
                      </span>{" "}
                      before free entries
                    </p>
                  </div>
                </div>

                {/* CTA */}
                <div className="pt-2 text-center">
                  <p className="text-xs text-amber-400/80 italic">
                    &quot;The more you participate, the better your odds become
                    over time&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Choose Your Entries
            </h3>
            <p className="text-sm text-foreground-secondary">
              More entries = better odds.{" "}
              {paidEntries > 0 && (
                <span className="text-amber-400">
                  Unused entries roll over!
                </span>
              )}
            </p>
          </div>

          {/* Rollover Badge - Prominent when user has balance */}
          {rolloverBalance > 0 && (
            <div className="flex-shrink-0 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30">
              <div className="flex items-center gap-2">
                <RolloverIcon className="w-4 h-4 text-amber-400" />
                <div className="text-right">
                  <p className="text-lg font-bold text-amber-400 leading-none">
                    {rolloverBalance}
                  </p>
                  <p className="text-[10px] text-amber-400/70 uppercase tracking-wider">
                    {rolloverBalance === 1 ? "Entry" : "Entries"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ticket Counter */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-center gap-6 py-4">
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || tickets <= 1}
            className={clsx(
              "w-14 h-14 rounded-2xl border-2 text-2xl font-bold",
              "transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
              tickets <= 1 || disabled
                ? "border-border text-foreground-muted cursor-not-allowed"
                : "border-accent/50 text-accent hover:bg-accent/10 hover:border-accent active:scale-95"
            )}
            aria-label="Decrease number of tickets"
          >
            &minus;
          </button>

          <div className="text-center min-w-[120px]">
            <div className="text-6xl font-bold font-mono tabular-nums text-foreground leading-none">
              {tickets}
            </div>
            <div className="text-xs text-foreground-muted mt-2 uppercase tracking-wider">
              {tickets === 1 ? "entry" : "entries"}
            </div>
          </div>

          <button
            type="button"
            onClick={increment}
            disabled={disabled || tickets >= maxTickets}
            className={clsx(
              "w-14 h-14 rounded-2xl border-2 text-2xl font-bold",
              "transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
              tickets >= maxTickets || disabled
                ? "border-border text-foreground-muted cursor-not-allowed"
                : "border-accent/50 text-accent hover:bg-accent/10 hover:border-accent active:scale-95"
            )}
            aria-label="Increase number of tickets"
          >
            +
          </button>
        </div>
      </div>

      {/* Entry Breakdown Card */}
      <div className="mx-5 mb-4 p-4 rounded-xl bg-background/50 border border-border">
        {/* Sources */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {rolloverUsed > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30">
              <RolloverIcon className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">
                {rolloverUsed} rollover
              </span>
            </div>
          )}
          {freeEntry > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
              <svg
                className="w-3.5 h-3.5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-label="Free entry icon"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                />
              </svg>
              <span className="text-xs font-medium text-emerald-400">
                1 free
              </span>
            </div>
          )}
          {paidEntries > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground/10 border border-border">
              <svg
                className="w-3.5 h-3.5 text-foreground-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
              <span className="text-xs font-medium text-foreground-secondary">
                {paidEntries} paid
              </span>
              <span className="text-[10px] text-amber-400/70">
                &rarr; rollover if you are not selected
              </span>
            </div>
          )}
        </div>

        {/* Cost Summary */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-sm text-foreground-secondary">
            {isFree ? "Total cost" : "Your investment"}
          </span>
          <div className="text-right">
            <span
              className={clsx(
                "text-xl font-bold font-mono",
                isFree ? "text-emerald-400" : "text-foreground"
              )}
            >
              {isFree ? "FREE" : `$${cost.toFixed(2)}`}
            </span>
            {paidEntries > 0 && (
              <p className="text-[10px] text-amber-400 mt-0.5">
                &#8635; Converts to {paidEntries}{" "}
                {paidEntries === 1 ? "entry" : "entries"} if not selected
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Win Probability */}
      <div className="mx-5 mb-4 p-4 rounded-xl bg-gradient-to-r from-accent/5 to-transparent border border-accent/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">
            Your winning odds
          </span>
          <span className="text-2xl font-bold font-mono text-accent">
            ~{probabilityPercent}%
          </span>
        </div>
        <div className="h-3 bg-background rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-500 ease-out",
              "bg-gradient-to-r from-accent to-accent-hover"
            )}
            style={{ width: `${Math.min(probabilityPercent, 100)}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="text-[10px] text-foreground-muted text-center mt-2">
          Based on {totalTicketsInPool} tickets in pool &bull; {inventory} items
          available
        </p>
      </div>

      {/* Quick Select Grid */}
      <div className="px-5 pb-5">
        <p className="text-[10px] text-foreground-muted text-center mb-3 uppercase tracking-wider">
          Quick select
        </p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: maxTickets }).map((_, i) => {
            const ticketNum = i + 1;
            const ticketInfo = getCostForTickets(ticketNum);
            const isSelected = ticketNum === tickets;
            const isRollover = ticketNum <= (rolloverBalance ?? 0);
            const isFreeEntry =
              !isRollover && ticketNum === (rolloverBalance ?? 0) + 1;

            return (
              <button
                type="button"
                key={ticketNum}
                onClick={() => {
                  if (!disabled) setTickets(ticketNum);
                }}
                disabled={disabled}
                className={clsx(
                  "py-2.5 rounded-xl text-center transition-all duration-150",
                  "border-2 focus:outline-none focus:ring-2 focus:ring-accent/50",
                  isSelected
                    ? "border-accent bg-accent/20 text-accent scale-105 shadow-lg shadow-accent/20"
                    : isRollover
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/50"
                    : isFreeEntry
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/50"
                    : "border-border text-foreground-muted hover:border-foreground-muted hover:text-foreground-secondary"
                )}
                aria-label={`Select ${ticketNum} ticket${
                  ticketNum > 1 ? "s" : ""
                }`}
              >
                <div className="text-sm font-bold">{ticketNum}</div>
                <div className="text-[9px] font-mono leading-tight mt-0.5">
                  {isRollover ? (
                    <span className="flex items-center justify-center gap-0.5">
                      <RolloverIcon className="w-2.5 h-2.5" />
                    </span>
                  ) : isFreeEntry ? (
                    <span>FREE</span>
                  ) : (
                    <span>${ticketInfo.cost}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
