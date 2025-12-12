/**
 * Queue Admission Controller for token-sequencing bot defense
 *
 * Manages the virtual queue that throttles access to registration:
 * - Users join queue and receive a position
 * - Admission controller promotes users from "waiting" to "ready" based on rate + cap
 * - Only "ready" users can proceed to registration
 *
 * This creates a global throttle that:
 * - Forces bots to wait (time = cost)
 * - Limits concurrent registrations
 * - Enables behavioral monitoring during wait
 */

import * as restate from "@restatedev/restate-sdk";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import {
  generateQueueTokenId,
  storeQueueToken,
  getQueueToken,
  updateQueueTokenStatus,
  getNextQueuePosition,
  getFingerprintCount,
  incrementFingerprintCount,
  getIpCount,
  incrementIpCount,
  getReadyCount,
  incrementReadyCount,
  decrementReadyCount,
} from "../lib/nats-kv.js";
import { publishQueueState } from "../lib/nats.js";
import type { QueueToken, QueueTokenStatus } from "../../shared/types.js";

const logger = createLogger("queue-admission");

// State keys
const STATE_KEY = "state";

interface QueueAdmissionState {
  dropId: string;
  /** Queue of token IDs waiting to be admitted (FIFO order) */
  waitingQueue: string[];
  /** Timestamp of last admission tick */
  lastAdmissionTick: number;
  /** Whether admission loop is running */
  admissionLoopActive: boolean;
  /** Total tokens issued */
  totalIssued: number;
  /** Total tokens admitted to ready */
  totalAdmitted: number;
}

/**
 * Helper to get current time deterministically in Restate context
 */
async function getCurrentTime(ctx: restate.ObjectContext): Promise<number> {
  return ctx.run("get_time", () => Date.now());
}

/**
 * Calculate estimated wait time based on queue position and admission rate
 */
function calculateEstimatedWait(
  position: number,
  admissionRate: number,
  maxConcurrent: number
): number {
  if (admissionRate <= 0) return 0;

  // How many can be admitted per second (limited by rate and concurrent cap)
  const effectiveRate = Math.min(admissionRate, maxConcurrent);

  // Estimated seconds until this position is reached
  return Math.ceil(position / effectiveRate);
}

// Define the Queue Admission virtual object
export const queueAdmissionObject = restate.object({
  name: "QueueAdmission",
  handlers: {
    /**
     * Join the queue for a drop
     * Returns queue token and position
     */
    joinQueue: async (
      ctx: restate.ObjectContext,
      input: {
        fingerprint: string;
        ipHash: string;
      }
    ): Promise<{
      success: boolean;
      token?: string;
      position?: number;
      estimatedWaitSeconds?: number;
      status?: QueueTokenStatus;
      error?: string;
    }> => {
      const dropId = ctx.key;

      // Check if queue is enabled
      if (!config.queue.enabled) {
        // Queue disabled - return immediate ready token
        const tokenId = await ctx.run("gen_token", () => generateQueueTokenId());
        const now = await getCurrentTime(ctx);

        const token: QueueToken = {
          token: tokenId,
          dropId,
          fingerprint: input.fingerprint,
          ipHash: input.ipHash,
          position: 0,
          issuedAt: now,
          readyAt: now,
          expiresAt: now + config.queue.readyWindowSeconds * 1000,
          status: "ready",
        };

        await ctx.run("store_token", () => storeQueueToken(token));

        return {
          success: true,
          token: tokenId,
          position: 0,
          estimatedWaitSeconds: 0,
          status: "ready",
        };
      }

      // Check fingerprint limit
      const fingerprintCount = await ctx.run("check_fp", () =>
        getFingerprintCount(dropId, input.fingerprint)
      );

      if (fingerprintCount >= config.queue.maxTokensPerFingerprint) {
        return {
          success: false,
          error: "Maximum queue tokens per device reached",
        };
      }

      // Check IP limit
      const ipCount = await ctx.run("check_ip", () =>
        getIpCount(dropId, input.ipHash)
      );

      if (ipCount >= config.queue.maxTokensPerIP) {
        return {
          success: false,
          error: "Maximum queue tokens per IP reached",
        };
      }

      // Get or initialize state
      let state = await ctx.get<QueueAdmissionState>(STATE_KEY);
      if (!state) {
        state = {
          dropId,
          waitingQueue: [],
          lastAdmissionTick: 0,
          admissionLoopActive: false,
          totalIssued: 0,
          totalAdmitted: 0,
        };
      }

      // Generate token and position
      const tokenId = await ctx.run("gen_token", () => generateQueueTokenId());
      const position = await ctx.run("get_position", () =>
        getNextQueuePosition(dropId)
      );
      const now = await getCurrentTime(ctx);

      // Calculate token expiry (max queue age)
      const maxExpiresAt = now + config.queue.maxQueueAgeMinutes * 60 * 1000;

      const token: QueueToken = {
        token: tokenId,
        dropId,
        fingerprint: input.fingerprint,
        ipHash: input.ipHash,
        position,
        issuedAt: now,
        expiresAt: maxExpiresAt,
        status: "waiting",
      };

      // Store token and increment counters
      await ctx.run("store_token", () => storeQueueToken(token));
      await ctx.run("inc_fp", () =>
        incrementFingerprintCount(dropId, input.fingerprint)
      );
      await ctx.run("inc_ip", () => incrementIpCount(dropId, input.ipHash));

      // Add to waiting queue
      state.waitingQueue.push(tokenId);
      state.totalIssued++;
      await ctx.set(STATE_KEY, state);

      // Start admission loop if not already running
      if (!state.admissionLoopActive) {
        ctx.objectSendClient(queueAdmissionObject, dropId).startAdmissionLoop(
          {}
        );
      }

      const estimatedWait = calculateEstimatedWait(
        state.waitingQueue.length,
        config.queue.admissionRatePerSecond,
        config.queue.maxConcurrentReady
      );

      logger.info(
        {
          dropId,
          tokenId,
          position,
          queueLength: state.waitingQueue.length,
          estimatedWait,
        },
        "User joined queue"
      );

      return {
        success: true,
        token: tokenId,
        position,
        estimatedWaitSeconds: estimatedWait,
        status: "waiting",
      };
    },

    /**
     * Start the admission loop (called internally)
     * Promotes waiting users to ready based on rate + concurrent cap
     */
    startAdmissionLoop: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{ started: boolean }> => {
      const dropId = ctx.key;
      const state = await ctx.get<QueueAdmissionState>(STATE_KEY);

      if (!state) {
        return { started: false };
      }

      if (state.admissionLoopActive) {
        return { started: true };
      }

      state.admissionLoopActive = true;
      await ctx.set(STATE_KEY, state);

      // Schedule first admission tick
      ctx
        .objectSendClient(queueAdmissionObject, dropId, {
          delay: config.queue.admissionTickMs,
        })
        .admitNextBatch({});

      logger.info({ dropId }, "Admission loop started");

      return { started: true };
    },

    /**
     * Admit next batch of users (called periodically)
     * Promotes waiting → ready based on rate and concurrent cap
     */
    admitNextBatch: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      admitted: number;
      remaining: number;
      currentReady: number;
    }> => {
      const dropId = ctx.key;
      const state = await ctx.get<QueueAdmissionState>(STATE_KEY);

      if (!state) {
        return { admitted: 0, remaining: 0, currentReady: 0 };
      }

      const now = await getCurrentTime(ctx);

      // Get current ready count
      const currentReady = await ctx.run("get_ready", () =>
        getReadyCount(dropId)
      );

      // Calculate how many to admit this tick
      const slotsAvailable = Math.max(
        0,
        config.queue.maxConcurrentReady - currentReady
      );

      // Rate-based: admit up to admissionRatePerSecond per tick
      // (tick interval is admissionTickMs, typically 1000ms)
      const rateBasedLimit = Math.ceil(
        config.queue.admissionRatePerSecond *
          (config.queue.admissionTickMs / 1000)
      );

      const toAdmit = Math.min(
        slotsAvailable,
        rateBasedLimit,
        state.waitingQueue.length
      );

      let admitted = 0;

      for (let i = 0; i < toAdmit; i++) {
        const tokenId = state.waitingQueue.shift();
        if (!tokenId) break;

        // Update token status to ready
        const readyExpiresAt = now + config.queue.readyWindowSeconds * 1000;
        const updatedToken = await ctx.run(`mark_ready_${i}`, () =>
          updateQueueTokenStatus(dropId, tokenId, "ready", now, readyExpiresAt)
        );

        if (updatedToken) {
          await ctx.run(`inc_ready_${i}`, () => incrementReadyCount(dropId));

          // Publish SSE event for this user
          await ctx.run(`publish_ready_${i}`, () =>
            publishQueueState(dropId, tokenId, {
              type: "queue_ready",
              token: tokenId,
              expiresAt: readyExpiresAt,
            })
          );

          admitted++;
          state.totalAdmitted++;

          logger.debug(
            {
              dropId,
              tokenId,
              expiresAt: readyExpiresAt,
            },
            "User admitted to ready"
          );
        }
      }

      state.lastAdmissionTick = now;
      await ctx.set(STATE_KEY, state);

      // Continue loop if there are still waiting users
      if (state.waitingQueue.length > 0) {
        ctx
          .objectSendClient(queueAdmissionObject, dropId, {
            delay: config.queue.admissionTickMs,
          })
          .admitNextBatch({});
      } else {
        // Stop the loop
        state.admissionLoopActive = false;
        await ctx.set(STATE_KEY, state);
        logger.info({ dropId }, "Admission loop stopped - queue empty");
      }

      // Publish position updates to remaining users
      for (let i = 0; i < Math.min(state.waitingQueue.length, 100); i++) {
        const tokenId = state.waitingQueue[i];
        const newPosition = i + 1;
        const estimatedWait = calculateEstimatedWait(
          newPosition,
          config.queue.admissionRatePerSecond,
          config.queue.maxConcurrentReady
        );

        await ctx.run(`publish_pos_${i}`, () =>
          publishQueueState(dropId, tokenId, {
            type: "queue_position",
            position: newPosition,
            estimatedWaitSeconds: estimatedWait,
            aheadOfYou: newPosition - 1,
            totalInQueue: state.waitingQueue.length,
          })
        );
      }

      return {
        admitted,
        remaining: state.waitingQueue.length,
        currentReady: currentReady + admitted,
      };
    },

    /**
     * Get queue statistics
     */
    getQueueStats: async (
      ctx: restate.ObjectContext,
      _input: Record<string, never>
    ): Promise<{
      waitingCount: number;
      readyCount: number;
      totalIssued: number;
      totalAdmitted: number;
      admissionLoopActive: boolean;
    }> => {
      const dropId = ctx.key;
      const state = await ctx.get<QueueAdmissionState>(STATE_KEY);

      if (!state) {
        return {
          waitingCount: 0,
          readyCount: 0,
          totalIssued: 0,
          totalAdmitted: 0,
          admissionLoopActive: false,
        };
      }

      const readyCount = await ctx.run("get_ready", () =>
        getReadyCount(dropId)
      );

      return {
        waitingCount: state.waitingQueue.length,
        readyCount,
        totalIssued: state.totalIssued,
        totalAdmitted: state.totalAdmitted,
        admissionLoopActive: state.admissionLoopActive,
      };
    },

    /**
     * Check token status and position
     */
    checkToken: async (
      ctx: restate.ObjectContext,
      input: { tokenId: string }
    ): Promise<{
      found: boolean;
      status?: QueueTokenStatus;
      position?: number;
      estimatedWaitSeconds?: number;
      expiresAt?: number;
      readyAt?: number;
    }> => {
      const dropId = ctx.key;

      const token = await ctx.run("get_token", () =>
        getQueueToken(dropId, input.tokenId)
      );

      if (!token) {
        return { found: false };
      }

      // Get current position in queue if waiting
      let position: number | undefined;
      let estimatedWait: number | undefined;

      if (token.status === "waiting") {
        const state = await ctx.get<QueueAdmissionState>(STATE_KEY);
        if (state) {
          const idx = state.waitingQueue.indexOf(input.tokenId);
          if (idx >= 0) {
            position = idx + 1;
            estimatedWait = calculateEstimatedWait(
              position,
              config.queue.admissionRatePerSecond,
              config.queue.maxConcurrentReady
            );
          }
        }
      }

      return {
        found: true,
        status: token.status,
        position,
        estimatedWaitSeconds: estimatedWait,
        expiresAt: token.expiresAt,
        readyAt: token.readyAt,
      };
    },

    /**
     * Mark token as used (called after registration completes)
     * Decrements ready count
     */
    markTokenUsed: async (
      ctx: restate.ObjectContext,
      input: { tokenId: string }
    ): Promise<{ success: boolean }> => {
      const dropId = ctx.key;

      const token = await ctx.run("get_token", () =>
        getQueueToken(dropId, input.tokenId)
      );

      if (!token || token.status !== "ready") {
        return { success: false };
      }

      await ctx.run("update_status", () =>
        updateQueueTokenStatus(dropId, input.tokenId, "used")
      );

      await ctx.run("dec_ready", () => decrementReadyCount(dropId));

      logger.info({ dropId, tokenId: input.tokenId }, "Token marked as used");

      return { success: true };
    },

    /**
     * Mark token as expired (called when ready window expires)
     * Decrements ready count
     */
    markTokenExpired: async (
      ctx: restate.ObjectContext,
      input: { tokenId: string }
    ): Promise<{ success: boolean }> => {
      const dropId = ctx.key;

      const token = await ctx.run("get_token", () =>
        getQueueToken(dropId, input.tokenId)
      );

      if (!token || token.status !== "ready") {
        return { success: false };
      }

      await ctx.run("update_status", () =>
        updateQueueTokenStatus(dropId, input.tokenId, "expired")
      );

      await ctx.run("dec_ready", () => decrementReadyCount(dropId));

      // Publish expiry event
      await ctx.run("publish_expired", () =>
        publishQueueState(dropId, input.tokenId, {
          type: "queue_expired",
          token: input.tokenId,
        })
      );

      logger.info({ dropId, tokenId: input.tokenId }, "Token marked as expired");

      return { success: true };
    },
  },
});

