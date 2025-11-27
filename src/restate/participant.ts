import * as restate from "@restatedev/restate-sdk";
import type { ParticipantState, LoyaltyTier } from "../lib/types.js";
import { publishUserState } from "../lib/nats.js";
import { userRolloverObject } from "./user-rollover.js";
import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const logger = createLogger("participant");

// State keys
const STATE_KEY = "state";

// Rollover percent for expired winners
const EXPIRED_WINNER_ROLLOVER_PERCENT = config.rollover.expiredWinnerPercent;

/**
 * Helper to get current time deterministically in Restate context
 */
async function getCurrentTime(ctx: restate.ObjectContext): Promise<number> {
  return ctx.run("get_time", () => Date.now());
}

/**
 * Helper to publish user state as a side effect
 * Wrapped in ctx.run() to ensure idempotent execution during replay
 */
async function publishUserStateEffect(
  ctx: restate.ObjectContext,
  dropId: string,
  userId: string,
  state: ParticipantState,
  extra?: {
    rolloverBalance?: number;
    promoted?: boolean;
  }
): Promise<void> {
  // Map "not_registered" to undefined for SSE (SSE only supports registered states)
  const sseStatus =
    state.status === "not_registered" ? undefined : state.status;

  await ctx.run("publish_user_state", async () => {
    publishUserState(dropId, userId, {
      type: "user",
      status: sseStatus,
      tickets: state.tickets || 1,
      effectiveTickets: state.effectiveTickets,
      position: state.queuePosition,
      rolloverUsed: state.rolloverUsed,
      rolloverBalance: extra?.rolloverBalance,
      token: state.purchaseToken,
      serverTime: Date.now(),
      // Backup winner info
      backupPosition: state.backupPosition,
      promoted: extra?.promoted,
      // Loyalty info
      loyaltyTier: state.loyaltyTier,
      loyaltyMultiplier: state.loyaltyMultiplier,
    });
  });
}

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
          logger.info(
            {
              participantKey: ctx.key,
              paidEntries,
              newBalance: result.newBalance,
            },
            "Granted rollover entries"
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
        await publishUserStateEffect(ctx, dropId, userId, state, {
          rolloverBalance,
        });
      }

      return { success: true, status: state.status, rolloverGranted };
    },

    /**
     * Set purchase token for winner
     * Publishes via SSE so the user can see and save their token
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

      // Publish via SSE so user can see and save their token
      const [dropId, userId] = ctx.key.split(":");
      if (dropId && userId) {
        await publishUserStateEffect(ctx, dropId, userId, state);
      }

      return { success: true };
    },

    /**
     * Complete purchase - validates token cryptographically
     * Token is self-verifying via HMAC, works even if state was lost
     */
    completePurchase: async (
      ctx: restate.ObjectContext,
      input: { purchaseToken: string }
    ): Promise<{ success: boolean; error?: string }> => {
      const state = await ctx.get<ParticipantState>(STATE_KEY);
      const [dropId, userId] = ctx.key.split(":");

      if (!dropId || !userId) {
        return { success: false, error: "Invalid participant key" };
      }

      // Check if already purchased
      if (state?.status === "purchased") {
        return { success: false, error: "Already purchased" };
      }

      // Must be a winner (either from state or we trust the signed token)
      if (state && state.status !== "winner") {
        return { success: false, error: "Not a winner" };
      }

      // Cryptographically verify the token (self-verifying, no stored state needed)
      // This allows recovery even if Restate state was lost
      const { validatePurchaseToken } = await import(
        "../lib/purchase-token.js"
      );
      const now = await getCurrentTime(ctx);
      const validation = validatePurchaseToken(
        input.purchaseToken,
        dropId,
        userId,
        now
      );

      if (!validation.valid) {
        return { success: false, error: validation.error || "Invalid token" };
      }

      // Mark as purchased
      const updatedState: ParticipantState = state || {
        status: "purchased",
        tickets: 1,
      };
      updatedState.status = "purchased";
      await ctx.set(STATE_KEY, updatedState);

      await publishUserStateEffect(ctx, dropId, userId, updatedState);

      return { success: true };
    },

    /**
     * Mark participant as registered with entry breakdown
     * Tracks total tickets, rollover used, paid entries, and loyalty info
     */
    setRegistered: async (
      ctx: restate.ObjectContext,
      input: {
        position?: number;
        tickets: number;
        effectiveTickets?: number;
        rolloverUsed: number;
        paidEntries: number;
        loyaltyTier?: LoyaltyTier;
        loyaltyMultiplier?: number;
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
      state.effectiveTickets = input.effectiveTickets;
      state.rolloverUsed = input.rolloverUsed;
      state.paidEntries = input.paidEntries;
      
      // Track loyalty info at time of registration
      state.loyaltyTier = input.loyaltyTier;
      state.loyaltyMultiplier = input.loyaltyMultiplier;

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
        await publishUserStateEffect(ctx, dropId, userId, state, {
          rolloverBalance,
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

    /**
     * Notify participant they are a backup winner
     * They will be promoted if a primary winner doesn't purchase
     */
    notifyBackup: async (
      ctx: restate.ObjectContext,
      input: { backupPosition: number; totalBackups: number }
    ): Promise<{ success: boolean }> => {
      const state = (await ctx.get<ParticipantState>(STATE_KEY)) || {
        status: "registered" as const,
        tickets: 1,
      };

      state.status = "backup_winner";
      state.backupPosition = input.backupPosition;

      await ctx.set(STATE_KEY, state);

      const [dropId, userId] = ctx.key.split(":");

      logger.info(
        {
          participantKey: ctx.key,
          backupPosition: input.backupPosition,
          totalBackups: input.totalBackups,
        },
        "Notified as backup winner"
      );

      if (dropId && userId) {
        await publishUserStateEffect(ctx, dropId, userId, state);
      }

      return { success: true };
    },

    /**
     * Notify backup winner they have been promoted to winner
     * Called when a primary winner expires without purchasing
     */
    notifyPromotion: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ success: boolean }> => {
      const state = await ctx.get<ParticipantState>(STATE_KEY);

      if (!state || state.status !== "backup_winner") {
        return { success: false };
      }

      state.status = "winner";
      // Clear backup position since they're now a real winner
      state.backupPosition = undefined;

      await ctx.set(STATE_KEY, state);

      const [dropId, userId] = ctx.key.split(":");

      logger.info(
        {
          participantKey: ctx.key,
        },
        "Backup promoted to winner"
      );

      if (dropId && userId) {
        await publishUserStateEffect(ctx, dropId, userId, state, {
          promoted: true,
        });
      }

      return { success: true };
    },

    /**
     * Notify winner their purchase window has expired
     * Grants partial rollover (50% of paid entries)
     */
    notifyExpiry: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ success: boolean; rolloverGranted: number }> => {
      const state = await ctx.get<ParticipantState>(STATE_KEY);

      if (!state || state.status !== "winner") {
        return { success: false, rolloverGranted: 0 };
      }

      state.status = "expired";
      await ctx.set(STATE_KEY, state);

      const [dropId, userId] = ctx.key.split(":");
      let rolloverGranted = 0;

      // Grant partial rollover for paid entries (50%)
      const paidEntries = state.paidEntries || 0;
      if (paidEntries > 0 && userId) {
        const rolloverAmount = Math.floor(paidEntries * EXPIRED_WINNER_ROLLOVER_PERCENT);
        if (rolloverAmount > 0) {
          const result = await ctx
            .objectClient(userRolloverObject, userId)
            .addRollover({ amount: rolloverAmount });

          rolloverGranted = rolloverAmount;
          logger.info(
            {
              participantKey: ctx.key,
              paidEntries,
              rolloverGranted,
              newBalance: result.newBalance,
            },
            "Expired winner granted partial rollover"
          );
        }
      }

      // Get updated rollover balance for SSE
      let rolloverBalance = 0;
      if (userId) {
        const balanceResult = await ctx
          .objectClient(userRolloverObject, userId)
          .getBalance({});
        rolloverBalance = balanceResult.balance;
      }

      if (dropId && userId) {
        await publishUserStateEffect(ctx, dropId, userId, state, {
          rolloverBalance,
        });
      }

      return { success: true, rolloverGranted };
    },
  },
});
