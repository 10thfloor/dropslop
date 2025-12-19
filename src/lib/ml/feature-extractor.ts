/**
 * Feature Extractor for ML Bot Detection
 *
 * Transforms raw request data (behavioral signals, fingerprint, PoW) into
 * a fixed-length numeric feature vector for Isolation Forest input.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { QueueBehaviorSignals } from "../../../shared/types.js";
import type { BotValidationRequest } from "../types.js";
import {
  FEATURE_COUNT,
  FEATURE_DEFAULTS,
  FeatureIndex,
  type FeatureVector,
} from "./types.js";

/**
 * Extract features from behavioral signals, fingerprint, and PoW data.
 *
 * Produces a fixed-length numeric array suitable for ML model input.
 * Missing or invalid inputs are replaced with default values.
 *
 * @param behaviorSignals - User interaction data collected during queue wait
 * @param botValidation - Bot validation request containing fingerprint and PoW data
 * @returns Fixed-length numeric feature vector
 *
 * Requirements:
 * - 2.1: Extract behavioral signals (mouse, scroll, keys, focus, visibility, time, variance)
 * - 2.2: Extract fingerprint features (confidence, timing)
 * - 2.3: Extract PoW features (solve time - computed from timing)
 * - 2.4: Handle missing/invalid inputs with defaults
 * - 2.5: Produce fixed-length feature vector
 */
export function extractFeatures(
  behaviorSignals: QueueBehaviorSignals | undefined,
  botValidation: BotValidationRequest | undefined
): number[] {
  // Start with defaults
  const features: FeatureVector = { ...FEATURE_DEFAULTS };

  // Extract behavioral signals (Requirements 2.1, 2.4)
  if (behaviorSignals) {
    features.mouseMovements = safeNumber(
      behaviorSignals.mouseMovements,
      FEATURE_DEFAULTS.mouseMovements
    );
    features.scrollEvents = safeNumber(
      behaviorSignals.scrollEvents,
      FEATURE_DEFAULTS.scrollEvents
    );
    features.keyPresses = safeNumber(
      behaviorSignals.keyPresses,
      FEATURE_DEFAULTS.keyPresses
    );
    features.focusBlurEvents = safeNumber(
      behaviorSignals.focusBlurEvents,
      FEATURE_DEFAULTS.focusBlurEvents
    );
    features.visibilityChanges = safeNumber(
      behaviorSignals.visibilityChanges,
      FEATURE_DEFAULTS.visibilityChanges
    );
    features.timeOnPageMs = safeNumber(
      behaviorSignals.timeOnPage,
      FEATURE_DEFAULTS.timeOnPageMs
    );

    // Compute interaction variance from patterns (Requirement 2.1)
    features.interactionVariance = computeInteractionVariance(
      behaviorSignals.interactionPatterns
    );
  }

  // Extract fingerprint features (Requirements 2.2, 2.4)
  if (botValidation) {
    features.fingerprintConfidence = safeNumber(
      botValidation.fingerprintConfidence,
      FEATURE_DEFAULTS.fingerprintConfidence,
      0,
      100
    );
    features.timingMs = safeNumber(
      botValidation.timingMs,
      FEATURE_DEFAULTS.timingMs,
      0
    );

    // PoW solve time is approximated from timing (Requirement 2.3)
    // In practice, PoW solve time would be tracked separately
    // For now, we use timing as a proxy since it includes PoW solve time
    features.powSolveTimeMs = safeNumber(
      botValidation.timingMs,
      FEATURE_DEFAULTS.powSolveTimeMs,
      0
    );
  }

  // Convert to fixed-length array (Requirement 2.5)
  return featureVectorToArray(features);
}

/**
 * Get default feature values as an array.
 *
 * @returns Fixed-length array of default feature values
 */
export function getFeatureDefaults(): number[] {
  return featureVectorToArray(FEATURE_DEFAULTS);
}

/**
 * Convert a FeatureVector object to a fixed-length numeric array.
 *
 * The array indices match the FeatureIndex enum for consistent access.
 *
 * @param features - Structured feature vector
 * @returns Fixed-length numeric array
 */
export function featureVectorToArray(features: FeatureVector): number[] {
  const array = new Array<number>(FEATURE_COUNT);

  array[FeatureIndex.MOUSE_MOVEMENTS] = features.mouseMovements;
  array[FeatureIndex.SCROLL_EVENTS] = features.scrollEvents;
  array[FeatureIndex.KEY_PRESSES] = features.keyPresses;
  array[FeatureIndex.FOCUS_BLUR_EVENTS] = features.focusBlurEvents;
  array[FeatureIndex.VISIBILITY_CHANGES] = features.visibilityChanges;
  array[FeatureIndex.TIME_ON_PAGE_MS] = features.timeOnPageMs;
  array[FeatureIndex.INTERACTION_VARIANCE] = features.interactionVariance;
  array[FeatureIndex.FINGERPRINT_CONFIDENCE] = features.fingerprintConfidence;
  array[FeatureIndex.TIMING_MS] = features.timingMs;
  array[FeatureIndex.POW_SOLVE_TIME_MS] = features.powSolveTimeMs;

  return array;
}

/**
 * Convert a numeric array back to a FeatureVector object.
 *
 * Useful for debugging and logging.
 *
 * @param array - Numeric feature array
 * @returns Structured feature vector
 */
export function arrayToFeatureVector(array: number[]): FeatureVector {
  if (array.length !== FEATURE_COUNT) {
    throw new Error(
      `Invalid feature array length: expected ${FEATURE_COUNT}, got ${array.length}`
    );
  }

  return {
    mouseMovements: array[FeatureIndex.MOUSE_MOVEMENTS],
    scrollEvents: array[FeatureIndex.SCROLL_EVENTS],
    keyPresses: array[FeatureIndex.KEY_PRESSES],
    focusBlurEvents: array[FeatureIndex.FOCUS_BLUR_EVENTS],
    visibilityChanges: array[FeatureIndex.VISIBILITY_CHANGES],
    timeOnPageMs: array[FeatureIndex.TIME_ON_PAGE_MS],
    interactionVariance: array[FeatureIndex.INTERACTION_VARIANCE],
    fingerprintConfidence: array[FeatureIndex.FINGERPRINT_CONFIDENCE],
    timingMs: array[FeatureIndex.TIMING_MS],
    powSolveTimeMs: array[FeatureIndex.POW_SOLVE_TIME_MS],
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Safely convert a value to a number with bounds checking.
 *
 * @param value - Input value (may be undefined, null, or invalid)
 * @param defaultValue - Default to use if value is invalid
 * @param min - Optional minimum bound
 * @param max - Optional maximum bound
 * @returns Valid numeric value
 */
function safeNumber(
  value: unknown,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  // Handle undefined, null, or non-numeric values
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const num = typeof value === "number" ? value : Number(value);

  // Handle NaN or Infinity
  if (!Number.isFinite(num)) {
    return defaultValue;
  }

  // Apply bounds
  let result = num;
  if (min !== undefined && result < min) {
    result = min;
  }
  if (max !== undefined && result > max) {
    result = max;
  }

  return result;
}

/**
 * Compute interaction variance from JSON-encoded pattern data.
 *
 * The interactionPatterns field contains JSON with pattern metrics.
 * We extract variance indicators to produce a numeric score.
 *
 * @param patternsJson - JSON-encoded interaction patterns
 * @returns Variance score (0-100)
 */
function computeInteractionVariance(patternsJson: string | undefined): number {
  if (!patternsJson || patternsJson === "{}") {
    return FEATURE_DEFAULTS.interactionVariance;
  }

  try {
    const patterns = JSON.parse(patternsJson);
    let variance = 0;

    // Check for variance indicators
    if (patterns.hasVariance) {
      variance += 30;
    }
    if (patterns.hasAcceleration) {
      variance += 30;
    }

    // Check for numeric variance value if provided
    if (typeof patterns.variance === "number" && Number.isFinite(patterns.variance)) {
      // Normalize variance to 0-40 range and add to score
      variance += Math.min(40, Math.max(0, patterns.variance));
    }

    // Check for movement pattern complexity
    if (patterns.movementComplexity && typeof patterns.movementComplexity === "number") {
      variance += Math.min(20, patterns.movementComplexity);
    }

    return Math.min(100, variance);
  } catch {
    // Invalid JSON, return default
    return FEATURE_DEFAULTS.interactionVariance;
  }
}
