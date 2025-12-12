/**
 * NATS KV Store utilities for distributed state
 * Uses JetStream Key-Value stores for challenge and rate limit storage
 */

import crypto from "node:crypto";
import { connect, type NatsConnection } from "@nats-io/transport-node";
import { jetstream, jetstreamManager } from "@nats-io/jetstream";
import { Kvm, type KV } from "@nats-io/kv";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const logger = createLogger("nats-kv");

// Connection state with promise-based locks to prevent race conditions
let nc: NatsConnection | null = null;
let ncPromise: Promise<NatsConnection> | null = null;

let challengeKv: KV | null = null;
let challengeKvPromise: Promise<KV> | null = null;

let rateLimitKv: KV | null = null;
let rateLimitKvPromise: Promise<KV> | null = null;

let queueTokenKv: KV | null = null;
let queueTokenKvPromise: Promise<KV> | null = null;

let dropsIndexKv: KV | null = null;
let dropsIndexKvPromise: Promise<KV> | null = null;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Get or create NATS connection (with promise-based lock)
 * Prevents race condition where multiple callers create duplicate connections
 */
async function getNatsConnection(): Promise<NatsConnection> {
  // Return existing connection
  if (nc) return nc;

  // Return pending connection promise (concurrent callers share the same attempt)
  if (ncPromise) return ncPromise;

  // Create new connection with lock
  ncPromise = (async () => {
    try {
      const conn = await connect({
        servers: config.nats.url,
        maxReconnectAttempts: config.nats.maxReconnectAttempts,
      });
      logger.info({ url: config.nats.url }, "NATS KV: Connected to NATS");

      conn.closed().then((result) => {
        const err = result instanceof Error ? result : undefined;
        logger.info({ err }, "NATS KV connection closed");
        // Reset all state on connection close
        nc = null;
        ncPromise = null;
        challengeKv = null;
        challengeKvPromise = null;
        rateLimitKv = null;
        rateLimitKvPromise = null;
        queueTokenKv = null;
        queueTokenKvPromise = null;
        dropsIndexKv = null;
        dropsIndexKvPromise = null;
      });

      nc = conn;
      return conn;
    } finally {
      // Clear the pending promise after completion (success or failure)
      // Keep ncPromise if nc was set successfully, clear if it failed
      if (!nc) ncPromise = null;
    }
  })();

  return ncPromise;
}

/**
 * Get or create the challenge KV bucket (with promise-based lock)
 * Uses JetStream and the "create-first" pattern for reliable bucket initialization
 */
async function getChallengeKv(): Promise<KV> {
  // Return existing bucket
  if (challengeKv) return challengeKv;

  // Return pending bucket promise
  if (challengeKvPromise) return challengeKvPromise;

  // Create new bucket with lock
  challengeKvPromise = (async () => {
    try {
      const conn = await getNatsConnection();

      // Verify JetStream is available using jetstreamManager
      const jsm = await jetstreamManager(conn);
      await jsm.getAccountInfo();
      logger.info("JetStream verified available for challenge bucket");

      // Create JetStream client and Kvm
      const js = jetstream(conn);
      const kvm = new Kvm(js);

      const bucketName = config.nats.buckets.challenges;
      let kv: KV;

      // Try to create bucket first (more reliable than open which may return stale handle)
      try {
        kv = await kvm.create(bucketName, {
          ttl: config.nats.ttl.challenge,
          history: 1,
          max_bytes: config.nats.maxBytes.challenges,
        });
        logger.info(
          { bucket: bucketName },
          "NATS KV: Created challenge bucket"
        );
      } catch (createError) {
        // If bucket already exists, open it
        const errorMsg =
          createError instanceof Error
            ? createError.message
            : String(createError);
        if (errorMsg.includes("already") || errorMsg.includes("exists")) {
          kv = await kvm.open(bucketName);
          logger.info(
            { bucket: bucketName },
            "NATS KV: Opened existing challenge bucket"
          );
        } else {
          throw createError;
        }
      }

      challengeKv = kv;
      return kv;
    } catch (error) {
      logger.error({ err: error }, "Failed to initialize challenge KV bucket");
      challengeKvPromise = null;
      throw error;
    }
  })();

  return challengeKvPromise;
}

/**
 * Get or create the drops index KV bucket (with promise-based lock)
 * Stores drop metadata keyed by dropId for homepage listing.
 */
async function getDropsIndexKv(): Promise<KV> {
  if (dropsIndexKv) return dropsIndexKv;
  if (dropsIndexKvPromise) return dropsIndexKvPromise;

  dropsIndexKvPromise = (async () => {
    try {
      const conn = await getNatsConnection();

      // Verify JetStream is available
      const jsm = await jetstreamManager(conn);
      await jsm.getAccountInfo();
      logger.info("JetStream verified available for drops index bucket");

      const js = jetstream(conn);
      const kvm = new Kvm(js);

      const bucketName = config.nats.buckets.dropsIndex;
      let kv: KV;

      try {
        kv = await kvm.create(bucketName, {
          history: 1,
          max_bytes: config.nats.maxBytes.dropsIndex,
        });
        logger.info(
          { bucket: bucketName },
          "NATS KV: Created drops index bucket"
        );
      } catch {
        kv = await kvm.open(bucketName);
        logger.info(
          { bucket: bucketName },
          "NATS KV: Opened drops index bucket"
        );
      }

      dropsIndexKv = kv;
      return kv;
    } finally {
      if (!dropsIndexKv) dropsIndexKvPromise = null;
    }
  })();

  return dropsIndexKvPromise;
}

/**
 * Get or create the rate limit KV bucket (with promise-based lock)
 * Uses JetStream and the "create-first" pattern for reliable bucket initialization
 */
async function getRateLimitKv(): Promise<KV> {
  // Return existing bucket
  if (rateLimitKv) return rateLimitKv;

  // Return pending bucket promise
  if (rateLimitKvPromise) return rateLimitKvPromise;

  // Create new bucket with lock
  rateLimitKvPromise = (async () => {
    try {
      const conn = await getNatsConnection();

      // Verify JetStream is available using jetstreamManager
      const jsm = await jetstreamManager(conn);
      await jsm.getAccountInfo();
      logger.info("JetStream verified available for rate limit bucket");

      // Create JetStream client and Kvm
      const js = jetstream(conn);
      const kvm = new Kvm(js);

      const bucketName = config.nats.buckets.rateLimits;
      let kv: KV;

      // Try to create bucket first (more reliable than open which may return stale handle)
      try {
        kv = await kvm.create(bucketName, {
          ttl: config.nats.ttl.rateLimit,
          history: 1,
          max_bytes: config.nats.maxBytes.rateLimits,
        });
        logger.info(
          { bucket: bucketName },
          "NATS KV: Created rate limit bucket"
        );
      } catch (createError) {
        // If bucket already exists, open it
        const errorMsg =
          createError instanceof Error
            ? createError.message
            : String(createError);
        if (errorMsg.includes("already") || errorMsg.includes("exists")) {
          kv = await kvm.open(bucketName);
          logger.info(
            { bucket: bucketName },
            "NATS KV: Opened existing rate limit bucket"
          );
        } else {
          throw createError;
        }
      }

      rateLimitKv = kv;
      return kv;
    } catch (error) {
      logger.error({ err: error }, "Failed to initialize rate limit KV bucket");
      rateLimitKvPromise = null;
      throw error;
    }
  })();

  return rateLimitKvPromise;
}

/**
 * Get or create the queue token KV bucket (with promise-based lock)
 * Uses JetStream and the "create-first" pattern for reliable bucket initialization
 */
async function getQueueTokenKv(): Promise<KV> {
  // Return existing bucket
  if (queueTokenKv) return queueTokenKv;

  // Return pending bucket promise
  if (queueTokenKvPromise) return queueTokenKvPromise;

  // Create new bucket with lock
  queueTokenKvPromise = (async () => {
    try {
      const conn = await getNatsConnection();

      // Verify JetStream is available using jetstreamManager
      const jsm = await jetstreamManager(conn);
      await jsm.getAccountInfo();
      logger.info("JetStream verified available for queue token bucket");

      // Create JetStream client and Kvm
      const js = jetstream(conn);
      const kvm = new Kvm(js);

      const bucketName = config.nats.buckets.queueTokens;
      let kv: KV;

      // Try to create bucket first (more reliable than open which may return stale handle)
      try {
        kv = await kvm.create(bucketName, {
          ttl: config.nats.ttl.queueToken,
          history: 1,
          max_bytes: config.nats.maxBytes.queueTokens,
        });
        logger.info(
          { bucket: bucketName },
          "NATS KV: Created queue token bucket"
        );
      } catch (createError) {
        // If bucket already exists, open it
        const errorMsg =
          createError instanceof Error
            ? createError.message
            : String(createError);
        if (errorMsg.includes("already") || errorMsg.includes("exists")) {
          kv = await kvm.open(bucketName);
          logger.info(
            { bucket: bucketName },
            "NATS KV: Opened existing queue token bucket"
          );
        } else {
          throw createError;
        }
      }

      queueTokenKv = kv;
      return kv;
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to initialize queue token KV bucket"
      );
      queueTokenKvPromise = null;
      throw error;
    }
  })();

  return queueTokenKvPromise;
}

// ============================================================
// Challenge Store Interface
// ============================================================

export interface StoredChallenge {
  challenge: string;
  difficulty: number;
  timestamp: number;
}

/**
 * Sanitize a key for NATS KV storage
 * NATS KV keys can only contain: A-Z, a-z, 0-9, -, _, /
 * Replace invalid characters (like colons and dots) with underscores
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_/-]/g, "_");
}

/**
 * Hash an IP address for privacy (GDPR compliance)
 * Uses SHA-256 with a salt to prevent rainbow table attacks
 * The result is a valid NATS KV key (hex string)
 */
function hashIp(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(config.security.ipHashSalt + ip)
    .digest("hex");
}

/**
 * Store a PoW challenge
 */
export async function storeChallenge(
  challenge: StoredChallenge
): Promise<void> {
  const kv = await getChallengeKv();
  const key = sanitizeKey(challenge.challenge);
  await kv.put(key, textEncoder.encode(JSON.stringify(challenge)));
}

/**
 * Get and delete a challenge (one-time use)
 */
export async function getAndDeleteChallenge(
  challengeKey: string
): Promise<StoredChallenge | null> {
  const kv = await getChallengeKv();
  const key = sanitizeKey(challengeKey);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return null;
    }

    const challenge = JSON.parse(
      textDecoder.decode(entry.value)
    ) as StoredChallenge;

    // Delete after retrieval (one-time use)
    await kv.delete(key);

    return challenge;
  } catch (error) {
    // Key not found or other error
    return null;
  }
}

/**
 * Check if challenge exists (without consuming it)
 */
export async function hasChallenge(challengeKey: string): Promise<boolean> {
  const kv = await getChallengeKv();
  const key = sanitizeKey(challengeKey);

  try {
    const entry = await kv.get(key);
    return entry !== null && entry.value !== null;
  } catch {
    return false;
  }
}

// ============================================================
// Rate Limit Store Interface
// ============================================================

/**
 * Compute window number for a given timestamp and window size
 * This creates discrete time windows (e.g., window 0, 1, 2...)
 */
function getWindowNumber(windowMs: number): number {
  return Math.floor(Date.now() / windowMs);
}

/**
 * Build a rate limit key that includes the window number
 * Format: {hashedIp}:{windowNumber}
 * Keys for old windows automatically expire via KV TTL
 */
function buildRateLimitKey(ip: string, windowMs: number): string {
  const hashedIp = hashIp(ip);
  const windowNum = getWindowNumber(windowMs);
  return `${hashedIp}_${windowNum}`;
}

/**
 * Increment rate limit count for an IP (hashed for privacy)
 * Uses window-based keys - TTL automatically expires old windows
 * Returns the new count and whether the limit was exceeded
 */
export async function incrementRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number
): Promise<{ count: number; exceeded: boolean }> {
  const kv = await getRateLimitKv();
  const key = buildRateLimitKey(ip, windowMs);

  try {
    const entry = await kv.get(key);
    let count: number;

    if (!entry || !entry.value) {
      // First request in this window
      count = 1;
    } else {
      // Increment existing count
      count = JSON.parse(textDecoder.decode(entry.value)) + 1;
    }

    // Store just the count - TTL handles expiry
    await kv.put(key, textEncoder.encode(JSON.stringify(count)));

    return {
      count,
      exceeded: count > maxRequests,
    };
  } catch (error) {
    logger.error({ err: error }, "Rate limit increment error");
    // On error, allow the request (fail open)
    return { count: 1, exceeded: false };
  }
}

// ============================================================
// Queue Token Store Interface
// ============================================================

import type { QueueToken, QueueTokenStatus } from "../../shared/types.js";

/**
 * Generate a cryptographically secure queue token ID
 */
export function generateQueueTokenId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Build a queue token key for storage
 * Format: {dropId}_{tokenId}
 */
function buildQueueTokenKey(dropId: string, tokenId: string): string {
  return sanitizeKey(`${dropId}_${tokenId}`);
}

/**
 * Build an index key for fingerprint counting
 * Format: fp_{dropId}_{fingerprint}
 */
function buildFingerprintIndexKey(dropId: string, fingerprint: string): string {
  return sanitizeKey(`fp_${dropId}_${fingerprint}`);
}

/**
 * Build an index key for IP counting
 * Format: ip_{dropId}_{ipHash}
 */
function buildIpIndexKey(dropId: string, ipHash: string): string {
  return sanitizeKey(`ip_${dropId}_${ipHash}`);
}

/**
 * Build a position counter key for a drop
 * Format: pos_{dropId}
 */
function buildPositionCounterKey(dropId: string): string {
  return sanitizeKey(`pos_${dropId}`);
}

/**
 * Build a ready count key for a drop
 * Format: ready_{dropId}
 */
function buildReadyCountKey(dropId: string): string {
  return sanitizeKey(`ready_${dropId}`);
}

/**
 * Store a queue token
 */
export async function storeQueueToken(token: QueueToken): Promise<void> {
  const kv = await getQueueTokenKv();
  const key = buildQueueTokenKey(token.dropId, token.token);
  await kv.put(key, textEncoder.encode(JSON.stringify(token)));
}

/**
 * Get a queue token by ID
 */
export async function getQueueToken(
  dropId: string,
  tokenId: string
): Promise<QueueToken | null> {
  const kv = await getQueueTokenKv();
  const key = buildQueueTokenKey(dropId, tokenId);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return null;
    }

    return JSON.parse(textDecoder.decode(entry.value)) as QueueToken;
  } catch {
    return null;
  }
}

/**
 * Update a queue token's status
 */
export async function updateQueueTokenStatus(
  dropId: string,
  tokenId: string,
  status: QueueTokenStatus,
  readyAt?: number,
  expiresAt?: number
): Promise<QueueToken | null> {
  const kv = await getQueueTokenKv();
  const key = buildQueueTokenKey(dropId, tokenId);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return null;
    }

    const token = JSON.parse(textDecoder.decode(entry.value)) as QueueToken;
    token.status = status;
    if (readyAt !== undefined) {
      token.readyAt = readyAt;
    }
    if (expiresAt !== undefined) {
      token.expiresAt = expiresAt;
    }

    await kv.put(key, textEncoder.encode(JSON.stringify(token)));
    return token;
  } catch (error) {
    logger.error({ err: error }, "Failed to update queue token status");
    return null;
  }
}

/**
 * Get and invalidate a queue token (one-time use)
 * Marks token as "used" and returns it
 */
export async function getAndInvalidateQueueToken(
  dropId: string,
  tokenId: string
): Promise<QueueToken | null> {
  const kv = await getQueueTokenKv();
  const key = buildQueueTokenKey(dropId, tokenId);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return null;
    }

    const token = JSON.parse(textDecoder.decode(entry.value)) as QueueToken;

    // Mark as used
    token.status = "used";
    await kv.put(key, textEncoder.encode(JSON.stringify(token)));

    return token;
  } catch (error) {
    logger.error({ err: error }, "Failed to invalidate queue token");
    return null;
  }
}

/**
 * Get next position number for a drop (atomic increment)
 */
export async function getNextQueuePosition(dropId: string): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildPositionCounterKey(dropId);

  try {
    const entry = await kv.get(key);
    let position: number;

    if (!entry || !entry.value) {
      position = 1;
    } else {
      position = JSON.parse(textDecoder.decode(entry.value)) + 1;
    }

    await kv.put(key, textEncoder.encode(JSON.stringify(position)));
    return position;
  } catch (error) {
    logger.error({ err: error }, "Failed to get next queue position");
    // Return a high number to avoid conflicts
    return Date.now();
  }
}

/**
 * Increment count of tokens for a fingerprint
 * Returns the new count
 */
export async function incrementFingerprintCount(
  dropId: string,
  fingerprint: string
): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildFingerprintIndexKey(dropId, fingerprint);

  try {
    const entry = await kv.get(key);
    let count: number;

    if (!entry || !entry.value) {
      count = 1;
    } else {
      count = JSON.parse(textDecoder.decode(entry.value)) + 1;
    }

    await kv.put(key, textEncoder.encode(JSON.stringify(count)));
    return count;
  } catch (error) {
    logger.error({ err: error }, "Failed to increment fingerprint count");
    return 1;
  }
}

/**
 * Get count of tokens for a fingerprint
 */
export async function getFingerprintCount(
  dropId: string,
  fingerprint: string
): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildFingerprintIndexKey(dropId, fingerprint);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return 0;
    }
    return JSON.parse(textDecoder.decode(entry.value));
  } catch {
    return 0;
  }
}

/**
 * Increment count of tokens for an IP
 * Returns the new count
 */
export async function incrementIpCount(
  dropId: string,
  ipHash: string
): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildIpIndexKey(dropId, ipHash);

  try {
    const entry = await kv.get(key);
    let count: number;

    if (!entry || !entry.value) {
      count = 1;
    } else {
      count = JSON.parse(textDecoder.decode(entry.value)) + 1;
    }

    await kv.put(key, textEncoder.encode(JSON.stringify(count)));
    return count;
  } catch (error) {
    logger.error({ err: error }, "Failed to increment IP count");
    return 1;
  }
}

/**
 * Get count of tokens for an IP
 */
export async function getIpCount(
  dropId: string,
  ipHash: string
): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildIpIndexKey(dropId, ipHash);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return 0;
    }
    return JSON.parse(textDecoder.decode(entry.value));
  } catch {
    return 0;
  }
}

/**
 * Get and increment ready count for a drop
 * Returns the new count
 */
export async function incrementReadyCount(dropId: string): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildReadyCountKey(dropId);

  try {
    const entry = await kv.get(key);
    let count: number;

    if (!entry || !entry.value) {
      count = 1;
    } else {
      count = JSON.parse(textDecoder.decode(entry.value)) + 1;
    }

    await kv.put(key, textEncoder.encode(JSON.stringify(count)));
    return count;
  } catch (error) {
    logger.error({ err: error }, "Failed to increment ready count");
    return 1;
  }
}

/**
 * Decrement ready count for a drop (when token is used or expires)
 * Returns the new count
 */
export async function decrementReadyCount(dropId: string): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildReadyCountKey(dropId);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return 0;
    }

    const count = Math.max(0, JSON.parse(textDecoder.decode(entry.value)) - 1);
    await kv.put(key, textEncoder.encode(JSON.stringify(count)));
    return count;
  } catch (error) {
    logger.error({ err: error }, "Failed to decrement ready count");
    return 0;
  }
}

/**
 * Get current ready count for a drop
 */
export async function getReadyCount(dropId: string): Promise<number> {
  const kv = await getQueueTokenKv();
  const key = buildReadyCountKey(dropId);

  try {
    const entry = await kv.get(key);
    if (!entry || !entry.value) {
      return 0;
    }
    return JSON.parse(textDecoder.decode(entry.value));
  } catch {
    return 0;
  }
}

/**
 * Hash IP for queue token storage (exported for use in routes)
 */
export function hashIpForQueue(ip: string): string {
  return hashIp(ip);
}

// ============================================================
// Drops Index (for homepage listing)
// ============================================================

export type DropIndexEntry = {
  dropId: string;
  createdAt: number;
  registrationStart: number;
  registrationEnd: number;
  purchaseWindow: number;
};

export async function upsertDropIndex(entry: DropIndexEntry): Promise<void> {
  const kv = await getDropsIndexKv();
  await kv.put(entry.dropId, textEncoder.encode(JSON.stringify(entry)));
}

export async function deleteDropIndex(dropId: string): Promise<void> {
  const kv = await getDropsIndexKv();
  try {
    await kv.delete(dropId);
  } catch {
    // best-effort
  }
}

export async function listDropIndexIds(): Promise<string[]> {
  const kv = await getDropsIndexKv();
  const iter = await kv.keys();
  const keys: string[] = [];
  if (iter) {
    for await (const k of iter) {
      keys.push(k);
    }
  }
  return keys;
}

// ============================================================
// Monitoring (TTL handles expiry automatically)
// ============================================================

let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Get bucket statistics for monitoring
 */
export async function getBucketStats(): Promise<{
  challenges: { keys: number } | null;
  rateLimits: { keys: number } | null;
  queueTokens: { keys: number } | null;
}> {
  const stats = {
    challenges: null as { keys: number } | null,
    rateLimits: null as { keys: number } | null,
    queueTokens: null as { keys: number } | null,
  };

  try {
    const challengeBucket = await getChallengeKv();
    const challengeStatus = await challengeBucket.status();
    stats.challenges = {
      keys: challengeStatus.values,
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to get challenge bucket stats");
  }

  try {
    const rateLimitBucket = await getRateLimitKv();
    const rateLimitStatus = await rateLimitBucket.status();
    stats.rateLimits = {
      keys: rateLimitStatus.values,
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to get rate limit bucket stats");
  }

  try {
    const queueTokenBucket = await getQueueTokenKv();
    const queueTokenStatus = await queueTokenBucket.status();
    stats.queueTokens = {
      keys: queueTokenStatus.values,
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to get queue token bucket stats");
  }

  return stats;
}

/**
 * Start periodic stats logging for monitoring
 * Note: NATS KV TTL handles expiry automatically - this is just for observability
 */
export function startPeriodicMonitoring(intervalMs?: number): void {
  const interval = intervalMs ?? config.maintenance.cleanupIntervalMs;

  if (monitoringInterval) {
    logger.info("NATS KV: Periodic monitoring already running");
    return;
  }

  monitoringInterval = setInterval(async () => {
    try {
      const stats = await getBucketStats();
      logger.info({ stats }, "NATS KV: Bucket stats");
    } catch (error) {
      logger.error({ err: error }, "NATS KV: Stats check error");
    }
  }, interval);

  // Don't prevent process exit
  monitoringInterval.unref();

  logger.info(
    { intervalSecs: interval / 1000 },
    "NATS KV: Started periodic monitoring"
  );
}

/**
 * Stop periodic monitoring
 */
export function stopPeriodicMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info("NATS KV: Stopped periodic monitoring");
  }
}

// Backwards compatibility aliases
export const startPeriodicCleanup = startPeriodicMonitoring;
export const stopPeriodicCleanup = stopPeriodicMonitoring;

/**
 * Initialize NATS KV stores (call on startup)
 * Optionally starts periodic monitoring (TTL handles expiry automatically)
 */
export async function initNatsKv(options?: {
  enablePeriodicCleanup?: boolean; // kept for backwards compatibility
  enablePeriodicMonitoring?: boolean;
  cleanupIntervalMs?: number; // kept for backwards compatibility
  monitoringIntervalMs?: number;
}): Promise<void> {
  await getChallengeKv();
  await getRateLimitKv();
  await getQueueTokenKv();

  const enableMonitoring =
    options?.enablePeriodicMonitoring ??
    options?.enablePeriodicCleanup ??
    config.maintenance.enableCleanup;

  if (enableMonitoring) {
    const interval =
      options?.monitoringIntervalMs ?? options?.cleanupIntervalMs;
    startPeriodicMonitoring(interval);
  }
}

/**
 * Graceful shutdown - stop monitoring and close connections
 */
export async function shutdownNatsKv(): Promise<void> {
  stopPeriodicMonitoring();

  if (nc) {
    await nc.drain();
    logger.info("NATS KV: Connection drained and closed");
  }
}
