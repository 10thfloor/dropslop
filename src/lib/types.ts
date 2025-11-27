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

export interface DropConfig {
  dropId: string;
  inventory: number;
  registrationStart: number; // Unix timestamp
  registrationEnd: number; // Unix timestamp
  purchaseWindow: number; // seconds
  // Ticket pricing
  ticketPriceUnit: number; // Base price per additional ticket (default: 1.0)
  maxTicketsPerUser: number; // Maximum tickets per user (default: 10)
  // Backup winners
  backupMultiplier?: number; // e.g., 1.5 means 50% extra as backups (default: 1.5)
  // Verifiable lottery
  lotteryCommitment?: string; // SHA256 hash of secret, published at drop creation
}

/**
 * Lottery proof for verifiable randomness
 * Published after lottery runs so anyone can verify results
 */
export interface LotteryProof {
  commitment: string; // SHA256(secret) - published before registration ends
  secret: string; // Revealed after lottery
  participantSnapshot: string; // Deterministic snapshot of all participants
  seed: string; // SHA256(secret + participantSnapshot)
  algorithm: string; // "weighted-fisher-yates-v1"
  timestamp: number; // When lottery ran
  winners: string[]; // Selected winners for verification
  backupWinners: string[]; // Backup winners
}

export interface DropState {
  phase: Phase;
  inventory: number;
  initialInventory: number; // Original inventory for tracking
  participantTickets: Record<string, number>; // userId -> ticket count
  participantMultipliers: Record<string, number>; // userId -> loyalty multiplier at registration time
  winners: string[]; // userIds
  backupWinners: string[]; // Ordered backup winner list
  expiredWinners: string[]; // Winners who didn't purchase in time
  config: DropConfig;
  purchaseEnd?: number; // Unix timestamp ms - when purchase window closes
  // Verifiable lottery
  lotterySecret?: string; // Revealed after lottery runs
  lotteryProof?: LotteryProof; // Full audit trail
}

export interface ParticipantState {
  status: UserStatus;
  tickets?: number; // Total entries for this drop
  effectiveTickets?: number; // Tickets after loyalty multiplier applied
  rolloverUsed?: number; // How many rollover entries were consumed this drop
  paidEntries?: number; // How many entries were paid (for rollover calculation)
  queuePosition?: number; // Position for winners (1, 2, 3...)
  backupPosition?: number; // Position in backup queue (1, 2, 3...)
  purchaseToken?: string;
  expiresAt?: number; // Unix timestamp
  // Loyalty info at time of registration
  loyaltyTier?: LoyaltyTier;
  loyaltyMultiplier?: number;
}

/**
 * Global user rollover balance (cross-drop)
 * Keyed by userId only, not dropId:userId
 */
export interface UserRolloverState {
  balance: number; // Available rollover entries
  lastUpdated: number; // Timestamp of last update
}

/**
 * Global user loyalty state (cross-drop)
 * Tracks participation history for tier calculation
 */
export interface UserLoyaltyState {
  dropsParticipated: string[]; // List of dropIds user has participated in
  lastParticipationDate: number; // Timestamp of last participation
  currentStreak: number; // Consecutive drops participated
  tier: LoyaltyTier;
  multiplier: number; // Current multiplier (1.0, 1.2, 1.5, etc.)
}

export interface BotValidationRequest {
  fingerprint: string; // FingerprintJS Pro visitorId
  fingerprintConfidence: number; // 0-100
  timingMs: number; // Time from page load to registration
  powSolution: string; // Argon2 hash solution
  powChallenge: string; // Original challenge
}

export interface BotValidationResult {
  trustScore: number; // 0-100
  allowed: boolean;
  reason?: string;
}

export interface PowChallenge {
  challenge: string;
  difficulty: number;
  timestamp: number;
}

export interface SSEEvent {
  type: "connected" | "drop" | "user";
  dropId?: string;
  phase?: Phase;
  participantCount?: number;
  totalTickets?: number; // Total tickets in the pool
  inventory?: number;
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
  promoted?: boolean; // True when backup is promoted to winner
  // Lottery verification
  lotteryCommitment?: string; // Published commitment hash
  // Loyalty info
  loyaltyTier?: LoyaltyTier;
  loyaltyMultiplier?: number;
}

export interface RegisterRequest {
  userId: string;
  tickets: number; // Total desired entries (1-10)
  botValidation: BotValidationRequest;
}

export interface PurchaseRequest {
  userId: string;
  purchaseToken: string;
}

// Ticket pricing info returned to clients
export interface TicketPricing {
  priceUnit: number;
  maxTickets: number;
  // Pre-calculated costs for UI
  costs: number[]; // costs[n] = total cost for n tickets
}
