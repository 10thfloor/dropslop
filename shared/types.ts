/**
 * Shared types between backend and frontend
 * These types are used across both projects to ensure consistency
 */

export type Phase = "registration" | "lottery" | "purchase" | "completed";

export type UserStatus =
  | "not_registered"
  | "registered"
  | "winner"
  | "backup_winner"
  | "loser"
  | "purchased"
  | "expired";

export type LoyaltyTier = "bronze" | "silver" | "gold";

/**
 * Ticket pricing info returned to clients
 */
export interface TicketPricing {
  priceUnit: number;
  maxTickets: number;
  // Pre-calculated costs for UI
  costs: number[]; // costs[n] = total cost for n tickets
}

/**
 * Bot validation data (same structure in both frontend and backend)
 */
export interface BotValidation {
  fingerprint: string; // FingerprintJS Pro visitorId
  fingerprintConfidence: number; // 0-100
  timingMs: number; // Time from page load to registration
  powSolution: string; // Argon2 hash solution
  powChallenge: string; // Original challenge
}

/**
 * SSE Event types - unified structure used by both frontend and backend
 */
export interface SSEEvent {
  type: "connected" | "drop" | "user";
  dropId?: string;
  phase?: Phase;
  participantCount?: number;
  totalTickets?: number; // Total tickets in the pool
  inventory?: number;
  initialInventory?: number; // Initial inventory (for display purposes)
  winnerCount?: number; // Number of winners selected
  ticketPricing?: TicketPricing; // Ticket pricing configuration
  // Timing info (for synchronized countdown)
  registrationEnd?: number; // Unix timestamp ms
  purchaseEnd?: number; // Unix timestamp ms - when purchase window closes
  serverTime?: number; // Server's current time for clock sync
  status?: UserStatus;
  tickets?: number; // User's ticket count
  effectiveTickets?: number; // Tickets after loyalty multiplier
  position?: number;
  token?: string;
  // Rollover info
  rolloverUsed?: number; // Rollover entries consumed this drop
  rolloverBalance?: number; // Global rollover balance remaining
  // Backup winner info
  backupPosition?: number; // Position in backup queue
  backupsAhead?: number; // Number of backups ahead in queue
  promoted?: boolean; // True when backup is promoted to winner
  // Lottery verification
  lotteryCommitment?: string; // Published commitment hash
  // Loyalty info
  loyaltyTier?: LoyaltyTier;
  loyaltyMultiplier?: number;
}

