import * as restate from "@restatedev/restate-sdk";
import type { UserRolloverState } from "../lib/types.js";

// State keys
const STATE_KEY = "state";

// Maximum rollover entries a user can accumulate
export const MAX_ROLLOVER_ENTRIES = 10;

/**
 * UserRollover virtual object - tracks global rollover balance per user
 * Keyed by userId (not dropId:userId) so balance persists across drops
 */
export const userRolloverObject = restate.object({
  name: "UserRollover",
  handlers: {
    /**
     * Get current rollover balance for a user
     */
    getBalance: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ balance: number }> => {
      const state = await ctx.get<UserRolloverState>(STATE_KEY);
      return { balance: state?.balance || 0 };
    },

    /**
     * Consume rollover entries (called during registration)
     * Returns the actual amount consumed (may be less if balance insufficient)
     */
    consumeRollover: async (
      ctx: restate.ObjectContext,
      input: { amount: number }
    ): Promise<{ consumed: number; remaining: number }> => {
      const state = await ctx.get<UserRolloverState>(STATE_KEY);
      const currentBalance = state?.balance || 0;

      // Can't consume more than available
      const consumed = Math.min(input.amount, currentBalance);
      const remaining = currentBalance - consumed;

      if (consumed > 0) {
        await ctx.set(STATE_KEY, {
          balance: remaining,
          lastUpdated: Date.now(),
        });
      }

      return { consumed, remaining };
    },

    /**
     * Add rollover entries (called when user loses with paid entries)
     * Only paid entries generate rollover, not free or rollover entries
     * Capped at MAX_ROLLOVER_ENTRIES
     */
    addRollover: async (
      ctx: restate.ObjectContext,
      input: { amount: number }
    ): Promise<{ newBalance: number; capped: boolean }> => {
      if (input.amount <= 0) {
        const state = await ctx.get<UserRolloverState>(STATE_KEY);
        return { newBalance: state?.balance || 0, capped: false };
      }

      const state = await ctx.get<UserRolloverState>(STATE_KEY);
      const currentBalance = state?.balance || 0;
      
      // Cap at max rollover entries
      const uncappedBalance = currentBalance + input.amount;
      const newBalance = Math.min(uncappedBalance, MAX_ROLLOVER_ENTRIES);
      const capped = uncappedBalance > MAX_ROLLOVER_ENTRIES;

      await ctx.set(STATE_KEY, {
        balance: newBalance,
        lastUpdated: Date.now(),
      });

      console.log(
        `[UserRollover ${ctx.key}] Added ${input.amount} rollover entries. New balance: ${newBalance}${capped ? ` (capped from ${uncappedBalance})` : ""}`
      );

      return { newBalance, capped };
    },

    /**
     * Set rollover balance directly (for admin/testing)
     */
    setBalance: async (
      ctx: restate.ObjectContext,
      input: { balance: number }
    ): Promise<{ balance: number }> => {
      await ctx.set(STATE_KEY, {
        balance: Math.max(0, input.balance),
        lastUpdated: Date.now(),
      });

      return { balance: input.balance };
    },
  },
});
