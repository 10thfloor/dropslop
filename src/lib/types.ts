export type Phase = "registration" | "lottery" | "purchase" | "completed";

export interface DropConfig {
  dropId: string;
  inventory: number;
  registrationStart: number; // Unix timestamp
  registrationEnd: number; // Unix timestamp
  purchaseWindow: number; // seconds
  // Ticket pricing
  ticketPriceUnit: number; // Base price per additional ticket (default: 1.0)
  maxTicketsPerUser: number; // Maximum tickets per user (default: 10)
}

export interface DropState {
  phase: Phase;
  inventory: number;
  participantTickets: Record<string, number>; // userId -> ticket count
  winners: string[]; // userIds
  config: DropConfig;
  purchaseEnd?: number; // Unix timestamp ms - when purchase window closes
}

export interface ParticipantState {
  status: "not_registered" | "registered" | "winner" | "loser" | "purchased";
  tickets?: number; // Total entries for this drop
  rolloverUsed?: number; // How many rollover entries were consumed this drop
  paidEntries?: number; // How many entries were paid (for rollover calculation)
  queuePosition?: number;
  purchaseToken?: string;
  expiresAt?: number; // Unix timestamp
}

/**
 * Global user rollover balance (cross-drop)
 * Keyed by userId only, not dropId:userId
 */
export interface UserRolloverState {
  balance: number; // Available rollover entries
  lastUpdated: number; // Timestamp of last update
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
  status?: "registered" | "winner" | "loser";
  tickets?: number; // User's ticket count
  position?: number;
  token?: string;
  // Rollover info
  rolloverUsed?: number; // Rollover entries consumed this drop
  rolloverBalance?: number; // Global rollover balance remaining
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
