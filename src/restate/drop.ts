import * as restate from "@restatedev/restate-sdk";
import type {
  DropState,
  DropConfig,
  Phase,
  RegisterRequest,
  TicketPricing,
} from "../lib/types.js";
import {
  selectWinnersWeighted,
  generateLotterySeed,
  getTotalTickets,
  getTicketPricing,
} from "../lib/lottery.js";
import { publishDropState } from "../lib/nats.js";
import { userRolloverObject } from "./user-rollover.js";

// State keys
const STATE_KEY = "state";

// Default ticket config
const DEFAULT_PRICE_UNIT = 1.0;
const DEFAULT_MAX_TICKETS = 10;

// Define the Drop virtual object
export const dropObject = restate.object({
  name: "Drop",
  handlers: {
    /**
     * Initialize a new drop with configuration
     * Automatically schedules lottery to run when registration ends
     */
    initialize: async (
      ctx: restate.ObjectContext,
      config: DropConfig
    ): Promise<{ success: boolean; dropId: string }> => {
      const existing = await ctx.get<DropState>(STATE_KEY);

      if (existing) {
        return { success: true, dropId: config.dropId };
      }

      // Apply defaults for ticket pricing
      const fullConfig: DropConfig = {
        ...config,
        ticketPriceUnit: config.ticketPriceUnit ?? DEFAULT_PRICE_UNIT,
        maxTicketsPerUser: config.maxTicketsPerUser ?? DEFAULT_MAX_TICKETS,
      };

      const state: DropState = {
        phase: "registration",
        inventory: config.inventory,
        participantTickets: {},
        winners: [],
        config: fullConfig,
      };

      await ctx.set(STATE_KEY, state);

      // Schedule the lottery to run automatically when registration ends
      const now = Date.now();
      const delayMs = Math.max(0, fullConfig.registrationEnd - now);

      if (delayMs > 0) {
        // Schedule lottery using delayed send (fire-and-forget)
        ctx
          .objectSendClient(dropObject, config.dropId, { delay: delayMs })
          .runLottery({});

        console.log(
          `[Drop ${config.dropId}] Lottery scheduled in ${Math.round(
            delayMs / 1000
          )}s`
        );
      }

      return { success: true, dropId: config.dropId };
    },

    /**
     * Register a participant for the drop (with ticket count)
     * Automatically applies rollover entries, then free entry, then paid entries
     *
     * Entry breakdown:
     * - Rollover entries (from previous losses, consumed from global balance)
     * - 1 Free entry (if not fully covered by rollover)
     * - Paid entries (remaining after rollover + free)
     */
    register: async (
      ctx: restate.ObjectContext,
      request: RegisterRequest
    ): Promise<{
      success: boolean;
      participantCount: number;
      totalTickets: number;
      userTickets: number;
      position: number;
      rolloverUsed: number;
      paidEntries: number;
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

      const now = Date.now();
      if (
        now < state.config.registrationStart ||
        now >= state.config.registrationEnd
      ) {
        throw new restate.TerminalError("Registration window closed", {
          errorCode: 409,
        });
      }

      // Validate ticket count
      const desiredTickets = Math.max(
        1,
        Math.min(request.tickets || 1, state.config.maxTicketsPerUser)
      );

      const existingTickets = state.participantTickets[request.userId] || 0;
      const isNewRegistration = existingTickets === 0;

      // Only allow new registrations (no upgrades for now to simplify rollover logic)
      if (!isNewRegistration) {
        throw new restate.TerminalError("Already registered for this drop", {
          errorCode: 409,
        });
      }

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
      state.participantTickets[request.userId] = actualTickets;
      await ctx.set(STATE_KEY, state);

      // Update participant state with entry breakdown
      const participantCount = Object.keys(state.participantTickets).length;
      ctx
        .objectSendClient(
          participantObject,
          `${state.config.dropId}:${request.userId}`
        )
        .setRegistered({
          position: participantCount,
          tickets: actualTickets,
          rolloverUsed,
          paidEntries,
        });

      const totalTickets = getTotalTickets(state.participantTickets);

      // Publish update to NATS (fire-and-forget, don't await in critical path)
      publishDropState(state.config.dropId, {
        type: "drop",
        phase: state.phase,
        participantCount,
        totalTickets,
        inventory: state.inventory,
        registrationEnd: state.config.registrationEnd,
        serverTime: Date.now(),
      });

      console.log(
        `[Drop ${state.config.dropId}] User ${request.userId} registered: ${actualTickets} total (${rolloverUsed} rollover, ${freeEntry} free, ${paidEntries} paid)`
      );

      return {
        success: true,
        participantCount,
        totalTickets,
        userTickets: actualTickets,
        position: participantCount,
        rolloverUsed,
        paidEntries,
      };
    },

    /**
     * Run the lottery to select winners (weighted by tickets)
     */
    runLottery: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      success: boolean;
      winners: string[];
      participantCount: number;
      totalTickets: number;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        throw new restate.TerminalError("Drop not initialized", {
          errorCode: 404,
        });
      }

      const participantCount = Object.keys(state.participantTickets).length;
      const totalTickets = getTotalTickets(state.participantTickets);

      if (state.phase !== "registration") {
        // Already ran lottery
        return {
          success: true,
          winners: state.winners,
          participantCount,
          totalTickets,
        };
      }

      state.phase = "lottery";

      // Select winners using weighted selection
      const seed = generateLotterySeed(state);
      const winners = selectWinnersWeighted(
        state.participantTickets,
        Math.min(state.inventory, participantCount),
        seed
      );

      state.winners = winners;
      state.phase = "purchase";
      // Calculate purchase window end time
      state.purchaseEnd = Date.now() + state.config.purchaseWindow * 1000;
      await ctx.set(STATE_KEY, state);

      // Publish update to NATS
      publishDropState(state.config.dropId, {
        type: "drop",
        phase: state.phase,
        participantCount,
        totalTickets,
        inventory: state.inventory,
        registrationEnd: state.config.registrationEnd,
        purchaseEnd: state.purchaseEnd,
        serverTime: Date.now(),
      });

      // Notify all participants
      for (const userId of Object.keys(state.participantTickets)) {
        const isWinner = winners.includes(userId);
        ctx
          .objectSendClient(
            participantObject,
            `${state.config.dropId}:${userId}`
          )
          .notifyResult({
            isWinner,
            position: isWinner ? winners.indexOf(userId) + 1 : undefined,
          });
      }

      // Schedule purchase window closure
      const purchaseWindowMs = state.config.purchaseWindow * 1000;
      ctx
        .objectSendClient(dropObject, state.config.dropId, {
          delay: purchaseWindowMs,
        })
        .closePurchaseWindow({});

      console.log(
        `[Drop ${state.config.dropId}] Purchase window will close in ${state.config.purchaseWindow}s`
      );

      return {
        success: true,
        winners: state.winners,
        participantCount,
        totalTickets,
      };
    },

    /**
     * Start purchase phase for a winner (generates token)
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

      // Generate purchase token with timestamp
      const timestamp = Date.now();
      const purchaseToken = `${state.config.dropId}:${input.userId}:${timestamp}`;
      const expiresAt = timestamp + state.config.purchaseWindow * 1000;

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

      // Publish update to NATS
      publishDropState(state.config.dropId, {
        type: "drop",
        phase: state.phase,
        participantCount: Object.keys(state.participantTickets).length,
        totalTickets: getTotalTickets(state.participantTickets),
        inventory: state.inventory,
        registrationEnd: state.config.registrationEnd,
        serverTime: Date.now(),
      });

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

      const participantCount = Object.keys(state.participantTickets).length;
      const totalTickets = getTotalTickets(state.participantTickets);

      // Publish update to NATS
      publishDropState(state.config.dropId, {
        type: "drop",
        phase: state.phase,
        participantCount,
        totalTickets,
        inventory: state.inventory,
        registrationEnd: state.config.registrationEnd,
        serverTime: Date.now(),
      });

      console.log(
        `[Drop ${state.config.dropId}] Purchase window closed. Final inventory: ${state.inventory}`
      );

      return {
        success: true,
        phase: state.phase,
      };
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
      participantCount: number;
      totalTickets: number;
      winnerCount: number;
      registrationEnd: number;
      purchaseEnd?: number;
      ticketPricing: TicketPricing;
    }> => {
      const state = await ctx.get<DropState>(STATE_KEY);

      if (!state) {
        // Return default state for uninitialized drops
        return {
          phase: "registration",
          inventory: 0,
          participantCount: 0,
          totalTickets: 0,
          winnerCount: 0,
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
        participantCount: Object.keys(state.participantTickets).length,
        totalTickets: getTotalTickets(state.participantTickets),
        winnerCount: state.winners.length,
        registrationEnd: state.config.registrationEnd,
        purchaseEnd: state.purchaseEnd,
        ticketPricing: getTicketPricing(
          state.config.ticketPriceUnit,
          state.config.maxTicketsPerUser
        ),
      };
    },
  },
});

// Import participant object for cross-object calls
import { participantObject } from "./participant.js";
