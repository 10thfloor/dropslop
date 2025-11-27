import crypto from "node:crypto";
import type { DropState, TicketPricing, LotteryProof } from "./types.js";

/**
 * Seeded random number generator using LCG
 */
function createSeededRNG(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  let value = hash;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

/**
 * Fisher-Yates shuffle with seeded randomness
 */
function seededShuffle<T>(array: T[], seed: string): T[] {
  const shuffled = [...array];
  const random = createSeededRNG(seed);

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Original unweighted winner selection (kept for backwards compatibility)
 */
export function selectWinners(
  participants: string[],
  count: number,
  seed: string
): string[] {
  if (participants.length <= count) {
    return [...participants];
  }

  const shuffled = seededShuffle(participants, seed);
  return shuffled.slice(0, count);
}

/**
 * Weighted winner selection using ticket counts
 * Each ticket = 1 entry in the pool
 * Users can only win once (unique winners)
 */
export function selectWinnersWeighted(
  participantTickets: Record<string, number>,
  count: number,
  seed: string
): string[] {
  const entries = Object.entries(participantTickets);

  if (entries.length === 0) return [];

  // If fewer or equal unique participants than prizes, everyone wins
  if (entries.length <= count) {
    return entries.map(([userId]) => userId);
  }

  // Expand participants by ticket count into a pool
  const pool: string[] = [];
  for (const [userId, tickets] of entries) {
    for (let i = 0; i < tickets; i++) {
      pool.push(userId);
    }
  }

  // Shuffle the pool
  const shuffled = seededShuffle(pool, seed);

  // Select unique winners
  const winners: string[] = [];
  const seen = new Set<string>();

  for (const userId of shuffled) {
    if (!seen.has(userId)) {
      winners.push(userId);
      seen.add(userId);
      if (winners.length >= count) break;
    }
  }

  return winners;
}

/**
 * Generate a secure, unpredictable lottery seed
 * Includes server-side cryptographic randomness to prevent prediction
 */
export function generateLotterySeed(dropState: DropState): string {
  const participantCount = Object.keys(dropState.participantTickets).length;
  const totalTickets = Object.values(dropState.participantTickets).reduce(
    (a, b) => a + b,
    0
  );
  
  // Add cryptographic randomness to prevent prediction
  const serverRandom = crypto.randomBytes(32).toString("hex");
  
  // Combine deterministic data with server randomness
  return `${dropState.config.dropId}:${participantCount}:${totalTickets}:${dropState.config.registrationEnd}:${serverRandom}`;
}

/**
 * Calculate the cost for upgrading to N total tickets
 * First ticket is FREE, additional tickets cost quadratically
 * Cost = 1² + 2² + ... + (n-1)² = n(n-1)(2n-1)/6
 */
export function calculateUpgradeCost(
  totalTickets: number,
  priceUnit: number
): number {
  if (totalTickets <= 1) return 0; // First ticket is free

  const n = totalTickets - 1; // Number of paid tickets
  // Sum of squares formula: n(n+1)(2n+1)/6
  return ((n * (n + 1) * (2 * n + 1)) / 6) * priceUnit;
}

/**
 * Calculate the incremental cost to add one more ticket
 */
export function calculateIncrementalCost(
  currentTickets: number,
  priceUnit: number
): number {
  if (currentTickets < 1) return 0; // First ticket is free
  return currentTickets * currentTickets * priceUnit; // n² for the nth additional ticket
}

/**
 * Get ticket pricing info for UI
 */
export function getTicketPricing(
  priceUnit: number,
  maxTickets: number
): TicketPricing {
  const costs: number[] = [];
  for (let i = 0; i <= maxTickets; i++) {
    costs.push(calculateUpgradeCost(i, priceUnit));
  }

  return {
    priceUnit,
    maxTickets,
    costs,
  };
}

/**
 * Calculate approximate win probability
 * Note: This is simplified - actual probability depends on selection without replacement
 */
export function calculateWinProbability(
  userTickets: number,
  totalTickets: number,
  inventory: number
): number {
  if (totalTickets === 0 || userTickets === 0) return 0;
  if (inventory >= totalTickets) return 1; // Everyone wins

  // Simplified approximation: (userTickets / totalTickets) * min(inventory, 1)
  // Real math is more complex due to selection without replacement
  const poolShare = userTickets / totalTickets;

  // Approximate probability using inclusion-exclusion principle simplification
  // For small ticket counts relative to pool, this is reasonably accurate
  return Math.min(1, poolShare * inventory);
}

/**
 * Get total ticket count from participant tickets map
 */
export function getTotalTickets(
  participantTickets: Record<string, number>
): number {
  return Object.values(participantTickets).reduce(
    (sum, tickets) => sum + tickets,
    0
  );
}

// ============================================================
// Verifiable Lottery (Commit-Reveal) Functions
// ============================================================

/**
 * Generate commitment for verifiable lottery
 * Called BEFORE registration starts (at drop initialization)
 * The secret is stored privately, commitment is published publicly
 */
export function generateLotteryCommitment(): {
  secret: string;
  commitment: string;
} {
  // Generate 32 bytes of cryptographic randomness
  const secret = crypto.randomBytes(32).toString("hex");
  
  // Create commitment hash that will be published
  const commitment = crypto
    .createHash("sha256")
    .update(secret)
    .digest("hex");
  
  return { secret, commitment };
}

/**
 * Verify that a secret matches a commitment
 * Anyone can call this to verify the lottery wasn't rigged
 */
export function verifyCommitment(secret: string, commitment: string): boolean {
  const computed = crypto
    .createHash("sha256")
    .update(secret)
    .digest("hex");
  return computed === commitment;
}

/**
 * Create deterministic participant snapshot for seed generation
 * Sorted by userId to ensure reproducibility regardless of insertion order
 */
export function createParticipantSnapshot(
  participantTickets: Record<string, number>,
  participantMultipliers?: Record<string, number>
): string {
  // Sort by userId to ensure deterministic ordering
  const sorted = Object.entries(participantTickets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, tickets]) => {
      const multiplier = participantMultipliers?.[userId] ?? 1.0;
      const effectiveTickets = Math.floor(tickets * multiplier);
      return `${userId}:${effectiveTickets}`;
    })
    .join("|");
  
  return sorted;
}

/**
 * Generate verifiable lottery seed
 * Combines server secret with participant data
 * This ensures the seed couldn't be manipulated after seeing registrations
 */
export function generateVerifiableSeed(
  secret: string,
  participantSnapshot: string
): string {
  return crypto
    .createHash("sha256")
    .update(secret + "|" + participantSnapshot)
    .digest("hex");
}

/**
 * Create full lottery proof for public verification
 * Contains everything needed to independently verify the lottery results
 */
export function createLotteryProof(
  secret: string,
  commitment: string,
  participantTickets: Record<string, number>,
  participantMultipliers: Record<string, number>,
  winners: string[],
  backupWinners: string[]
): LotteryProof {
  const participantSnapshot = createParticipantSnapshot(
    participantTickets,
    participantMultipliers
  );
  const seed = generateVerifiableSeed(secret, participantSnapshot);
  
  return {
    commitment,
    secret,
    participantSnapshot,
    seed,
    algorithm: "weighted-fisher-yates-v1",
    timestamp: Date.now(),
    winners,
    backupWinners,
  };
}

/**
 * Weighted winner selection with loyalty multipliers
 * Each ticket is multiplied by the user's loyalty multiplier
 * Users can only win once (unique winners)
 */
export function selectWinnersWithMultipliers(
  participantTickets: Record<string, number>,
  participantMultipliers: Record<string, number>,
  count: number,
  seed: string
): string[] {
  const entries = Object.entries(participantTickets);

  if (entries.length === 0) return [];

  // If fewer or equal unique participants than prizes, everyone wins
  if (entries.length <= count) {
    return entries.map(([userId]) => userId);
  }

  // Expand participants by effective ticket count (tickets * multiplier) into a pool
  const pool: string[] = [];
  for (const [userId, tickets] of entries) {
    const multiplier = participantMultipliers[userId] ?? 1.0;
    const effectiveTickets = Math.floor(tickets * multiplier);
    for (let i = 0; i < effectiveTickets; i++) {
      pool.push(userId);
    }
  }

  // Shuffle the pool
  const shuffled = seededShuffle(pool, seed);

  // Select unique winners
  const winners: string[] = [];
  const seen = new Set<string>();

  for (const userId of shuffled) {
    if (!seen.has(userId)) {
      winners.push(userId);
      seen.add(userId);
      if (winners.length >= count) break;
    }
  }

  return winners;
}

/**
 * Calculate effective tickets after applying loyalty multiplier
 */
export function getEffectiveTickets(
  tickets: number,
  multiplier: number
): number {
  return Math.floor(tickets * multiplier);
}

/**
 * Calculate win probability with loyalty multiplier
 */
export function calculateWinProbabilityWithMultiplier(
  userTickets: number,
  loyaltyMultiplier: number,
  totalEffectiveTickets: number,
  inventory: number,
  participantCount: number
): number {
  if (totalEffectiveTickets === 0 || userTickets === 0) return 0;
  if (inventory >= participantCount) return 1; // Everyone wins
  
  const effectiveTickets = Math.floor(userTickets * loyaltyMultiplier);
  const poolShare = effectiveTickets / totalEffectiveTickets;
  
  // Approximate probability
  return Math.min(1, poolShare * Math.min(inventory, participantCount));
}

/**
 * Get total effective tickets (with multipliers applied)
 */
export function getTotalEffectiveTickets(
  participantTickets: Record<string, number>,
  participantMultipliers?: Record<string, number>
): number {
  return Object.entries(participantTickets).reduce((sum, [userId, tickets]) => {
    const multiplier = participantMultipliers?.[userId] ?? 1.0;
    return sum + Math.floor(tickets * multiplier);
  }, 0);
}
