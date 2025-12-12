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
import { LotteryProofDisplay } from "@/components/lottery-proof";
import { GeoGate } from "@/components/geo-gate";
import { QueueWaitingRoom } from "@/components/queue-waiting-room";
import { useSSE } from "@/hooks/use-sse";
import { useCountdown } from "@/hooks/use-countdown";
import { useUserId } from "@/hooks/use-user-id";
import { useGeolocation, type GeoCoordinates } from "@/hooks/use-geolocation";
import { useQueue } from "@/hooks/use-queue";
import {
  registerForDrop,
  getPowChallenge,
  startPurchase,
  completePurchase,
  calculateCostWithRollover,
} from "@/lib/api";
import { solvePow, generateFingerprint } from "@/lib/pow-solver";
import { isInsideGeoFence } from "@/lib/geo";

const PRODUCT_NAME = "ALPHA SV JACKET";

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

  // Get ticket pricing from server state (with defaults)
  const ticketPricing = dropState.ticketPricing || {
    priceUnit: 1,
    maxTickets: 10,
    costs: [0, 0, 1, 5, 14, 30, 55, 91, 140, 204, 285],
  };

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

  // Stable fingerprint for queue + botValidation (must match)
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  useEffect(() => {
    setFingerprint(generateFingerprint());
  }, []);

  // Ticket selection state
  const [selectedTickets, setSelectedTickets] = useState(1);

  // Rollover celebration modal state
  const [showRolloverCelebration, setShowRolloverCelebration] = useState(false);
  const [celebrationCredits, setCelebrationCredits] = useState(0);

  // Purchase celebration modal state
  const [showPurchaseCelebration, setShowPurchaseCelebration] = useState(false);

  // Geolocation for geo-fenced drops
  const geolocation = useGeolocation();
  const [userLocation, setUserLocation] = useState<GeoCoordinates | null>(null);
  const [inGeoZone, setInGeoZone] = useState(false);

  // Geo-fence state from drop
  const hasGeoFence = !!dropState.geoFence;
  const isExclusiveGeoFence = dropState.geoFenceMode === "exclusive";
  const geoBonus = dropState.geoFenceBonusMultiplier ?? 1.5;

  // Handle location obtained from GeoGate
  const handleLocationObtained = (location: GeoCoordinates, isInZone: boolean) => {
    setUserLocation(location);
    setInGeoZone(isInZone);
  };

  // Check if user can register (geo-fence requirements met)
  const geoRequirementMet = !hasGeoFence || 
    !isExclusiveGeoFence || 
    (userLocation && dropState.geoFence && isInsideGeoFence(userLocation, dropState.geoFence));

  // Get rollover balance from SSE user state
  const rolloverBalance = userState.rolloverBalance || 0;
  const rolloverUsed = userState.rolloverUsed || 0;

  // Calculate rollover earned (for losers with paid entries)
  // This is tracked as paidEntries from registration
  const paidEntriesFromRegistration = userState.tickets
    ? Math.max(0, (userState.tickets || 0) - (userState.rolloverUsed || 0) - 1)
    : 0;

  // Calculate cost with rollover applied using server-provided priceUnit
  const { cost: ticketCost, rolloverUsed: rolloverToUse } =
    calculateCostWithRollover(
      selectedTickets,
      rolloverBalance,
      ticketPricing.priceUnit
    );

  // Derived state
  const isRegistered = userState.status !== "not_registered";
  const registrationOpen =
    dropState.phase === "registration" && !countdown.isExpired;

  // Queue (token sequencing) - join early, wait until ready before allowing registration
  const queue = useQueue({
    dropId,
    fingerprint,
    enabled: registrationOpen && userState.status === "not_registered",
    autoJoin: true,
  });

  const queueRequirementMet = !queue.queueEnabled || queue.isReady;

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

    // If queue is enabled, user must be "ready" and have a token
    if (!queueRequirementMet || (queue.queueEnabled && !queue.token)) {
      setActionStep("error");
      setActionMessage("Queue token required — wait for your turn in the queue.");
      return;
    }

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

      // Use the same fingerprint that was used to join the queue
      const fp = fingerprint ?? generateFingerprint();

      setActionStep("registering");
      const pageLoadTime =
        typeof window !== "undefined" && "pageLoadTime" in window
          ? (window as { pageLoadTime?: number }).pageLoadTime
          : undefined;
      const timingMs = pageLoadTime ? Date.now() - pageLoadTime : 5000;
      const result = await registerForDrop(
        dropId,
        userId,
        {
          fingerprint: fp,
          fingerprintConfidence: 90,
          timingMs,
          powSolution: solution,
          powChallenge: challenge,
        },
        selectedTickets,
        userLocation ?? undefined, // Pass location for geo-fenced drops
        queue.token ?? undefined,
        queue.behaviorSignals
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
      // If queue token became invalid/expired, automatically re-join queue so the user
      // can try again without getting stuck.
      if (
        err instanceof Error &&
        (err.message.includes("Queue token required") ||
          err.message.includes("Queue token not ready") ||
          err.message.includes("Invalid or expired queue token") ||
          err.message.includes("Queue token expired"))
      ) {
        setActionStep("error");
        setActionMessage(
          "Your queue token is no longer valid. Rejoining the queue…"
        );
        try {
          await queue.joinQueue();
        } catch {
          // ignore - queue hook already exposes its own error state
        }
        return;
      }

      setActionStep("error");
      setActionMessage(
        err instanceof Error ? err.message : "Registration failed"
      );
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    dropId,
    selectedTickets,
    userLocation,
    fingerprint,
    queueRequirementMet,
    queue.queueEnabled,
    queue.token,
    queue.behaviorSignals,
  ]);

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
        // Check geo-fence requirements for exclusive drops
        if (hasGeoFence && isExclusiveGeoFence && !geoRequirementMet) {
          return {
            text: "LOCATION REQUIRED",
            disabled: true,
            action: () => {},
          };
        }

        // Show cost after rollover is applied
        let buttonText: string;
        if (ticketCost > 0) {
          buttonText = `ENTER THE DROP — $${ticketCost.toFixed(2)}`;
        } else if (rolloverToUse > 0) {
          buttonText = "ENTER THE DROP — FREE (using rollover)";
        } else {
          buttonText = "ENTER THE DROP — FREE";
        }

        // Add geo bonus indicator if applicable
        if (hasGeoFence && !isExclusiveGeoFence && inGeoZone) {
          buttonText += ` (${geoBonus}x GEO BONUS)`;
        }

        return {
          text: buttonText,
          disabled: !registrationOpen || !queueRequirementMet,
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
          text: userState.promoted ? "YOU'VE BEEN PROMOTED! PURCHASE NOW" : "COMPLETE PURCHASE",
          disabled: false,
          action: handlePurchase,
        };
      case "backup_winner":
        return {
          text: `ON WAITLIST (#${userState.backupPosition || "?"})`,
          disabled: true,
          action: () => {},
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
      case "expired":
        return {
          text: "PURCHASE WINDOW EXPIRED",
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

  // Show geo-gate for geo-fenced drops during registration
  const showGeoGate =
    hasGeoFence &&
    userState.status === "not_registered" &&
    dropState.phase === "registration";

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

            {/* Lottery Provability */}
            <LotteryProofDisplay
              phase={dropState.phase}
              commitment={dropState.lotteryCommitment}
              dropId={dropId}
              userId={userId ?? undefined}
            />

            {/* Phase Display */}
            <PhaseDisplay
              phase={dropState.phase}
              countdown={countdown}
              purchaseCountdown={purchaseCountdown}
              isRegistered={isRegistered}
              userStatus={userState.status}
            />
          </section>

          {/* Stats Grid - use server inventory or fallback */}
          <StatsGrid
            phase={dropState.phase}
            entries={dropState.participantCount}
            totalTickets={dropState.totalTickets}
            totalEffectiveTickets={dropState.totalEffectiveTickets}
            inventory={dropState.inventory}
            maxInventory={dropState.initialInventory || dropState.inventory || 10}
            // User-specific for odds calculation
            userTickets={userState.tickets}
            userEffectiveTickets={userState.effectiveTickets}
            loyaltyTier={userState.loyaltyTier}
            loyaltyMultiplier={userState.loyaltyMultiplier}
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
            backupPosition={userState.backupPosition}
            promoted={userState.promoted}
          />

          {/* Queue waiting room (only shows when queue is enabled) */}
          {registrationOpen && userState.status === "not_registered" && (
            <QueueWaitingRoom
              status={queue.status}
              position={queue.position}
              estimatedWaitSeconds={queue.estimatedWaitSeconds}
              expiresAt={queue.expiresAt}
              error={queue.error}
              queueEnabled={queue.queueEnabled}
              isPowSolving={actionStep === "solving"}
              powProgress={actionProgress}
              onRetry={queue.joinQueue}
            />
          )}

          {/* Geo-Fence Gate */}
          {showGeoGate && dropState.geoFence && dropState.geoFenceMode && (
            <GeoGate
              geoFence={dropState.geoFence}
              geoFenceMode={dropState.geoFenceMode}
              bonusMultiplier={geoBonus}
              geolocation={geolocation}
              onLocationObtained={handleLocationObtained}
            />
          )}

          {/* Ticket Selector - use server-provided pricing */}
          {showTicketSelector && (
            <TicketSelector
              tickets={selectedTickets}
              setTickets={setSelectedTickets}
              maxTickets={ticketPricing.maxTickets}
              priceUnit={ticketPricing.priceUnit}
              totalTicketsInPool={dropState.totalTickets}
              inventory={dropState.inventory || ticketPricing.maxTickets}
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
