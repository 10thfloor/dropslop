import * as restate from "@restatedev/restate-sdk";
import type { ParticipantState } from "../lib/types.js";
import { publishUserState } from "../lib/nats.js";
import { userRolloverObject } from "./user-rollover.js";

// State keys
const STATE_KEY = "state";

// Define the Participant virtual object
export const participantObject = restate.object({
  name: "Participant",
  handlers: {
    /**
     * Notify participant of lottery result
     * If loser with paid entries, automatically grants rollover
     */
    notifyResult: async (
      ctx: restate.ObjectContext,
      input: { isWinner: boolean; position?: number }
    ): Promise<{
      success: boolean;
      status: string;
      rolloverGranted?: number;
    }> => {
      const state = (await ctx.get<ParticipantState>(STATE_KEY)) || {
        status: "registered" as const,
        tickets: 1,
      };

      const [dropId, userId] = ctx.key.split(":");
      let rolloverGranted = 0;

      if (input.isWinner) {
        state.status = "winner";
        state.queuePosition = input.position;
      } else {
        state.status = "loser";

        // Grant rollover for PAID entries only (not free, not rollover used)
        const paidEntries = state.paidEntries || 0;
        if (paidEntries > 0 && userId) {
          // Add rollover to user's global balance
          const result = await ctx
            .objectClient(userRolloverObject, userId)
            .addRollover({ amount: paidEntries });

          rolloverGranted = paidEntries;
          console.log(
            `[Participant ${ctx.key}] Granted ${paidEntries} rollover entries. User balance: ${result.newBalance}`
          );
        }
      }

      await ctx.set(STATE_KEY, state);

      // Get updated rollover balance for SSE event
      let rolloverBalance = 0;
      if (userId) {
        const balanceResult = await ctx
          .objectClient(userRolloverObject, userId)
          .getBalance({});
        rolloverBalance = balanceResult.balance;
      }

      if (dropId && userId) {
        publishUserState(dropId, userId, {
          type: "user",
          status: state.status,
          tickets: state.tickets || 1,
          position: state.queuePosition,
          rolloverUsed: state.rolloverUsed,
          rolloverBalance,
          serverTime: Date.now(),
        });
      }

      return { success: true, status: state.status, rolloverGranted };
    },

    /**
     * Set purchase token for winner
     */
    setToken: async (
      ctx: restate.ObjectContext,
      input: { purchaseToken: string; expiresAt: number }
    ): Promise<{ success: boolean }> => {
      const state = (await ctx.get<ParticipantState>(STATE_KEY)) || {
        status: "registered" as const,
        tickets: 1,
      };

      if (state.status !== "winner") {
        throw new restate.TerminalError(
          "Only winners can receive purchase tokens",
          { errorCode: 403 }
        );
      }

      state.purchaseToken = input.purchaseToken;
      state.expiresAt = input.expiresAt;

      await ctx.set(STATE_KEY, state);

      return { success: true };
    },

    /**
     * Complete purchase - validates token and expiration
     */
    completePurchase: async (
      ctx: restate.ObjectContext,
      input: { purchaseToken: string }
    ): Promise<{ success: boolean; error?: string }> => {
      const state = await ctx.get<ParticipantState>(STATE_KEY);

      if (!state) {
        return { success: false, error: "Participant not found" };
      }

      if (state.status === "purchased") {
        return { success: false, error: "Already purchased" };
      }

      if (state.status !== "winner") {
        return { success: false, error: "Not a winner" };
      }

      // Validate purchase token
      if (state.purchaseToken !== input.purchaseToken) {
        return { success: false, error: "Invalid purchase token" };
      }

      // Check expiration
      if (state.expiresAt && Date.now() > state.expiresAt) {
        return { success: false, error: "Purchase token expired" };
      }

      // Mark as purchased
      state.status = "purchased";
      await ctx.set(STATE_KEY, state);

      const [dropId, userId] = ctx.key.split(":");
      if (dropId && userId) {
        publishUserState(dropId, userId, {
          type: "user",
          status: state.status,
          tickets: state.tickets,
          position: state.queuePosition,
          token: state.purchaseToken,
          serverTime: Date.now(),
        });
      }

      return { success: true };
    },

    /**
     * Mark participant as registered with entry breakdown
     * Tracks total tickets, rollover used, and paid entries
     */
    setRegistered: async (
      ctx: restate.ObjectContext,
      input: {
        position?: number;
        tickets: number;
        rolloverUsed: number;
        paidEntries: number;
      }
    ): Promise<{ success: boolean }> => {
      const state = (await ctx.get<ParticipantState>(STATE_KEY)) || {
        status: "not_registered" as const,
      };

      // Update status if not registered yet
      if (state.status === "not_registered") {
        state.status = "registered";
        if (input.position) {
          state.queuePosition = input.position;
        }
      }

      // Track entry breakdown
      state.tickets = input.tickets;
      state.rolloverUsed = input.rolloverUsed;
      state.paidEntries = input.paidEntries;

      await ctx.set(STATE_KEY, state);

      const [dropId, userId] = ctx.key.split(":");

      // Get rollover balance for SSE
      let rolloverBalance = 0;
      if (userId) {
        const balanceResult = await ctx
          .objectClient(userRolloverObject, userId)
          .getBalance({});
        rolloverBalance = balanceResult.balance;
      }

      if (dropId && userId) {
        publishUserState(dropId, userId, {
          type: "user",
          status: state.status,
          tickets: state.tickets,
          position: state.queuePosition,
          rolloverUsed: state.rolloverUsed,
          rolloverBalance,
          serverTime: Date.now(),
        });
      }

      return { success: true };
    },

    /**
     * Get participant state
     */
    getState: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<ParticipantState & { rolloverBalance?: number }> => {
      const state = await ctx.get<ParticipantState>(STATE_KEY);
      const [, userId] = ctx.key.split(":");

      // Get rollover balance
      let rolloverBalance = 0;
      if (userId) {
        try {
          const balanceResult = await ctx
            .objectClient(userRolloverObject, userId)
            .getBalance({});
          rolloverBalance = balanceResult.balance;
        } catch {
          // User has no rollover state yet
        }
      }

      return state
        ? { ...state, rolloverBalance }
        : { status: "not_registered", tickets: 0, rolloverBalance };
    },
  },
});
