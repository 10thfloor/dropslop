import * as restate from "@restatedev/restate-sdk";
import type { UserRolloverState } from "../lib/types.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const logger = createLogger("user-rollover");

// State keys
const STATE_KEY = "state";

// Use config for max rollover entries
const MAX_ROLLOVER_ENTRIES = config.rollover.maxEntries;

/**
 * Helper to get current time deterministically in Restate context
 */
async function getCurrentTime(ctx: restate.ObjectContext): Promise<number> {
  return ctx.run("get_time", () => Date.now());
}

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
        const now = await getCurrentTime(ctx);
        await ctx.set(STATE_KEY, {
          balance: remaining,
          lastUpdated: now,
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

      const now = await getCurrentTime(ctx);
      await ctx.set(STATE_KEY, {
        balance: newBalance,
        lastUpdated: now,
      });

      logger.info(
        {
          userId: ctx.key,
          amount: input.amount,
          newBalance,
          capped,
          uncappedBalance: capped ? uncappedBalance : undefined,
        },
        "Added rollover entries"
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
      const now = await getCurrentTime(ctx);
      await ctx.set(STATE_KEY, {
        balance: Math.max(0, input.balance),
        lastUpdated: now,
      });

      return { balance: input.balance };
    },
  },
});
