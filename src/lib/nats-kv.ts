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
// Monitoring (TTL handles expiry automatically)
// ============================================================

let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Get bucket statistics for monitoring
 */
export async function getBucketStats(): Promise<{
  challenges: { keys: number } | null;
  rateLimits: { keys: number } | null;
}> {
  const stats = {
    challenges: null as { keys: number } | null,
    rateLimits: null as { keys: number } | null,
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
