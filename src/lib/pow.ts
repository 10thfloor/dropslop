import crypto from "node:crypto";
import type { PowChallenge } from "./types.js";

const DEFAULT_DIFFICULTY = Number.parseInt(
  process.env.POW_DIFFICULTY || "4",
  10
); // 4 hex chars = "0000"

// Store challenges with expiration (in production, use Redis)
const challengeStore = new Map<string, PowChallenge>();

/**
 * Generate a proof-of-work challenge
 */
export function generateChallenge(): PowChallenge {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const challenge = `${timestamp}:${random}`;

  const powChallenge: PowChallenge = {
    challenge,
    difficulty: DEFAULT_DIFFICULTY,
    timestamp,
  };

  // Store challenge for validation
  challengeStore.set(challenge, powChallenge);

  // Cleanup old challenges (older than 5 minutes)
  const expiry = Date.now() - 300000;
  for (const [key, value] of challengeStore.entries()) {
    if (value.timestamp < expiry) {
      challengeStore.delete(key);
    }
  }

  return powChallenge;
}

/**
 * Verify a SHA-256 proof-of-work solution
 * Must match the client-side algorithm exactly
 */
export function verifyPow(
  challenge: string,
  solution: string,
  difficulty: number = DEFAULT_DIFFICULTY
): boolean {
  try {
    // Check if challenge exists and is valid
    const storedChallenge = challengeStore.get(challenge);
    if (!storedChallenge) {
      console.error("Challenge not found or already used");
      return false;
    }

    if (!isChallengeValid(storedChallenge)) {
      console.error("Challenge expired");
      challengeStore.delete(challenge);
      return false;
    }

    // Match client algorithm exactly:
    // 1. Concatenate challenge + nonce as string
    // 2. SHA-256 hash
    // 3. Check if hex hash starts with N zeros
    const data = challenge + solution;
    const hash = crypto.createHash("sha256").update(data).digest("hex");

    const prefix = "0".repeat(difficulty);
    const valid = hash.startsWith(prefix);

    // Remove challenge after use (one-time use)
    if (valid) {
      challengeStore.delete(challenge);
    }

    return valid;
  } catch (error) {
    console.error("PoW verification error:", error);
    return false;
  }
}

/**
 * Check if challenge is still valid (not expired)
 */
export function isChallengeValid(
  challenge: PowChallenge,
  maxAge = 300000
): boolean {
  return Date.now() - challenge.timestamp < maxAge;
}
