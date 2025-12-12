import * as restate from "@restatedev/restate-sdk";
import type {
  DropState,
  DropConfig,
  Phase,
  RegisterRequest,
  TicketPricing,
  LotteryProof,
  GeoFence,
  GeoFenceMode,
} from "../lib/types.js";
import {
  selectWinnersWeighted,
  selectWinnersWithMultipliers,
  generateLotterySeed,
  getTotalTickets,
  getTotalEffectiveTickets,
  getTicketPricing,
  generateLotteryCommitment,
  createLotteryProof,
} from "../lib/lottery.js";
import {
  MerkleTree,
  generateVerifiableSeedFromMerkle,
  verifyMerkleProof,
} from "../lib/merkle.js";
import type { UserInclusionProof } from "../lib/types.js";
import { isInsideGeoFence, validateGeoFence } from "../lib/geo.js";
import { publishDropState } from "../lib/nats.js";
import { deleteDropIndex, upsertDropIndex } from "../lib/nats-kv.js";
import { userRolloverObject } from "./user-rollover.js";
import { userLoyaltyObject } from "./user-loyalty.js";
import { participantObject } from "./participant.js";
import { config } from "../lib/config.js";

// State keys
const STATE_KEY = "state";

// Use config for defaults
const DEFAULT_PRICE_UNIT = config.drop.defaultPriceUnit;
const DEFAULT_MAX_TICKETS = config.drop.defaultMaxTickets;
const DEFAULT_BACKUP_MULTIPLIER = config.backup.defaultMultiplier;

/**
 * Helper to get current time deterministically in Restate context
 * Wraps Date.now() in ctx.run() to ensure consistent replay behavior
 */
async function getCurrentTime(ctx: restate.ObjectContext): Promise<number> {
  return ctx.run("get_time", () => Date.now());
}

/**
 * Helper to publish drop state as a side effect
 * Wrapped in ctx.run() to ensure idempotent execution during replay
 */
async function publishDropStateEffect(
  ctx: restate.ObjectContext,
  dropId: string,
  state: DropState,
  extra?: { purchaseEnd?: number }
): Promise<void> {
  const participantCount = Object.keys(state.participantTickets).length;
  const totalTickets = getTotalTickets(state.participantTickets);

  await ctx.run("publish_drop_state", async () => {
    publishDropState(dropId, {
      type: "drop",
      phase: state.phase,
      participantCount,
      totalTickets,
      inventory: state.inventory,
      registrationEnd: state.config.registrationEnd,
      purchaseEnd: extra?.purchaseEnd ?? state.purchaseEnd,
      serverTime: Date.now(),
      lotteryCommitment: state.config.lotteryCommitment,
      initialInventory: state.initialInventory,
    });
  });
}

// Define the Drop virtual object
export const dropObject = restate.object({
  name: "Drop",
  handlers: {
    /**
     * Initialize a new drop with configuration
     * Generates lottery commitment for verifiable randomness
     * Automatically schedules lottery to run when registration ends
     */
    initialize: async (
      ctx: restate.ObjectContext,
      dropConfig: DropConfig
    ): Promise<{
      success: boolean;
      dropId: string;
      lotteryCommitment?: string;
    }> => {
      const existing = await ctx.get<DropState>(STATE_KEY);

      if (existing) {
        return {
          success: true,
          dropId: dropConfig.dropId,
          lotteryCommitment: existing.config.lotteryCommitment,
        };
      }

      // Validate geo-fence configuration if provided
      if (dropConfig.geoFence) {
        const geoError = validateGeoFence(
          dropConfig.geoFence,
          config.geo.minRadiusMeters,
          config.geo.maxRadiusMeters
        );
        if (geoError) {
          throw new restate.TerminalError(`Invalid geo-fence: ${geoError}`, {
            errorCode: 400,
          });
        }
      }

      // Generate lottery commitment for verifiable randomness
      // Secret is stored, commitment is published
      const { secret, commitment } = await ctx.run("generate_commitment", () =>
        generateLotteryCommitment()
      );

      // Apply defaults for ticket pricing, backup, and geo-fence
      const fullConfig: DropConfig = {
        ...dropConfig,
        ticketPriceUnit: dropConfig.ticketPriceUnit ?? DEFAULT_PRICE_UNIT,
        maxTicketsPerUser: dropConfig.maxTicketsPerUser ?? DEFAULT_MAX_TICKETS,
        backupMultiplier:
          dropConfig.backupMultiplier ?? DEFAULT_BACKUP_MULTIPLIER,
        lotteryCommitment: commitment,
        // Geo-fence defaults
        geoFenceBonusMultiplier:
          dropConfig.geoFenceBonusMultiplier ??
          config.geo.defaultBonusMultiplier,
      };

      const state: DropState = {
        phase: "registration",
        inventory: dropConfig.inventory,
        initialInventory: dropConfig.inventory,
        participantTickets: {},
        participantMultipliers: {},
        winners: [],
        backupWinners: [],
        expiredWinners: [],
        config: fullConfig,
        lotterySecret: secret,
      };

      await ctx.set(STATE_KEY, state);

      // Record this drop in the drop index (for homepage listing)
      await ctx.run("drops_index_upsert", async () => {
        await upsertDropIndex({
          dropId: fullConfig.dropId,
          createdAt: Date.now(),
          registrationStart: fullConfig.registrationStart,
          registrationEnd: fullConfig.registrationEnd,
          purchaseWindow: fullConfig.purchaseWindow,
        });
      });

      // Publish initial drop state so active drops SSE updates immediately
      await publishDropStateEffect(ctx, fullConfig.dropId, state);

      // Schedule the lottery to run automatically when registration ends
      const now = await getCurrentTime(ctx);
      const delayMs = Math.max(0, fullConfig.registrationEnd - now);

      if (delayMs > 0) {
        // Schedule lottery using delayed send (fire-and-forget)
        ctx
          .objectSendClient(dropObject, dropConfig.dropId, { delay: delayMs })
          .runLottery({});

        console.log(
          `[Drop ${dropConfig.dropId}] Lottery scheduled in ${Math.round(
            delayMs / 1000
          )}s, commitment: ${commitment.substring(0, 16)}...`
        );
      }

      return {
        success: true,
        dropId: dropConfig.dropId,
        lotteryCommitment: commitment,
      };
    },

    /**
     * Register a participant for the drop (with ticket count)
     * Automatically applies rollover entries, then free entry, then paid entries
     * Fetches user's loyalty multiplier for weighted selection
     */
    register: async (
      ctx: restate.ObjectContext,
      request: RegisterRequest
    ): Promise<{
      success: boolean;
      participantCount: number;
      totalTickets: number;
      userTickets: number;
      effectiveTickets: number;
      position: number;
      rolloverUsed: number;
      paidEntries: number;
      loyaltyTier: string;
      loyaltyMultiplier: number;
      geoBonus: number;
      inGeoZone: boolean;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        throw new restate.TerminalError("Drop not initialized", {
          errorCode: 404,
        });
      }

      if (state.phase !== "registration") {
        throw new restate.TerminalError(
          `Registration closed - drop is in ${state.phase} phase`,
          { errorCode: 409 }
        );
      }

      const now = await getCurrentTime(ctx);
      if (
        now < state.config.registrationStart ||
        now >= state.config.registrationEnd
      ) {
        throw new restate.TerminalError("Registration window closed", {
          errorCode: 409,
        });
      }

      // Validate ticket count
      const maxTickets = state.config.maxTicketsPerUser ?? DEFAULT_MAX_TICKETS;
      const desiredTickets = Math.max(
        1,
        Math.min(request.tickets || 1, maxTickets)
      );

      const existingTickets = state.participantTickets[request.userId] || 0;
      const isNewRegistration = existingTickets === 0;

      // Only allow new registrations (no upgrades for now to simplify rollover logic)
      if (!isNewRegistration) {
        throw new restate.TerminalError("Already registered for this drop", {
          errorCode: 409,
        });
      }

      // Geo-fence validation
      let geoBonus = 1.0;
      let inGeoZone = false;

      if (state.config.geoFence) {
        const { geoFence, geoFenceMode, geoFenceBonusMultiplier } =
          state.config;

        if (geoFenceMode === "exclusive") {
          // Location required for exclusive drops
          if (!request.location) {
            throw new restate.TerminalError(
              "Location required for this geo-fenced drop",
              { errorCode: 400 }
            );
          }
          if (!isInsideGeoFence(request.location, geoFence)) {
            throw new restate.TerminalError(
              "You must be within the drop zone to register",
              { errorCode: 403 }
            );
          }
          inGeoZone = true;
        } else if (geoFenceMode === "bonus") {
          // Bonus mode: location is optional, but gives a multiplier if inside
          if (
            request.location &&
            isInsideGeoFence(request.location, geoFence)
          ) {
            geoBonus =
              geoFenceBonusMultiplier ?? config.geo.defaultBonusMultiplier;
            inGeoZone = true;
          }
        }
      }

      // Get user's loyalty multiplier
      const loyaltyInfo = await ctx
        .objectClient(userLoyaltyObject, request.userId)
        .getMultiplier({});

      // Check user's rollover balance
      const rolloverBalance = await ctx
        .objectClient(userRolloverObject, request.userId)
        .getBalance({});

      // Calculate entry breakdown:
      // 1. Use rollover entries first (up to desired amount)
      // 2. If not fully covered, add 1 free entry
      // 3. Remaining are paid entries
      const rolloverToUse = Math.min(rolloverBalance.balance, desiredTickets);
      const remainingAfterRollover = desiredTickets - rolloverToUse;

      // Free entry only applies if rollover didn't cover everything
      const freeEntry = remainingAfterRollover > 0 ? 1 : 0;
      const paidEntries = Math.max(0, remainingAfterRollover - freeEntry);

      // Consume rollover entries from global balance
      let rolloverUsed = 0;
      if (rolloverToUse > 0) {
        const consumeResult = await ctx
          .objectClient(userRolloverObject, request.userId)
          .consumeRollover({ amount: rolloverToUse });
        rolloverUsed = consumeResult.consumed;
      }

      // Register with the calculated total
      const actualTickets = rolloverUsed + freeEntry + paidEntries;
      // Combine loyalty multiplier and geo bonus
      const combinedMultiplier = loyaltyInfo.multiplier * geoBonus;
      const effectiveTickets = Math.floor(actualTickets * combinedMultiplier);

      state.participantTickets[request.userId] = actualTickets;
      state.participantMultipliers[request.userId] = combinedMultiplier;
      await ctx.set(STATE_KEY, state);

      // Update participant state with entry breakdown and loyalty info
      const participantCount = Object.keys(state.participantTickets).length;
      ctx
        .objectSendClient(
          participantObject,
          `${state.config.dropId}:${request.userId}`
        )
        .setRegistered({
          position: participantCount,
          tickets: actualTickets,
          effectiveTickets,
          rolloverUsed,
          paidEntries,
          loyaltyTier: loyaltyInfo.tier,
          loyaltyMultiplier: loyaltyInfo.multiplier,
        });

      // Publish update to NATS (wrapped in side effect)
      await publishDropStateEffect(ctx, state.config.dropId, state);

      const geoInfo = inGeoZone ? ` [geo: ${geoBonus}x]` : "";
      console.log(
        `[Drop ${state.config.dropId}] User ${
          request.userId
        } registered: ${actualTickets} tickets × ${combinedMultiplier.toFixed(
          2
        )}x (${loyaltyInfo.tier}${geoInfo}) = ${effectiveTickets} effective`
      );

      return {
        success: true,
        participantCount,
        totalTickets: getTotalTickets(state.participantTickets),
        userTickets: actualTickets,
        effectiveTickets,
        position: participantCount,
        rolloverUsed,
        paidEntries,
        loyaltyTier: loyaltyInfo.tier,
        loyaltyMultiplier: loyaltyInfo.multiplier,
        geoBonus,
        inGeoZone,
      };
    },

    /**
     * Run the lottery to select winners (weighted by tickets and loyalty multipliers)
     * Also selects backup winners for auto-promotion if primary winners don't purchase
     * Creates verifiable lottery proof
     */
    runLottery: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      success: boolean;
      winners: string[];
      backupWinners: string[];
      participantCount: number;
      totalTickets: number;
      totalEffectiveTickets: number;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        throw new restate.TerminalError("Drop not initialized", {
          errorCode: 404,
        });
      }

      const participantCount = Object.keys(state.participantTickets).length;
      const totalTickets = getTotalTickets(state.participantTickets);
      const totalEffectiveTickets = getTotalEffectiveTickets(
        state.participantTickets,
        state.participantMultipliers
      );

      if (state.phase !== "registration") {
        // Already ran lottery
        return {
          success: true,
          winners: state.winners,
          backupWinners: state.backupWinners,
          participantCount,
          totalTickets,
          totalEffectiveTickets,
        };
      }

      state.phase = "lottery";

      // Calculate how many winners + backups to select
      const primaryWinnerCount = Math.min(state.inventory, participantCount);
      const backupMultiplier =
        state.config.backupMultiplier ?? DEFAULT_BACKUP_MULTIPLIER;
      const totalToSelect = Math.min(
        Math.ceil(primaryWinnerCount * backupMultiplier),
        participantCount
      );

      // Build Merkle tree and generate seed from Merkle root
      const merkleTree = MerkleTree.fromParticipants(
        state.participantTickets,
        state.participantMultipliers
      );
      if (!state.lotterySecret) {
        throw new restate.TerminalError("Lottery secret missing", {
          errorCode: 500,
        });
      }
      if (!state.config.lotteryCommitment) {
        throw new restate.TerminalError("Lottery commitment missing", {
          errorCode: 500,
        });
      }
      const seed = generateVerifiableSeedFromMerkle(
        state.lotterySecret,
        merkleTree.root
      );

      // Select all winners at once using multipliers
      const allSelected = selectWinnersWithMultipliers(
        state.participantTickets,
        state.participantMultipliers,
        totalToSelect,
        seed
      );

      // Split into primary winners and backups
      const winners = allSelected.slice(0, primaryWinnerCount);
      const backupWinners = allSelected.slice(primaryWinnerCount);

      state.winners = winners;
      state.backupWinners = backupWinners;
      state.expiredWinners = [];
      state.phase = "purchase";

      // Create lottery proof for verification (using Merkle tree)
      const proofResult = createLotteryProof(
        state.lotterySecret,
        state.config.lotteryCommitment,
        state.participantTickets,
        state.participantMultipliers,
        winners,
        backupWinners
      );
      state.lotteryProof = proofResult.proof;
      // Store leaves and hashes for inclusion proof generation
      state.participantLeaves = proofResult.leaves;
      state.participantLeafHashes = proofResult.leafHashes;

      // Calculate purchase window end time
      const now = await getCurrentTime(ctx);
      state.purchaseEnd = now + state.config.purchaseWindow * 1000;
      await ctx.set(STATE_KEY, state);

      // Publish update to NATS (wrapped in side effect)
      await publishDropStateEffect(ctx, state.config.dropId, state);

      // Notify primary winners
      for (let i = 0; i < winners.length; i++) {
        const userId = winners[i];
        ctx
          .objectSendClient(
            participantObject,
            `${state.config.dropId}:${userId}`
          )
          .notifyResult({
            isWinner: true,
            position: i + 1,
          });
      }

      // Notify backup winners
      for (let i = 0; i < backupWinners.length; i++) {
        const userId = backupWinners[i];
        ctx
          .objectSendClient(
            participantObject,
            `${state.config.dropId}:${userId}`
          )
          .notifyBackup({
            backupPosition: i + 1,
            totalBackups: backupWinners.length,
          });
      }

      // Notify losers (not selected at all)
      const selectedSet = new Set(allSelected);
      for (const userId of Object.keys(state.participantTickets)) {
        if (!selectedSet.has(userId)) {
          ctx
            .objectSendClient(
              participantObject,
              `${state.config.dropId}:${userId}`
            )
            .notifyResult({ isWinner: false });
        }
      }

      // Record participation for all participants (for loyalty tracking)
      for (const userId of Object.keys(state.participantTickets)) {
        ctx
          .objectSendClient(userLoyaltyObject, userId)
          .recordParticipation({ dropId: state.config.dropId });
      }

      // Schedule purchase window closure
      const purchaseWindowMs = state.config.purchaseWindow * 1000;
      ctx
        .objectSendClient(dropObject, state.config.dropId, {
          delay: purchaseWindowMs,
        })
        .closePurchaseWindow({});

      console.log(
        `[Drop ${state.config.dropId}] Lottery complete: ${winners.length} winners, ${backupWinners.length} backups. Purchase window closes in ${state.config.purchaseWindow}s`
      );

      return {
        success: true,
        winners: state.winners,
        backupWinners: state.backupWinners,
        participantCount,
        totalTickets,
        totalEffectiveTickets,
      };
    },

    /**
     * Start purchase phase for a winner (generates secure token)
     * Schedules expiry check for auto-promotion of backups
     */
    startPurchase: async (
      ctx: restate.ObjectContext,
      input: { userId: string }
    ): Promise<{
      success: boolean;
      purchaseToken: string;
      expiresAt: number;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        throw new restate.TerminalError("Drop not initialized", {
          errorCode: 404,
        });
      }

      if (state.phase !== "purchase") {
        throw new restate.TerminalError(
          `Cannot purchase in phase: ${state.phase}`,
          { errorCode: 409 }
        );
      }

      if (!state.winners.includes(input.userId)) {
        throw new restate.TerminalError("User is not a winner", {
          errorCode: 403,
        });
      }

      if (state.inventory <= 0) {
        throw new restate.TerminalError("No inventory available", {
          errorCode: 410,
        });
      }

      const now = await getCurrentTime(ctx);
      // Use remaining purchase window time (not full window for each winner)
      const expiresAt =
        state.purchaseEnd ?? now + state.config.purchaseWindow * 1000;

      // Generate self-verifying HMAC-signed purchase token
      // Format: shortId.expiry.signature (~41 chars)
      // Token contains expiration and can be verified without stored state
      const { generatePurchaseToken } = await import(
        "../lib/purchase-token.js"
      );
      const purchaseToken = await ctx.run("generate_token", () =>
        generatePurchaseToken(state.config.dropId, input.userId, expiresAt)
      );

      // Update participant state with token
      ctx
        .objectSendClient(
          participantObject,
          `${state.config.dropId}:${input.userId}`
        )
        .setToken({
          purchaseToken,
          expiresAt,
        });

      // Schedule expiry check for this winner (for backup promotion)
      const timeUntilExpiry = expiresAt - now;
      if (timeUntilExpiry > 0) {
        ctx
          .objectSendClient(dropObject, state.config.dropId, {
            delay: timeUntilExpiry,
          })
          .checkWinnerExpiry({ userId: input.userId });
      }

      return {
        success: true,
        purchaseToken,
        expiresAt,
      };
    },

    /**
     * Complete a purchase
     */
    completePurchase: async (
      ctx: restate.ObjectContext,
      input: { userId: string; purchaseToken: string }
    ): Promise<{ success: boolean; inventory: number; phase: Phase }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        throw new restate.TerminalError("Drop not initialized", {
          errorCode: 404,
        });
      }

      if (state.phase !== "purchase") {
        throw new restate.TerminalError(
          `Cannot complete purchase in phase: ${state.phase}`,
          { errorCode: 409 }
        );
      }

      if (state.inventory <= 0) {
        throw new restate.TerminalError("No inventory available", {
          errorCode: 410,
        });
      }

      // Verify with participant object
      const participantKey = `${state.config.dropId}:${input.userId}`;
      const participantResult = (await ctx
        .objectClient(participantObject, participantKey)
        .completePurchase({
          purchaseToken: input.purchaseToken,
        })) as { success: boolean; error?: string };

      if (!participantResult.success) {
        throw new restate.TerminalError(
          participantResult.error || "Purchase verification failed",
          { errorCode: 400 }
        );
      }

      // Decrement inventory
      state.inventory--;

      // Check if drop is complete
      if (state.inventory === 0) {
        state.phase = "completed";
      }

      await ctx.set(STATE_KEY, state);

      // If completed early (inventory exhausted), remove from active drop index
      if (state.phase === "completed") {
        await ctx.run("drops_index_delete", async () => {
          await deleteDropIndex(state.config.dropId);
        });
      }

      // Publish update to NATS (wrapped in side effect)
      await publishDropStateEffect(ctx, state.config.dropId, state);

      return {
        success: true,
        inventory: state.inventory,
        phase: state.phase,
      };
    },

    /**
     * Close the purchase window (called automatically after purchaseWindow expires)
     */
    closePurchaseWindow: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ success: boolean; phase: Phase }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        return { success: false, phase: "registration" };
      }

      // Only close if still in purchase phase
      if (state.phase !== "purchase") {
        return { success: true, phase: state.phase };
      }

      // Transition to completed
      state.phase = "completed";
      await ctx.set(STATE_KEY, state);

      // Remove from active drop index
      await ctx.run("drops_index_delete", async () => {
        await deleteDropIndex(state.config.dropId);
      });

      // Publish update to NATS (wrapped in side effect)
      await publishDropStateEffect(ctx, state.config.dropId, state);

      console.log(
        `[Drop ${state.config.dropId}] Purchase window closed. Final inventory: ${state.inventory}, expired winners: ${state.expiredWinners.length}`
      );

      return {
        success: true,
        phase: state.phase,
      };
    },

    /**
     * Check if a winner's token has expired without purchase
     * If so, move them to expired list and promote next backup
     */
    checkWinnerExpiry: async (
      ctx: restate.ObjectContext,
      input: { userId: string }
    ): Promise<{ expired: boolean; promoted?: string }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state || state.phase !== "purchase") {
        return { expired: false };
      }

      // Check if user is still in winners list (hasn't purchased)
      if (!state.winners.includes(input.userId)) {
        return { expired: false };
      }

      // Check participant status
      const participantState = await ctx
        .objectClient(
          participantObject,
          `${state.config.dropId}:${input.userId}`
        )
        .getState({});

      // If they've already purchased, nothing to do
      if (participantState.status === "purchased") {
        return { expired: false };
      }

      // Winner hasn't purchased - mark as expired
      state.winners = state.winners.filter((id) => id !== input.userId);
      state.expiredWinners.push(input.userId);

      // Notify the expired winner
      ctx
        .objectSendClient(
          participantObject,
          `${state.config.dropId}:${input.userId}`
        )
        .notifyExpiry({});

      // Try to promote a backup
      let promotedUser: string | undefined;
      if (state.backupWinners.length > 0 && state.inventory > 0) {
        const next = state.backupWinners.shift();
        if (!next) {
          await ctx.set(STATE_KEY, state);
          await publishDropStateEffect(ctx, state.config.dropId, state);
          return { expired: true };
        }
        promotedUser = next;
        state.winners.push(promotedUser);

        // Notify the promoted backup
        ctx
          .objectSendClient(
            participantObject,
            `${state.config.dropId}:${promotedUser}`
          )
          .notifyPromotion({});

        // Start purchase for the promoted user
        ctx
          .objectSendClient(dropObject, state.config.dropId)
          .startPurchase({ userId: promotedUser });

        console.log(
          `[Drop ${state.config.dropId}] Winner ${input.userId} expired, promoted backup ${promotedUser}. ${state.backupWinners.length} backups remaining.`
        );
      } else {
        console.log(
          `[Drop ${state.config.dropId}] Winner ${input.userId} expired, no backups available.`
        );
      }

      await ctx.set(STATE_KEY, state);

      // Publish update to NATS
      await publishDropStateEffect(ctx, state.config.dropId, state);

      return { expired: true, promoted: promotedUser };
    },

    /**
     * Manually promote next backup winner (admin use)
     */
    promoteBackup: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      success: boolean;
      promotedUser?: string;
      backupsRemaining: number;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state || state.phase !== "purchase") {
        return { success: false, backupsRemaining: 0 };
      }

      if (state.backupWinners.length === 0) {
        return { success: false, backupsRemaining: 0 };
      }

      if (state.inventory <= 0) {
        return { success: false, backupsRemaining: state.backupWinners.length };
      }

      // Promote next backup
      const promotedUser = state.backupWinners.shift();
      if (!promotedUser) {
        return { success: false, backupsRemaining: 0 };
      }
      state.winners.push(promotedUser);

      await ctx.set(STATE_KEY, state);

      // Notify the promoted backup
      ctx
        .objectSendClient(
          participantObject,
          `${state.config.dropId}:${promotedUser}`
        )
        .notifyPromotion({});

      // Start purchase for the promoted user
      ctx
        .objectSendClient(dropObject, state.config.dropId)
        .startPurchase({ userId: promotedUser });

      // Publish update
      await publishDropStateEffect(ctx, state.config.dropId, state);

      console.log(
        `[Drop ${state.config.dropId}] Manually promoted backup ${promotedUser}. ${state.backupWinners.length} backups remaining.`
      );

      return {
        success: true,
        promotedUser,
        backupsRemaining: state.backupWinners.length,
      };
    },

    /**
     * Get lottery proof for public verification
     * Only available after lottery has run
     */
    getLotteryProof: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      available: boolean;
      proof?: LotteryProof;
      commitment?: string;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        return { available: false };
      }

      // Before lottery runs, only return commitment
      if (state.phase === "registration") {
        return {
          available: false,
          commitment: state.config.lotteryCommitment,
        };
      }

      // After lottery, return full proof
      if (state.lotteryProof) {
        return {
          available: true,
          proof: state.lotteryProof,
          commitment: state.config.lotteryCommitment,
        };
      }

      return { available: false };
    },

    /**
     * Get Merkle inclusion proof for a specific user
     * Allows users to independently verify they were included in the lottery
     * Only available after lottery has run
     */
    getInclusionProof: async (
      ctx: restate.ObjectContext,
      input: { userId: string }
    ): Promise<{
      available: boolean;
      proof?: UserInclusionProof;
      error?: string;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        return { available: false, error: "Drop not found" };
      }

      // Before lottery runs, no proofs available
      if (state.phase === "registration") {
        return { available: false, error: "Lottery has not run yet" };
      }

      // Check if we have the data needed to generate proofs
      if (
        !state.participantLeaves ||
        !state.participantLeafHashes ||
        !state.lotteryProof
      ) {
        return { available: false, error: "Proof data not available" };
      }

      // Find the user's leaf
      const leafIndex = state.participantLeaves.findIndex(
        (leaf) => leaf.userId === input.userId
      );

      if (leafIndex === -1) {
        return { available: false, error: "User not found in lottery" };
      }

      // Rebuild Merkle tree to generate proof
      // (We could optimize this by storing the full tree, but it's a trade-off)
      const merkleTree = MerkleTree.fromParticipants(
        state.participantTickets,
        state.participantMultipliers
      );

      const merkleProof = merkleTree.getProofByIndex(leafIndex);
      if (!merkleProof) {
        return { available: false, error: "Failed to generate proof" };
      }

      // Verify the proof server-side before returning
      const verified = verifyMerkleProof(
        merkleProof.leaf,
        merkleProof.proof,
        state.lotteryProof.participantMerkleRoot
      );

      const inclusionProof: UserInclusionProof = {
        leaf: merkleProof.leaf,
        leafHash: merkleProof.leafHash,
        proof: merkleProof.proof,
        merkleRoot: state.lotteryProof.participantMerkleRoot,
        verified,
      };

      return { available: true, proof: inclusionProof };
    },

    /**
     * Get current drop state (public)
     */
    getState: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      phase: Phase;
      inventory: number;
      initialInventory: number;
      participantCount: number;
      totalTickets: number;
      totalEffectiveTickets: number;
      winnerCount: number;
      backupWinnerCount: number;
      registrationEnd: number;
      purchaseEnd?: number;
      ticketPricing: TicketPricing;
      lotteryCommitment?: string;
      // Geo-fence info
      geoFence?: GeoFence;
      geoFenceMode?: GeoFenceMode;
      geoFenceBonusMultiplier?: number;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        // Return default state for uninitialized drops
        return {
          phase: "registration",
          inventory: 0,
          initialInventory: 0,
          participantCount: 0,
          totalTickets: 0,
          totalEffectiveTickets: 0,
          winnerCount: 0,
          backupWinnerCount: 0,
          registrationEnd: 0,
          ticketPricing: getTicketPricing(
            DEFAULT_PRICE_UNIT,
            DEFAULT_MAX_TICKETS
          ),
        };
      }

      return {
        phase: state.phase,
        inventory: state.inventory,
        initialInventory: state.initialInventory ?? state.inventory,
        participantCount: Object.keys(state.participantTickets).length,
        totalTickets: getTotalTickets(state.participantTickets),
        totalEffectiveTickets: getTotalEffectiveTickets(
          state.participantTickets,
          state.participantMultipliers ?? {}
        ),
        winnerCount: state.winners.length,
        backupWinnerCount: state.backupWinners?.length ?? 0,
        registrationEnd: state.config.registrationEnd,
        purchaseEnd: state.purchaseEnd,
        ticketPricing: getTicketPricing(
          state.config.ticketPriceUnit,
          state.config.maxTicketsPerUser
        ),
        lotteryCommitment: state.config.lotteryCommitment,
        // Geo-fence info
        geoFence: state.config.geoFence,
        geoFenceMode: state.config.geoFenceMode,
        geoFenceBonusMultiplier: state.config.geoFenceBonusMultiplier,
      };
    },
  },
});
