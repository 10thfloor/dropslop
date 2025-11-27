// Re-export shared types
export type {
  Phase,
  UserStatus,
  LoyaltyTier,
  TicketPricing,
  BotValidation,
  SSEEvent,
} from "../../shared/types";

export interface DropState {
  phase: Phase;
  inventory: number;
  initialInventory: number; // Initial inventory (for display purposes)
  participantCount: number;
  totalTickets: number;
  totalEffectiveTickets?: number; // Total tickets with multipliers applied
  winnerCount: number;
  backupWinnerCount?: number;
  registrationEnd: number; // Server-authoritative timestamp
  purchaseEnd?: number; // Server-authoritative timestamp for purchase window
  ticketPricing: TicketPricing;
  lotteryCommitment?: string; // For verifiable lottery
}

export interface UserState {
  status: UserStatus;
  tickets?: number;
  effectiveTickets?: number; // Tickets after loyalty multiplier
  position?: number;
  queuePosition?: number;
  purchaseToken?: string;
  expiresAt?: number;
  // Rollover info
  rolloverUsed?: number; // How many rollover entries were used this drop
  rolloverBalance?: number; // Global rollover balance remaining
  // Backup winner info
  backupPosition?: number; // Position in backup queue
  promoted?: boolean; // True when promoted from backup to winner
  // Loyalty info
  loyaltyTier?: LoyaltyTier;
  loyaltyMultiplier?: number;
}

// SSEEvent and BotValidation are imported from shared/types.ts
// Frontend-specific discriminated union types can be created from SSEEvent if needed

export interface RegisterResult {
  success: boolean;
  participantCount: number;
  totalTickets: number;
  userTickets: number;
  effectiveTickets: number;
  position: number;
  rolloverUsed: number;
  paidEntries: number;
  loyaltyTier: string;
  loyaltyMultiplier: number;
}

export interface RolloverBalance {
  balance: number;
}

export interface LoyaltyStats {
  multiplier: number;
  tier: LoyaltyTier;
  streak: number;
  dropsParticipated: number;
}

export interface LotteryProof {
  available: boolean;
  commitment?: string;
  proof?: {
    commitment: string;
    secret: string;
    participantSnapshot: string;
    seed: string;
    algorithm: string;
    timestamp: number;
    winners: string[];
    backupWinners: string[];
  };
}
