/**
 * Proof-of-Work challenge generation and verification
 * Uses shared config for settings
 */

import crypto from "node:crypto";
import type { PowChallenge } from "./types.js";
import { storeChallenge, getAndDeleteChallenge } from "./nats-kv.js";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const logger = createLogger("pow");

/**
 * Generate a proof-of-work challenge
 * Challenges are stored in NATS KV with auto-expiry
 */
export async function generateChallenge(): Promise<PowChallenge> {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const challenge = `${timestamp}:${random}`;

  const powChallenge: PowChallenge = {
    challenge,
    difficulty: config.pow.difficulty,
    timestamp,
  };

  // Store challenge in NATS KV (auto-expires based on config)
  await storeChallenge(powChallenge);

  return powChallenge;
}

/**
 * Verify a SHA-256 proof-of-work solution
 * Must match the client-side algorithm exactly
 *
 * Note: Challenge expiry is handled by KV TTL - if the challenge exists,
 * it's still valid. We only need to verify the solution and ensure one-time use.
 */
export async function verifyPow(
  challenge: string,
  solution: string,
  difficulty: number = config.pow.difficulty
): Promise<boolean> {
  try {
    // Get and delete challenge from NATS KV (one-time use)
    // If challenge doesn't exist, it either expired (TTL) or was already used
    const storedChallenge = await getAndDeleteChallenge(challenge);

    if (!storedChallenge) {
      logger.warn({ challenge }, "Challenge not found, expired, or already used");
      return false;
    }

    // Match client algorithm exactly:
    // 1. Concatenate challenge + nonce as string
    // 2. SHA-256 hash
    // 3. Check if hex hash starts with N zeros
    const data = challenge + solution;
    const hash = crypto.createHash("sha256").update(data).digest("hex");

    const prefix = "0".repeat(difficulty);
    return hash.startsWith(prefix);
  } catch (error) {
    logger.error({ err: error }, "PoW verification error");
    return false;
  }
}
