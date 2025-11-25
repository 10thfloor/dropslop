"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/header";
import { PhaseDisplay } from "@/components/phase-display";
import { StatsGrid } from "@/components/stats-grid";
import { StatusPanel } from "@/components/status-panel";
import { ActionButton } from "@/components/action-button";
import { ActionStatus, type ActionStep } from "@/components/action-status";
import { TicketSelector } from "@/components/ticket-selector";
import { RolloverCelebration } from "@/components/rollover-celebration";
import { PurchaseCelebration } from "@/components/purchase-celebration";
import { useSSE } from "@/hooks/use-sse";
import { useCountdown } from "@/hooks/use-countdown";
import { useUserId } from "@/hooks/use-user-id";
import {
  registerForDrop,
  getPowChallenge,
  startPurchase,
  completePurchase,
  calculateCostWithRollover,
} from "@/lib/api";
import { solvePow, generateFingerprint } from "@/lib/pow-solver";

const PRODUCT_NAME = "ALPHA SV JACKET";
const MAX_INVENTORY = 10;

export default function DropPage() {
  // Get dropId from URL params
  const params = useParams();
  const dropId = params.dropId as string;

  // Use drop-specific userId
  const userId = useUserId(dropId);

  // SSE connection - provides server-authoritative state and clock sync
  const { dropState, userState, connected, error, clockOffset } = useSSE({
    dropId,
    userId,
    enabled: !!userId && !!dropId,
  });

  // Countdowns use server-authoritative timestamps, corrected for clock drift
  const countdown = useCountdown(dropState.registrationEnd, clockOffset);
  const purchaseCountdown = useCountdown(
    dropState.purchaseEnd ?? null,
    clockOffset
  );

  const [loading, setLoading] = useState(false);
  const [actionStep, setActionStep] = useState<ActionStep>("idle");
  const [actionProgress, setActionProgress] = useState(0);
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const [resultPosition, setResultPosition] = useState<number | undefined>();

  // Ticket selection state
  const [selectedTickets, setSelectedTickets] = useState(1);

  // Rollover celebration modal state
  const [showRolloverCelebration, setShowRolloverCelebration] = useState(false);
  const [celebrationCredits, setCelebrationCredits] = useState(0);

  // Purchase celebration modal state
  const [showPurchaseCelebration, setShowPurchaseCelebration] = useState(false);

  // Get rollover balance from SSE user state
  const rolloverBalance = userState.rolloverBalance || 0;
  const rolloverUsed = userState.rolloverUsed || 0;

  // Calculate rollover earned (for losers with paid entries)
  // This is tracked as paidEntries from registration
  const paidEntriesFromRegistration = userState.tickets
    ? Math.max(0, (userState.tickets || 0) - (userState.rolloverUsed || 0) - 1)
    : 0;

  // Calculate cost with rollover applied
  const { cost: ticketCost, rolloverUsed: rolloverToUse } =
    calculateCostWithRollover(
      selectedTickets,
      rolloverBalance,
      1 // priceUnit
    );

  // Derived state
  const isRegistered = userState.status !== "not_registered";
  const registrationOpen =
    dropState.phase === "registration" && !countdown.isExpired;

  // Show rollover celebration when user becomes a loser with paid entries
  useEffect(() => {
    if (userState.status === "loser" && paidEntriesFromRegistration > 0) {
      setCelebrationCredits(paidEntriesFromRegistration);
      setShowRolloverCelebration(true);
    }
  }, [userState.status, paidEntriesFromRegistration]);

  // Auto-clear success/error status after delay
  useEffect(() => {
    if (actionStep === "success" || actionStep === "error") {
      const timer = setTimeout(() => {
        setActionStep("idle");
        setActionMessage(undefined);
        setResultPosition(undefined);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionStep]);

  const handleRegister = useCallback(async () => {
    if (!userId || !dropId) return;

    setLoading(true);
    setActionStep("challenge");
    setActionProgress(0);
    setResultPosition(undefined);

    try {
      const { challenge, difficulty } = await getPowChallenge();

      setActionStep("solving");
      const solution = await solvePow(challenge, difficulty, (progress) => {
        setActionProgress(progress);
      });
      setActionProgress(100);

      const fingerprint = generateFingerprint();

      setActionStep("registering");
      const pageLoadTime = (window as unknown as { pageLoadTime?: number })
        .pageLoadTime;
      const timingMs = pageLoadTime ? Date.now() - pageLoadTime : 5000;
      const result = await registerForDrop(
        dropId,
        userId,
        {
          fingerprint,
          fingerprintConfidence: 90,
          timingMs,
          powSolution: solution,
          powChallenge: challenge,
        },
        selectedTickets
      );

      setActionStep("success");

      // Build descriptive message with rollover info
      let ticketText = "";
      if (result.userTickets > 1) {
        const parts = [];
        if (result.rolloverUsed > 0)
          parts.push(`${result.rolloverUsed} rollover`);
        if (result.paidEntries > 0) {
          parts.push(`${result.paidEntries} paid`);
        }
        if (parts.length > 0) {
          ticketText = ` with ${result.userTickets} entries (${parts.join(
            " + "
          )})`;
        } else {
          ticketText = ` with ${result.userTickets} entries`;
        }
      }

      // Add rollover protection message if they have paid entries
      let rolloverNote = "";
      if (result.paidEntries > 0) {
        rolloverNote = ` • ${result.paidEntries} entries protected by rollover`;
      }

      setActionMessage(
        `You're in! Position #${result.position}${ticketText}${rolloverNote}`
      );
      setResultPosition(result.position);
    } catch (err) {
      setActionStep("error");
      setActionMessage(
        err instanceof Error ? err.message : "Registration failed"
      );
    } finally {
      setLoading(false);
    }
  }, [userId, dropId, selectedTickets]);

  const handlePurchase = useCallback(async () => {
    if (!userId || !dropId) return;

    setLoading(true);
    setActionStep("processing");

    try {
      const { purchaseToken } = await startPurchase(dropId, userId);
      await completePurchase(dropId, userId, purchaseToken);

      setActionStep("success");
      setShowPurchaseCelebration(true);
    } catch (err) {
      setActionStep("error");
      setActionMessage(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setLoading(false);
    }
  }, [userId, dropId]);

  const getButtonConfig = () => {
    // Check for expired winner first (won but missed purchase window)
    const isExpiredWinner =
      userState.status === "winner" && dropState.phase === "completed";
    if (isExpiredWinner) {
      return {
        text: "PURCHASE WINDOW CLOSED",
        disabled: true,
        action: () => {},
      };
    }

    // Check for missed registration (not registered and drop is past registration phase)
    const missedRegistration =
      userState.status === "not_registered" &&
      (dropState.phase === "lottery" || dropState.phase === "purchase");
    if (missedRegistration) {
      return {
        text:
          dropState.phase === "lottery"
            ? "LOTTERY IN PROGRESS"
            : "WINNERS PURCHASING",
        disabled: true,
        action: () => {},
      };
    }

    // Check for missed entire drop (not registered and drop completed)
    const missedEntireDrop =
      userState.status === "not_registered" && dropState.phase === "completed";
    if (missedEntireDrop) {
      return {
        text: "MISSED THIS DROP",
        disabled: true,
        action: () => {},
      };
    }

    if (dropState.phase === "completed") {
      return { text: "DROP ENDED", disabled: true, action: () => {} };
    }

    // Registration closed but lottery not started yet
    if (dropState.phase === "registration" && countdown.isExpired) {
      if (isRegistered) {
        return {
          text: `REGISTERED (${userState.tickets || 1} ${
            (userState.tickets || 1) > 1 ? "entries" : "entry"
          })`,
          disabled: true,
          action: () => {},
        };
      }
      return {
        text: "REGISTRATION CLOSED",
        disabled: true,
        action: () => {},
      };
    }

    switch (userState.status) {
      case "not_registered": {
        // Show cost after rollover is applied
        let buttonText: string;
        if (ticketCost > 0) {
          buttonText = `ENTER THE DROP — $${ticketCost.toFixed(2)}`;
        } else if (rolloverToUse > 0) {
          buttonText = "ENTER THE DROP — FREE (using rollover)";
        } else {
          buttonText = "ENTER THE DROP — FREE";
        }
        return {
          text: buttonText,
          disabled: !registrationOpen,
          action: handleRegister,
        };
      }
      case "registered":
        return {
          text: `REGISTERED (${userState.tickets || 1} ${
            (userState.tickets || 1) > 1 ? "entries" : "entry"
          })`,
          disabled: true,
          action: () => {},
        };
      case "winner":
        return {
          text: "COMPLETE PURCHASE",
          disabled: false,
          action: handlePurchase,
        };
      case "loser": {
        // Positive messaging about rollover
        const text =
          rolloverBalance > 0
            ? `VIEW YOUR ${rolloverBalance} ROLLOVER CREDITS`
            : "NOT SELECTED";
        return {
          text,
          disabled: true,
          action: () => {},
        };
      }
      case "purchased":
        return {
          text: "PURCHASED ✓",
          disabled: true,
          action: () => {},
        };
      default:
        return { text: "ENTER THE DROP", disabled: true, action: () => {} };
    }
  };

  const buttonConfig = getButtonConfig();

  // Show loading state while dropId is being resolved
  if (!dropId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-foreground-secondary">Loading...</p>
      </div>
    );
  }

  // Only show ticket selector during open registration for unregistered users
  const showTicketSelector =
    userState.status === "not_registered" && registrationOpen;

  return (
    <div className="min-h-screen bg-background">
      <Header connected={connected} phase={dropState.phase} />

      {/* Rollover Celebration Modal */}
      {showRolloverCelebration && (
        <RolloverCelebration
          earnedEntries={celebrationCredits}
          totalBalance={rolloverBalance}
          onDismiss={() => setShowRolloverCelebration(false)}
        />
      )}

      {/* Purchase Celebration Modal */}
      {showPurchaseCelebration && (
        <PurchaseCelebration
          productName={PRODUCT_NAME}
          dropId={dropId}
          onDismiss={() => setShowPurchaseCelebration(false)}
        />
      )}

      <main className="pt-24 pb-12 px-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Hero Section */}
          <section className="text-center py-12 space-y-6 animate-fade-in">
            <p className="text-xs uppercase tracking-[0.3em] text-foreground-secondary">
              LIMITED EDITION RELEASE
            </p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              {PRODUCT_NAME}
            </h1>

            {/* Drop ID badge */}
            <p className="text-xs font-mono text-foreground-muted">
              DROP: {dropId}
            </p>

            {/* Phase Display */}
            <PhaseDisplay
              phase={dropState.phase}
              countdown={countdown}
              purchaseCountdown={purchaseCountdown}
              isRegistered={isRegistered}
              userStatus={userState.status}
            />
          </section>

          {/* Stats Grid */}
          <StatsGrid
            phase={dropState.phase}
            entries={dropState.participantCount}
            totalTickets={dropState.totalTickets}
            inventory={dropState.inventory}
            maxInventory={MAX_INVENTORY}
          />

          {/* Status Panel - Enhanced with rollover info */}
          <StatusPanel
            status={userState.status}
            position={userState.queuePosition}
            tickets={userState.tickets}
            purchaseToken={userState.purchaseToken}
            rolloverUsed={rolloverUsed}
            rolloverEarned={
              userState.status === "loser" ? paidEntriesFromRegistration : 0
            }
            totalRolloverBalance={rolloverBalance}
            onPurchase={
              userState.status === "winner" ? handlePurchase : undefined
            }
            purchaseLoading={loading && userState.status === "winner"}
            registrationClosed={
              !registrationOpen ||
              dropState.phase === "lottery" ||
              dropState.phase === "purchase"
            }
            dropCompleted={dropState.phase === "completed"}
          />

          {/* Ticket Selector - only show during open registration */}
          {showTicketSelector && (
            <TicketSelector
              tickets={selectedTickets}
              setTickets={setSelectedTickets}
              maxTickets={10}
              priceUnit={1}
              totalTicketsInPool={dropState.totalTickets}
              inventory={dropState.inventory || MAX_INVENTORY}
              rolloverBalance={rolloverBalance}
              disabled={loading}
            />
          )}

          {/* Action Button - Only show for unregistered users during open registration */}
          {dropState.phase !== "completed" &&
            userState.status === "not_registered" &&
            registrationOpen && (
              <div className="pt-4">
                {/* Hide button once action starts - ActionStatus shows progress */}
                {actionStep === "idle" && (
                  <ActionButton
                    onClick={buttonConfig.action}
                    disabled={buttonConfig.disabled}
                    loading={loading}
                  >
                    {buttonConfig.text}
                  </ActionButton>
                )}

                {/* Inline Action Status */}
                <ActionStatus
                  step={actionStep}
                  progress={actionProgress}
                  message={actionMessage}
                  position={resultPosition}
                />
              </div>
            )}

          {/* Connection Error */}
          {error && (
            <p className="text-center text-sm text-red-500 animate-pulse">
              {error}. Reconnecting...
            </p>
          )}

          {/* Post-registration rollover reminder */}
          {isRegistered && userState.status === "registered" && (
            <div className="text-center p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-sm text-foreground-secondary">
                <span className="text-amber-400 font-medium">Remember:</span> If
                you're not selected, entries roll over and you can use them in
                the next drop!
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
