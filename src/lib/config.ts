/**
 * Unified configuration for the application
 * Centralizes all constants and environment variables
 */

// ============================================================
// Environment Variable Parsing Helpers
// ============================================================

function envString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function envBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

// ============================================================
// Server Configuration
// ============================================================

export const server = {
  /** API server port */
  apiPort: envNumber("API_PORT", 3003),
  /** SSE server port */
  ssePort: envNumber("SSE_PORT", 3004),
  /** Restate ingress port */
  restatePort: envNumber("RESTATE_PORT", 8081),
  /** Log level */
  logLevel: envString("LOG_LEVEL", "info"),
  /** Node environment */
  nodeEnv: envString("NODE_ENV", "development"),
  /** Is production */
  isProduction: envString("NODE_ENV", "development") === "production",
} as const;

// ============================================================
// NATS Configuration
// ============================================================

export const nats = {
  /** NATS server URL */
  url: envString("NATS_URL", "nats://localhost:4222"),
  /** Max reconnection attempts (-1 for infinite) */
  maxReconnectAttempts: -1,
  /** KV bucket names */
  buckets: {
    challenges: "pow_challenges",
    rateLimits: "rate_limits",
  },
  /** KV TTLs (in milliseconds) */
  ttl: {
    /** Challenge TTL - 5 minutes (matches pow.maxAge) */
    challenge: 5 * 60 * 1000,
    /** Rate limit TTL - 2 minutes (2x max window for safe cleanup of window-based keys) */
    rateLimit: 2 * 60 * 1000,
  },
  /** KV max bucket sizes (in bytes) */
  maxBytes: {
    challenges: 10 * 1024 * 1024, // 10MB
    rateLimits: 50 * 1024 * 1024, // 50MB
  },
} as const;

// ============================================================
// Restate Configuration
// ============================================================

export const restate = {
  /** Restate ingress URL */
  ingressUrl: envString("RESTATE_INGRESS_URL", "http://localhost:8080"),
  /** Default request timeout (ms) */
  defaultTimeoutMs: envNumber("RESTATE_TIMEOUT_MS", 30000),
  /** API request timeout (ms) */
  apiTimeoutMs: envNumber("RESTATE_API_TIMEOUT_MS", 15000),
  /** Max retries for retriable errors */
  maxRetries: 3,
  /** Retry delay (ms) */
  retryDelayMs: 1000,
} as const;

// ============================================================
// Drop Configuration
// ============================================================

export const drop = {
  /** Default price unit per ticket */
  defaultPriceUnit: 1.0,
  /** Default max tickets per user */
  defaultMaxTickets: 10,
  /** Max allowed tickets per user */
  maxTicketsPerUser: 10,
  /** Min purchase window (seconds) */
  minPurchaseWindowSecs: 60,
  /** Max purchase window (seconds) */
  maxPurchaseWindowSecs: 86400, // 24 hours
} as const;

// ============================================================
// Rollover Configuration
// ============================================================

export const rollover = {
  /** Maximum rollover entries a user can accumulate */
  maxEntries: 10,
  /** Percentage of paid entries granted to expired winners (0.0-1.0) */
  expiredWinnerPercent: 0.5, // 50% rollover for winners who didn't purchase
} as const;

// ============================================================
// Backup Winners Configuration
// ============================================================

export const backup = {
  /** Default backup multiplier (e.g., 1.5 means 50% extra selected as backups) */
  defaultMultiplier: 1.5,
  /** Minimum backup multiplier allowed */
  minMultiplier: 1.0,
  /** Maximum backup multiplier allowed */
  maxMultiplier: 3.0,
} as const;

// ============================================================
// Loyalty Configuration
// ============================================================

export const loyalty = {
  /** Loyalty tier definitions */
  tiers: {
    bronze: {
      minDrops: 0,
      multiplier: 1.0,
    },
    silver: {
      minDrops: 3,
      multiplier: 1.2,
    },
    gold: {
      minDrops: 10,
      multiplier: 1.5,
    },
  },
  /** Additional multiplier bonus for consecutive drop participation */
  streakBonus: 0.1, // +0.1x for meeting streak threshold
  /** Minimum consecutive drops to trigger streak bonus */
  streakThreshold: 3,
  /** Maximum total multiplier (tier + streak) */
  maxMultiplier: 2.0,
} as const;

// ============================================================
// Rate Limiting Configuration
// ============================================================

export const rateLimit = {
  /** Rate limit window (ms) */
  windowMs: envNumber("RATE_LIMIT_WINDOW_MS", 60000), // 1 minute
  /** Max requests per window */
  maxRequests: envNumber("RATE_LIMIT_MAX_REQUESTS", 10),
  /** Strict rate limit (for sensitive endpoints) */
  strict: {
    windowMs: envNumber("RATE_LIMIT_STRICT_WINDOW_MS", 60000),
    maxRequests: envNumber("RATE_LIMIT_STRICT_MAX_REQUESTS", 5),
  },
} as const;

// ============================================================
// Proof of Work Configuration
// ============================================================

export const pow = {
  /** PoW difficulty (number of leading zeros in hex) */
  difficulty: envNumber("POW_DIFFICULTY", 4),
  /** Challenge max age (ms) before expiration */
  maxAge: 5 * 60 * 1000, // 5 minutes
} as const;

// ============================================================
// Security Configuration
// ============================================================

export const security = {
  /** IP hash salt for GDPR compliance */
  ipHashSalt: envString("IP_HASH_SALT", "rate-limit-salt-v1"),
  /** Secret for signing purchase tokens (generate with: openssl rand -base64 32) */
  purchaseTokenSecret: envString(
    "PURCHASE_TOKEN_SECRET",
    "dev-purchase-secret-change-in-prod"
  ),
  /** Admin secret for protected endpoints */
  adminSecret: process.env.ADMIN_SECRET,
  /** CORS allowed origins */
  corsOrigins: process.env.CORS_ORIGINS?.split(",") || [
    "http://localhost:3005",
    "http://localhost:3003",
    "http://127.0.0.1:3005",
    "http://127.0.0.1:3003",
  ],
} as const;

// ============================================================
// Fingerprint Configuration
// ============================================================

export const fingerprint = {
  /** FingerprintJS Pro API key */
  apiKey: process.env.FINGERPRINT_API_KEY,
  /** Minimum trust score to pass bot check */
  minTrustScore: envNumber("MIN_TRUST_SCORE", 50),
} as const;

// ============================================================
// Maintenance Configuration
// ============================================================

export const maintenance = {
  /** Periodic cleanup/stats interval (ms) */
  cleanupIntervalMs: envNumber("CLEANUP_INTERVAL_MS", 5 * 60 * 1000), // 5 minutes
  /** Enable periodic cleanup */
  enableCleanup: envBoolean("ENABLE_PERIODIC_CLEANUP", true),
} as const;

// ============================================================
// Full Config Export
// ============================================================

export const config = {
  server,
  nats,
  restate,
  drop,
  rollover,
  backup,
  loyalty,
  rateLimit,
  pow,
  security,
  fingerprint,
  maintenance,
} as const;

export default config;
