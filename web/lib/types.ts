export type Phase = "registration" | "lottery" | "purchase" | "completed";

export type UserStatus =
  | "not_registered"
  | "registered"
  | "winner"
  | "loser"
  | "purchased";

export interface TicketPricing {
  priceUnit: number;
  maxTickets: number;
  costs: number[]; // costs[n] = total cost for n tickets
}

export interface DropState {
  phase: Phase;
  inventory: number;
  participantCount: number;
  totalTickets: number;
  winnerCount: number;
  registrationEnd: number; // Server-authoritative timestamp
  purchaseEnd?: number; // Server-authoritative timestamp for purchase window
  ticketPricing?: TicketPricing;
}

export interface UserState {
  status: UserStatus;
  tickets?: number;
  position?: number;
  queuePosition?: number;
  purchaseToken?: string;
  expiresAt?: number;
  // Rollover info
  rolloverUsed?: number; // How many rollover entries were used this drop
  rolloverBalance?: number; // Global rollover balance remaining
}

export interface SSEDropEvent {
  type: "drop";
  phase: Phase;
  participantCount: number;
  totalTickets: number;
  inventory: number;
  registrationEnd: number;
  purchaseEnd?: number;
  serverTime: number;
}

export interface SSEUserEvent {
  type: "user";
  status: UserStatus;
  tickets?: number;
  position?: number;
  token?: string;
  // Rollover fields
  rolloverUsed?: number;
  rolloverBalance?: number;
}

export interface SSEConnectedEvent {
  type: "connected";
  dropId: string;
  phase: Phase;
  totalTickets?: number;
  registrationEnd?: number;
  purchaseEnd?: number;
  serverTime?: number;
}

export type SSEEvent = SSEDropEvent | SSEUserEvent | SSEConnectedEvent;

export interface BotValidation {
  fingerprint: string;
  fingerprintConfidence: number;
  timingMs: number;
  powSolution: string;
  powChallenge: string;
}

export interface RegisterResult {
  success: boolean;
  participantCount: number;
  totalTickets: number;
  userTickets: number;
  position: number;
  rolloverUsed: number;
  paidEntries: number;
}

export interface RolloverBalance {
  balance: number;
}
