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

// ============================================================================
// Geo-Fence Types
// ============================================================================

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface GeoFenceRadius {
  type: "radius";
  center: GeoCoordinates;
  radiusMeters: number;
  name?: string;
}

export interface GeoFencePolygon {
  type: "polygon";
  vertices: GeoCoordinates[];
  name?: string;
}

export type GeoFence = GeoFenceRadius | GeoFencePolygon;

export type GeoFenceMode = "exclusive" | "bonus";

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

// ============================================================================
// Queue (Token Sequencing) Types
// ============================================================================

export type QueueTokenStatus = "waiting" | "ready" | "used" | "expired";

/**
 * Queue token for token-sequencing bot defense
 * Issued when user joins queue, must be "ready" to register
 */
export interface QueueToken {
  token: string;
  dropId: string;
  fingerprint: string;
  ipHash: string;
  position: number;
  issuedAt: number;
  readyAt?: number;
  expiresAt: number;
  status: QueueTokenStatus;
}

/**
 * Behavioral signals collected during queue wait
 * Used to distinguish humans from bots
 */
export interface QueueBehaviorSignals {
  /** Count of mouse movement events (throttled) */
  mouseMovements: number;
  /** Count of scroll events */
  scrollEvents: number;
  /** Count of key press events (not content) */
  keyPresses: number;
  /** Count of window focus/blur events */
  focusBlurEvents: number;
  /** Count of visibility state changes */
  visibilityChanges: number;
  /** Time spent on page in ms */
  timeOnPage: number;
  /** JSON-encoded interaction pattern signature */
  interactionPatterns: string;
}

/**
 * SSE events for queue position updates
 */
export interface QueueSSEEvent {
  type: "queue_position" | "queue_ready" | "queue_expired";
  position?: number;
  estimatedWaitSeconds?: number;
  token?: string;
  expiresAt?: number;
  aheadOfYou?: number;
  totalInQueue?: number;
}

/**
 * Response when joining the queue
 */
export interface QueueJoinResponse {
  token: string;
  position: number;
  estimatedWaitSeconds: number;
  status: QueueTokenStatus;
}

/**
 * Response when checking queue status
 */
export interface QueueStatusResponse {
  status: QueueTokenStatus;
  position?: number;
  estimatedWaitSeconds?: number;
  expiresAt?: number;
  readyAt?: number;
}

// ============================================================================
// SSE Event Types
// ============================================================================

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
  // Geo-fence info
  geoFence?: GeoFence;
  geoFenceMode?: GeoFenceMode;
  geoFenceBonusMultiplier?: number;
}
