import * as restate from "@restatedev/restate-sdk";
import type { UserLoyaltyState, LoyaltyTier } from "../lib/types.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const logger = createLogger("user-loyalty");

// State keys
const STATE_KEY = "state";

// Get tier thresholds from config
const TIER_CONFIG = config.loyalty.tiers;
const STREAK_BONUS = config.loyalty.streakBonus;
const STREAK_THRESHOLD = config.loyalty.streakThreshold;
const MAX_MULTIPLIER = config.loyalty.maxMultiplier;

/**
 * Helper to get current time deterministically in Restate context
 */
async function getCurrentTime(ctx: restate.ObjectContext): Promise<number> {
  return ctx.run("get_time", () => Date.now());
}

/**
 * Calculate loyalty tier based on number of drops participated
 */
function calculateTier(dropsCount: number): LoyaltyTier {
  if (dropsCount >= TIER_CONFIG.gold.minDrops) {
    return "gold";
  } else if (dropsCount >= TIER_CONFIG.silver.minDrops) {
    return "silver";
  }
  return "bronze";
}

/**
 * Calculate multiplier based on tier and streak
 */
function calculateMultiplier(tier: LoyaltyTier, streak: number): number {
  // Base multiplier from tier
  let multiplier = TIER_CONFIG[tier].multiplier;

  // Add streak bonus if threshold met
  if (streak >= STREAK_THRESHOLD) {
    multiplier += STREAK_BONUS;
  }

  // Cap at max multiplier
  return Math.min(multiplier, MAX_MULTIPLIER);
}

/**
 * UserLoyalty virtual object - tracks participation history per user
 * Keyed by userId (not dropId:userId) so history persists across drops
 */
export const userLoyaltyObject = restate.object({
  name: "UserLoyalty",
  handlers: {
    /**
     * Get current multiplier for a user
     * Called during registration to determine effective tickets
     */
    getMultiplier: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      multiplier: number;
      tier: LoyaltyTier;
      streak: number;
      dropsParticipated: number;
    }> => {
      const state = await ctx.get<UserLoyaltyState>(STATE_KEY);

      if (!state) {
        // New user - bronze tier, no multiplier bonus
        return {
          multiplier: TIER_CONFIG.bronze.multiplier,
          tier: "bronze",
          streak: 0,
          dropsParticipated: 0,
        };
      }

      return {
        multiplier: state.multiplier,
        tier: state.tier,
        streak: state.currentStreak,
        dropsParticipated: state.dropsParticipated.length,
      };
    },

    /**
     * Record participation in a drop
     * Called after lottery runs for all participants
     */
    recordParticipation: async (
      ctx: restate.ObjectContext,
      input: { dropId: string }
    ): Promise<{
      tier: LoyaltyTier;
      multiplier: number;
      streak: number;
      dropsParticipated: number;
    }> => {
      const state = await ctx.get<UserLoyaltyState>(STATE_KEY);
      const now = await getCurrentTime(ctx);

      // Initialize or update state
      const dropsParticipated = state?.dropsParticipated || [];
      const lastParticipationDate = state?.lastParticipationDate || 0;
      let currentStreak = state?.currentStreak || 0;

      // Check if already recorded for this drop
      if (dropsParticipated.includes(input.dropId)) {
        return {
          tier: state?.tier || "bronze",
          multiplier: state?.multiplier || 1.0,
          streak: currentStreak,
          dropsParticipated: dropsParticipated.length,
        };
      }

      // Add this drop to history
      dropsParticipated.push(input.dropId);

      // Update streak logic
      // For simplicity, we increment streak for each participation
      // In a more sophisticated system, you might track drop dates and check for gaps
      currentStreak += 1;

      // Calculate new tier and multiplier
      const tier = calculateTier(dropsParticipated.length);
      const multiplier = calculateMultiplier(tier, currentStreak);

      // Save updated state
      const newState: UserLoyaltyState = {
        dropsParticipated,
        lastParticipationDate: now,
        currentStreak,
        tier,
        multiplier,
      };
      await ctx.set(STATE_KEY, newState);

      logger.info(
        {
          userId: ctx.key,
          dropId: input.dropId,
          tier,
          multiplier,
          streak: currentStreak,
          totalDrops: dropsParticipated.length,
        },
        "Recorded participation"
      );

      return {
        tier,
        multiplier,
        streak: currentStreak,
        dropsParticipated: dropsParticipated.length,
      };
    },

    /**
     * Get full loyalty stats for a user
     */
    getStats: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<UserLoyaltyState | null> => {
      return await ctx.get<UserLoyaltyState>(STATE_KEY);
    },

    /**
     * Reset streak (e.g., if user misses drops)
     * Could be called by a scheduled job that checks for inactivity
     */
    resetStreak: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ success: boolean; newStreak: number }> => {
      const state = await ctx.get<UserLoyaltyState>(STATE_KEY);

      if (!state) {
        return { success: false, newStreak: 0 };
      }

      // Reset streak but keep tier based on total participation
      const tier = calculateTier(state.dropsParticipated.length);
      const multiplier = calculateMultiplier(tier, 0); // No streak bonus

      const now = await getCurrentTime(ctx);
      const newState: UserLoyaltyState = {
        ...state,
        currentStreak: 0,
        tier,
        multiplier,
        lastParticipationDate: now,
      };
      await ctx.set(STATE_KEY, newState);

      logger.info(
        {
          userId: ctx.key,
          tier,
          multiplier,
        },
        "Reset streak"
      );

      return { success: true, newStreak: 0 };
    },

    /**
     * Set loyalty state directly (for admin/testing)
     */
    setState: async (
      ctx: restate.ObjectContext,
      input: Partial<UserLoyaltyState>
    ): Promise<UserLoyaltyState> => {
      const state = await ctx.get<UserLoyaltyState>(STATE_KEY);
      const now = await getCurrentTime(ctx);

      const dropsParticipated =
        input.dropsParticipated || state?.dropsParticipated || [];
      const currentStreak =
        input.currentStreak ?? state?.currentStreak ?? 0;
      const tier = input.tier || calculateTier(dropsParticipated.length);
      const multiplier =
        input.multiplier || calculateMultiplier(tier, currentStreak);

      const newState: UserLoyaltyState = {
        dropsParticipated,
        lastParticipationDate: input.lastParticipationDate || now,
        currentStreak,
        tier,
        multiplier,
      };

      await ctx.set(STATE_KEY, newState);

      return newState;
    },
  },
});

