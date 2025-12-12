/**
 * Behavioral signal scoring for bot detection
 *
 * Scores user behavior collected during queue wait to distinguish
 * humans from bots. Higher scores indicate more human-like behavior.
 *
 * Score components:
 * - Mouse movements: Bots often have none or perfectly linear paths
 * - Scroll events: Humans browse, bots don't
 * - Focus/blur: Humans switch tabs, bots typically don't
 * - Visibility changes: Humans minimize/switch, bots don't care
 * - Time on page: Bots rush, humans read
 * - Key presses: Indicates interaction depth
 */

import type { QueueBehaviorSignals } from "../../shared/types.js";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const logger = createLogger("behavior-score");

/**
 * Score behavioral signals (0-100)
 *
 * Returns a score indicating how human-like the behavior is.
 * Higher scores = more likely human.
 */
export function scoreBehavior(signals: QueueBehaviorSignals): number {
  let score = 0;

  // Mouse movements (max 30 points)
  // Bots often have none or perfectly linear movements
  if (signals.mouseMovements > 0) {
    score += 10; // Any movement is good
  }
  if (signals.mouseMovements > 5) {
    score += 10; // Multiple movements
  }
  if (signals.mouseMovements > 20) {
    score += 10; // Natural browsing level
  }

  // Scroll events (max 15 points)
  // Humans naturally scroll to read content
  if (signals.scrollEvents > 0) {
    score += 10;
  }
  if (signals.scrollEvents > 3) {
    score += 5;
  }

  // Focus/blur events (max 10 points)
  // Humans often switch tabs, bots typically don't
  if (signals.focusBlurEvents > 0) {
    score += 5;
  }
  if (signals.focusBlurEvents > 2) {
    score += 5;
  }

  // Visibility changes (max 10 points)
  // Page becoming hidden/visible indicates real browser use
  if (signals.visibilityChanges > 0) {
    score += 5;
  }
  if (signals.visibilityChanges > 1) {
    score += 5;
  }

  // Time on page (max 25 points)
  // Bots rush through, humans spend time
  const timeSeconds = signals.timeOnPage / 1000;
  if (timeSeconds > 3) {
    score += 10; // At least a few seconds
  }
  if (timeSeconds > 10) {
    score += 10; // Reasonable reading time
  }
  if (timeSeconds > 30) {
    score += 5; // Extended engagement
  }

  // Key presses (max 10 points)
  // Any keyboard interaction shows engagement
  if (signals.keyPresses > 0) {
    score += 5;
  }
  if (signals.keyPresses > 5) {
    score += 5;
  }

  // Bonus for interaction patterns (if provided)
  // This is JSON-encoded pattern data for advanced analysis
  if (signals.interactionPatterns && signals.interactionPatterns !== "{}") {
    try {
      const patterns = JSON.parse(signals.interactionPatterns);
      // Check for human-like patterns (can be extended)
      if (patterns.hasVariance) {
        score += 5; // Movement variance indicates natural behavior
      }
      if (patterns.hasAcceleration) {
        score += 5; // Acceleration patterns indicate human mouse control
      }
    } catch {
      // Invalid pattern data, ignore
    }
  }

  // Cap at 100
  return Math.min(100, score);
}

/**
 * Detailed breakdown of behavior score for debugging/logging
 */
export interface BehaviorScoreBreakdown {
  total: number;
  mouseScore: number;
  scrollScore: number;
  focusScore: number;
  visibilityScore: number;
  timeScore: number;
  keyScore: number;
  patternBonus: number;
  passed: boolean;
}

/**
 * Get detailed breakdown of behavior score
 */
export function getBehaviorScoreBreakdown(
  signals: QueueBehaviorSignals
): BehaviorScoreBreakdown {
  let mouseScore = 0;
  let scrollScore = 0;
  let focusScore = 0;
  let visibilityScore = 0;
  let timeScore = 0;
  let keyScore = 0;
  let patternBonus = 0;

  // Mouse movements
  if (signals.mouseMovements > 0) mouseScore += 10;
  if (signals.mouseMovements > 5) mouseScore += 10;
  if (signals.mouseMovements > 20) mouseScore += 10;

  // Scroll events
  if (signals.scrollEvents > 0) scrollScore += 10;
  if (signals.scrollEvents > 3) scrollScore += 5;

  // Focus/blur events
  if (signals.focusBlurEvents > 0) focusScore += 5;
  if (signals.focusBlurEvents > 2) focusScore += 5;

  // Visibility changes
  if (signals.visibilityChanges > 0) visibilityScore += 5;
  if (signals.visibilityChanges > 1) visibilityScore += 5;

  // Time on page
  const timeSeconds = signals.timeOnPage / 1000;
  if (timeSeconds > 3) timeScore += 10;
  if (timeSeconds > 10) timeScore += 10;
  if (timeSeconds > 30) timeScore += 5;

  // Key presses
  if (signals.keyPresses > 0) keyScore += 5;
  if (signals.keyPresses > 5) keyScore += 5;

  // Interaction patterns
  if (signals.interactionPatterns && signals.interactionPatterns !== "{}") {
    try {
      const patterns = JSON.parse(signals.interactionPatterns);
      if (patterns.hasVariance) patternBonus += 5;
      if (patterns.hasAcceleration) patternBonus += 5;
    } catch {
      // Invalid pattern data
    }
  }

  const total = Math.min(
    100,
    mouseScore +
      scrollScore +
      focusScore +
      visibilityScore +
      timeScore +
      keyScore +
      patternBonus
  );

  return {
    total,
    mouseScore,
    scrollScore,
    focusScore,
    visibilityScore,
    timeScore,
    keyScore,
    patternBonus,
    passed: total >= config.queue.minBehaviorScore,
  };
}

/**
 * Check if behavioral signals meet minimum threshold
 */
export function validateBehavior(signals: QueueBehaviorSignals): {
  valid: boolean;
  score: number;
  reason?: string;
} {
  const score = scoreBehavior(signals);
  const minScore = config.queue.minBehaviorScore;

  if (score < minScore) {
    logger.debug(
      {
        score,
        minScore,
        signals: {
          mouse: signals.mouseMovements,
          scroll: signals.scrollEvents,
          focus: signals.focusBlurEvents,
          time: signals.timeOnPage,
        },
      },
      "Behavior score below threshold"
    );

    return {
      valid: false,
      score,
      reason: `Behavior score ${score} below minimum ${minScore}`,
    };
  }

  return { valid: true, score };
}

/**
 * Create default (empty) behavior signals
 */
export function createEmptyBehaviorSignals(): QueueBehaviorSignals {
  return {
    mouseMovements: 0,
    scrollEvents: 0,
    keyPresses: 0,
    focusBlurEvents: 0,
    visibilityChanges: 0,
    timeOnPage: 0,
    interactionPatterns: "{}",
  };
}

