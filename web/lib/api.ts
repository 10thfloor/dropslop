import type {
  BotValidation,
  DropState,
  UserState,
  RegisterResult,
  RolloverBalance,
} from "./types";

const API_BASE = "/api";

// Maximum rollover entries a user can accumulate (must match backend)
export const MAX_ROLLOVER_ENTRIES = 10;

export async function getDropStatus(dropId: string): Promise<DropState> {
  const res = await fetch(`${API_BASE}/drop/${dropId}/status`);
  if (!res.ok) throw new Error("Failed to fetch drop status");
  return res.json();
}

export async function getPowChallenge(): Promise<{
  challenge: string;
  difficulty: number;
}> {
  const res = await fetch(`${API_BASE}/pow/challenge`);
  if (!res.ok) throw new Error("Failed to get PoW challenge");
  return res.json();
}

/**
 * Register for a drop with ticket count
 * Rollover entries are automatically applied from user's balance
 */
export async function registerForDrop(
  dropId: string,
  userId: string,
  botValidation: BotValidation,
  tickets = 1
): Promise<RegisterResult> {
  const res = await fetch(`${API_BASE}/drop/${dropId}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, tickets, botValidation }),
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Registration failed" }));
    throw new Error(error.error || "Registration failed");
  }

  return res.json();
}

export async function startPurchase(
  dropId: string,
  userId: string
): Promise<{ success: boolean; purchaseToken: string; expiresAt: number }> {
  const res = await fetch(`${API_BASE}/drop/${dropId}/purchase/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Failed to start purchase" }));
    throw new Error(error.error || "Failed to start purchase");
  }

  return res.json();
}

export async function completePurchase(
  dropId: string,
  userId: string,
  purchaseToken: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/drop/${dropId}/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, purchaseToken }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Purchase failed" }));
    throw new Error(error.error || "Purchase failed");
  }

  return res.json();
}

export async function getUserStatus(
  dropId: string,
  userId: string
): Promise<UserState> {
  const res = await fetch(`${API_BASE}/participant/${dropId}:${userId}/status`);
  if (!res.ok) {
    return { status: "not_registered" };
  }
  return res.json();
}

/**
 * Get user's global rollover balance (cross-drop)
 */
export async function getRolloverBalance(
  userId: string
): Promise<RolloverBalance> {
  const res = await fetch(`${API_BASE}/drop/rollover/${userId}`);
  if (!res.ok) {
    return { balance: 0 };
  }
  return res.json();
}

/**
 * Calculate cost for entries after rollover and free entry are applied
 * Entry order: rollover first, then 1 free, then paid
 */
export function calculateCostWithRollover(
  desiredTickets: number,
  rolloverBalance: number,
  priceUnit = 1
): {
  rolloverUsed: number;
  freeEntry: number;
  paidEntries: number;
  cost: number;
} {
  const rolloverUsed = Math.min(rolloverBalance, desiredTickets);
  const remainingAfterRollover = desiredTickets - rolloverUsed;

  // Free entry only applies if rollover didn't cover everything
  const freeEntry = remainingAfterRollover > 0 ? 1 : 0;
  const paidEntries = Math.max(0, remainingAfterRollover - freeEntry);

  // Cost only for paid entries (quadratic pricing)
  const cost =
    paidEntries > 0 ? calculateUpgradeCost(paidEntries + 1, priceUnit) : 0;

  return { rolloverUsed, freeEntry, paidEntries, cost };
}

/**
 * Calculate cost for additional tickets (first is free)
 * Cost = 1² + 2² + ... + (n-1)²
 */
export function calculateUpgradeCost(
  totalTickets: number,
  priceUnit = 1
): number {
  if (totalTickets <= 1) return 0;
  const n = totalTickets - 1;
  return ((n * (n + 1) * (2 * n + 1)) / 6) * priceUnit;
}

/**
 * Calculate approximate win probability
 */
export function calculateWinProbability(
  userTickets: number,
  totalTickets: number,
  inventory: number
): number {
  if (totalTickets === 0 || userTickets === 0) return 0;
  if (inventory >= totalTickets) return 1;
  return Math.min(1, (userTickets / totalTickets) * inventory);
}
