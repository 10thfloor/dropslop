/**
 * Property-Based Tests for Feature Extractor
 *
 * Uses fast-check to verify correctness properties of the feature extraction logic.
 * Run with: npx vitest run tests/unit/feature-extractor.property.test.ts
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  extractFeatures,
  getFeatureDefaults,
} from "../../src/lib/ml/feature-extractor.js";
import { FEATURE_COUNT, FeatureIndex } from "../../src/lib/ml/types.js";
import type { QueueBehaviorSignals } from "../../shared/types.js";
import type { BotValidationRequest } from "../../src/lib/types.js";

// ============================================================
// Generators for valid input types
// ============================================================

/**
 * Generator for valid QueueBehaviorSignals
 */
const queueBehaviorSignalsArb: fc.Arbitrary<QueueBehaviorSignals> = fc.record({
  mouseMovements: fc.integer({ min: 0, max: 10000 }),
  scrollEvents: fc.integer({ min: 0, max: 1000 }),
  keyPresses: fc.integer({ min: 0, max: 1000 }),
  focusBlurEvents: fc.integer({ min: 0, max: 100 }),
  visibilityChanges: fc.integer({ min: 0, max: 100 }),
  timeOnPage: fc.integer({ min: 0, max: 3600000 }), // Up to 1 hour
  interactionPatterns: fc.oneof(
    fc.constant("{}"),
    fc.constant('{"hasVariance":true}'),
    fc.constant('{"hasAcceleration":true}'),
    fc.constant('{"hasVariance":true,"hasAcceleration":true}'),
    fc.constant('{"variance":25}'),
    fc.constant('{"movementComplexity":10}'),
    fc.json()
  ),
});

/**
 * Generator for valid BotValidationRequest
 */
const botValidationRequestArb: fc.Arbitrary<BotValidationRequest> = fc.record({
  fingerprint: fc.string({ minLength: 4, maxLength: 64 }),
  fingerprintConfidence: fc.integer({ min: 0, max: 100 }),
  timingMs: fc.integer({ min: 0, max: 60000 }),
  powSolution: fc.string(),
  powChallenge: fc.string(),
});

/**
 * Generator for partially valid/invalid QueueBehaviorSignals
 * Includes edge cases like undefined, null, NaN, Infinity
 */
const partialBehaviorSignalsArb: fc.Arbitrary<Partial<QueueBehaviorSignals> | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({
    mouseMovements: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    scrollEvents: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    keyPresses: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    focusBlurEvents: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    visibilityChanges: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    timeOnPage: fc.oneof(fc.integer(), fc.constant(undefined as unknown as number)),
    interactionPatterns: fc.oneof(fc.string(), fc.constant(undefined as unknown as string)),
  })
);

/**
 * Generator for partially valid/invalid BotValidationRequest
 */
const partialBotValidationArb: fc.Arbitrary<Partial<BotValidationRequest> | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({
    fingerprint: fc.oneof(fc.string(), fc.constant(undefined as unknown as string)),
    fingerprintConfidence: fc.oneof(
      fc.integer({ min: -100, max: 200 }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(undefined as unknown as number)
    ),
    timingMs: fc.oneof(
      fc.integer({ min: -1000, max: 100000 }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(undefined as unknown as number)
    ),
    powSolution: fc.oneof(fc.string(), fc.constant(undefined as unknown as string)),
    powChallenge: fc.oneof(fc.string(), fc.constant(undefined as unknown as string)),
  })
);

// ============================================================
// Property Tests
// ============================================================

describe("Feature Extractor Property Tests", () => {
  /**
   * **Feature: ml-bot-detection, Property 3: Feature vector fixed length**
   * **Validates: Requirements 2.5**
   *
   * *For any* valid or partially valid input (behavioral signals, bot validation request),
   * the Feature Extractor SHALL produce a feature vector of exactly FEATURE_COUNT (10) elements.
   */
  describe("Property 3: Feature vector fixed length", () => {
    it("should always produce exactly FEATURE_COUNT elements for valid inputs", () => {
      fc.assert(
        fc.property(
          queueBehaviorSignalsArb,
          botValidationRequestArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(behaviorSignals, botValidation);
            expect(features).toHaveLength(FEATURE_COUNT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should always produce exactly FEATURE_COUNT elements for partial/invalid inputs", () => {
      fc.assert(
        fc.property(
          partialBehaviorSignalsArb,
          partialBotValidationArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(
              behaviorSignals as QueueBehaviorSignals | undefined,
              botValidation as BotValidationRequest | undefined
            );
            expect(features).toHaveLength(FEATURE_COUNT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should produce exactly FEATURE_COUNT elements when both inputs are undefined", () => {
      const features = extractFeatures(undefined, undefined);
      expect(features).toHaveLength(FEATURE_COUNT);
    });

    it("should produce exactly FEATURE_COUNT elements for getFeatureDefaults", () => {
      const defaults = getFeatureDefaults();
      expect(defaults).toHaveLength(FEATURE_COUNT);
    });
  });

  /**
   * **Feature: ml-bot-detection, Property 4: Feature extraction completeness**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * *For any* request containing behavioral signals, fingerprint data, and PoW data,
   * the Feature Extractor SHALL include all specified features in the output vector.
   */
  describe("Property 4: Feature extraction completeness", () => {
    it("should include all behavioral features from input", () => {
      fc.assert(
        fc.property(
          queueBehaviorSignalsArb,
          botValidationRequestArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(behaviorSignals, botValidation);

            // Behavioral features should be extracted (Requirements 2.1)
            expect(features[FeatureIndex.MOUSE_MOVEMENTS]).toBe(behaviorSignals.mouseMovements);
            expect(features[FeatureIndex.SCROLL_EVENTS]).toBe(behaviorSignals.scrollEvents);
            expect(features[FeatureIndex.KEY_PRESSES]).toBe(behaviorSignals.keyPresses);
            expect(features[FeatureIndex.FOCUS_BLUR_EVENTS]).toBe(behaviorSignals.focusBlurEvents);
            expect(features[FeatureIndex.VISIBILITY_CHANGES]).toBe(behaviorSignals.visibilityChanges);
            expect(features[FeatureIndex.TIME_ON_PAGE_MS]).toBe(behaviorSignals.timeOnPage);
            // Interaction variance is computed, just verify it's a number
            expect(typeof features[FeatureIndex.INTERACTION_VARIANCE]).toBe("number");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include fingerprint features from input (Requirements 2.2)", () => {
      fc.assert(
        fc.property(
          queueBehaviorSignalsArb,
          botValidationRequestArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(behaviorSignals, botValidation);

            // Fingerprint confidence should be clamped to 0-100
            const expectedConfidence = Math.max(0, Math.min(100, botValidation.fingerprintConfidence));
            expect(features[FeatureIndex.FINGERPRINT_CONFIDENCE]).toBe(expectedConfidence);

            // Timing should be extracted (clamped to >= 0)
            const expectedTiming = Math.max(0, botValidation.timingMs);
            expect(features[FeatureIndex.TIMING_MS]).toBe(expectedTiming);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include PoW solve time feature (Requirements 2.3)", () => {
      fc.assert(
        fc.property(
          queueBehaviorSignalsArb,
          botValidationRequestArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(behaviorSignals, botValidation);

            // PoW solve time is derived from timing (clamped to >= 0)
            const expectedPowTime = Math.max(0, botValidation.timingMs);
            expect(features[FeatureIndex.POW_SOLVE_TIME_MS]).toBe(expectedPowTime);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should produce all numeric values in the feature vector", () => {
      fc.assert(
        fc.property(
          queueBehaviorSignalsArb,
          botValidationRequestArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(behaviorSignals, botValidation);

            // All features should be finite numbers
            for (let i = 0; i < FEATURE_COUNT; i++) {
              expect(typeof features[i]).toBe("number");
              expect(Number.isFinite(features[i])).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ml-bot-detection, Property 5: Missing input defaults**
   * **Validates: Requirements 2.4**
   *
   * *For any* input with missing or invalid fields, the Feature Extractor SHALL produce
   * a valid feature vector using defined default values, and the output SHALL still
   * have exactly FEATURE_COUNT elements.
   */
  describe("Property 5: Missing input defaults", () => {
    it("should use defaults when behaviorSignals is undefined", () => {
      fc.assert(
        fc.property(botValidationRequestArb, (botValidation) => {
          const features = extractFeatures(undefined, botValidation);
          const defaults = getFeatureDefaults();

          // Behavioral features should use defaults
          expect(features[FeatureIndex.MOUSE_MOVEMENTS]).toBe(defaults[FeatureIndex.MOUSE_MOVEMENTS]);
          expect(features[FeatureIndex.SCROLL_EVENTS]).toBe(defaults[FeatureIndex.SCROLL_EVENTS]);
          expect(features[FeatureIndex.KEY_PRESSES]).toBe(defaults[FeatureIndex.KEY_PRESSES]);
          expect(features[FeatureIndex.FOCUS_BLUR_EVENTS]).toBe(defaults[FeatureIndex.FOCUS_BLUR_EVENTS]);
          expect(features[FeatureIndex.VISIBILITY_CHANGES]).toBe(defaults[FeatureIndex.VISIBILITY_CHANGES]);
          expect(features[FeatureIndex.TIME_ON_PAGE_MS]).toBe(defaults[FeatureIndex.TIME_ON_PAGE_MS]);
          expect(features[FeatureIndex.INTERACTION_VARIANCE]).toBe(defaults[FeatureIndex.INTERACTION_VARIANCE]);

          // Should still have correct length
          expect(features).toHaveLength(FEATURE_COUNT);
        }),
        { numRuns: 100 }
      );
    });

    it("should use defaults when botValidation is undefined", () => {
      fc.assert(
        fc.property(queueBehaviorSignalsArb, (behaviorSignals) => {
          const features = extractFeatures(behaviorSignals, undefined);
          const defaults = getFeatureDefaults();

          // Fingerprint and PoW features should use defaults
          expect(features[FeatureIndex.FINGERPRINT_CONFIDENCE]).toBe(defaults[FeatureIndex.FINGERPRINT_CONFIDENCE]);
          expect(features[FeatureIndex.TIMING_MS]).toBe(defaults[FeatureIndex.TIMING_MS]);
          expect(features[FeatureIndex.POW_SOLVE_TIME_MS]).toBe(defaults[FeatureIndex.POW_SOLVE_TIME_MS]);

          // Should still have correct length
          expect(features).toHaveLength(FEATURE_COUNT);
        }),
        { numRuns: 100 }
      );
    });

    it("should use defaults when both inputs are undefined", () => {
      const features = extractFeatures(undefined, undefined);
      const defaults = getFeatureDefaults();

      // All features should match defaults
      for (let i = 0; i < FEATURE_COUNT; i++) {
        expect(features[i]).toBe(defaults[i]);
      }
    });

    it("should produce valid finite numbers even with invalid input values", () => {
      fc.assert(
        fc.property(
          partialBehaviorSignalsArb,
          partialBotValidationArb,
          (behaviorSignals, botValidation) => {
            const features = extractFeatures(
              behaviorSignals as QueueBehaviorSignals | undefined,
              botValidation as BotValidationRequest | undefined
            );

            // All features should be finite numbers regardless of input
            for (let i = 0; i < FEATURE_COUNT; i++) {
              expect(typeof features[i]).toBe("number");
              expect(Number.isFinite(features[i])).toBe(true);
            }

            // Should still have correct length
            expect(features).toHaveLength(FEATURE_COUNT);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
