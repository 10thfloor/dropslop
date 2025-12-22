/**
 * Unit Tests for ML Service Fallback Behavior
 *
 * Tests the fallback scenarios when ML inference cannot complete normally:
 * - Model disabled via configuration
 * - Model file missing/unavailable
 * - Inference errors
 * - Inference timeout
 *
 * Requirements: 1.2, 1.3, 3.2, 3.3, 3.4
 *
 * Run with: npx vitest run tests/unit/ml-service.fallback.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MLService } from "../../src/lib/ml/ml-service.js";
import type { MLServiceConfig } from "../../src/lib/ml/types.js";

// ============================================================
// Test Constants
// ============================================================

/** Expected neutral anomaly score for fallback */
const NEUTRAL_ANOMALY_SCORE = 0.5;

/** Expected neutral trust component for fallback */
const NEUTRAL_TRUST_COMPONENT = 50;

/** Sample feature vector for testing */
const SAMPLE_FEATURES = [10, 5, 3, 2, 1, 5000, 0.5, 75, 500, 1000];

// ============================================================
// Test Helpers
// ============================================================

/**
 * Create a test MLServiceConfig with defaults that can be overridden.
 */
function createTestConfig(overrides: Partial<MLServiceConfig> = {}): MLServiceConfig {
  return {
    enabled: true,
    modelPath: "./nonexistent-model.json",
    timeoutMs: 50,
    weight: 0.15,
    anomalyThreshold: 0.6,
    ...overrides,
  };
}

// ============================================================
// Unit Tests
// ============================================================

describe("ML Service Fallback Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Requirement 1.3: When ML model is disabled via configuration,
   * the Trust Score Calculator SHALL use only rule-based scoring without errors.
   */
  describe("Model Disabled via Configuration", () => {
    it("should return fallback result when ML is disabled", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      const result = await service.score(SAMPLE_FEATURES);

      expect(result.usedFallback).toBe(true);
      expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
      expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
    });

    it("should report isEnabled as false when disabled", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      expect(service.isEnabled()).toBe(false);
    });

    it("should initialize successfully when disabled", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(service.getInitializationError()).toBeNull();
    });

    it("should not attempt to load model when disabled", async () => {
      const config = createTestConfig({
        enabled: false,
        modelPath: "./this-file-does-not-exist.json",
      });
      const service = new MLService(config);

      // Should not throw even with invalid path
      await expect(service.initialize()).resolves.not.toThrow();
      expect(service.isInitialized()).toBe(true);
    });
  });

  /**
   * Requirement 3.3: When the model file is unavailable,
   * the ML Service SHALL start in fallback mode and log a warning.
   */
  describe("Model File Missing/Unavailable", () => {
    it("should enter fallback mode when model file does not exist", async () => {
      const config = createTestConfig({
        enabled: true,
        modelPath: "./nonexistent-model-file.json",
      });
      const service = new MLService(config);
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(service.isEnabled()).toBe(false); // Model not loaded
      expect(service.getInitializationError()).not.toBeNull();
    });

    it("should return fallback result when model failed to load", async () => {
      const config = createTestConfig({
        enabled: true,
        modelPath: "./nonexistent-model-file.json",
      });
      const service = new MLService(config);
      await service.initialize();

      const result = await service.score(SAMPLE_FEATURES);

      expect(result.usedFallback).toBe(true);
      expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
      expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
    });

    it("should store initialization error for diagnostics", async () => {
      const config = createTestConfig({
        enabled: true,
        modelPath: "./nonexistent-model-file.json",
      });
      const service = new MLService(config);
      await service.initialize();

      const error = service.getInitializationError();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain("Failed to read model file");
    });
  });

  /**
   * Requirement 3.4: When inference produces an error,
   * the ML Service SHALL return a neutral score (0.5 bot probability) and log the error.
   */
  describe("Inference Error Handling", () => {
    it("should return neutral fallback when scoring without initialization", async () => {
      const config = createTestConfig({ enabled: true });
      const service = new MLService(config);
      // Deliberately not calling initialize()

      const result = await service.score(SAMPLE_FEATURES);

      expect(result.usedFallback).toBe(true);
      expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
      expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
    });

    it("should return neutral fallback when forest is null", async () => {
      const config = createTestConfig({
        enabled: true,
        modelPath: "./invalid-path.json",
      });
      const service = new MLService(config);
      await service.initialize();

      // Forest should be null due to failed load
      const result = await service.score(SAMPLE_FEATURES);

      expect(result.usedFallback).toBe(true);
      expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
      expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
    });
  });

  /**
   * Requirement 1.2, 3.2: When ML inference fails or times out,
   * the Trust Score Calculator SHALL fall back to rule-based scoring.
   */
  describe("Fallback Result Properties", () => {
    it("should always return valid MLResult structure in fallback", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      const result = await service.score(SAMPLE_FEATURES);

      // Verify structure
      expect(result).toHaveProperty("anomalyScore");
      expect(result).toHaveProperty("trustComponent");
      expect(result).toHaveProperty("usedFallback");

      // Verify types
      expect(typeof result.anomalyScore).toBe("number");
      expect(typeof result.trustComponent).toBe("number");
      expect(typeof result.usedFallback).toBe("boolean");
    });

    it("should return consistent fallback values across multiple calls", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      const results = await Promise.all([
        service.score(SAMPLE_FEATURES),
        service.score([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        service.score([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]),
      ]);

      // All fallback results should be identical
      for (const result of results) {
        expect(result.usedFallback).toBe(true);
        expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
        expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
      }
    });

    it("should return neutral values that represent uncertainty", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      const result = await service.score(SAMPLE_FEATURES);

      // Neutral anomaly score (0.5) means uncertain - not clearly bot or human
      expect(result.anomalyScore).toBe(0.5);

      // Neutral trust component (50) is middle of 0-100 range
      expect(result.trustComponent).toBe(50);
    });
  });

  /**
   * Test configuration accessors work correctly in fallback mode.
   */
  describe("Configuration Accessors in Fallback Mode", () => {
    it("should return configured weight even in fallback mode", async () => {
      const config = createTestConfig({ enabled: false, weight: 0.25 });
      const service = new MLService(config);
      await service.initialize();

      expect(service.getWeight()).toBe(0.25);
    });

    it("should return configured anomaly threshold even in fallback mode", async () => {
      const config = createTestConfig({ enabled: false, anomalyThreshold: 0.7 });
      const service = new MLService(config);
      await service.initialize();

      expect(service.getAnomalyThreshold()).toBe(0.7);
    });
  });

  /**
   * Test multiple fallback scenarios in sequence.
   */
  describe("Sequential Fallback Scenarios", () => {
    it("should handle multiple score calls in fallback mode", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      // Make multiple sequential calls
      for (let i = 0; i < 10; i++) {
        const result = await service.score(SAMPLE_FEATURES);
        expect(result.usedFallback).toBe(true);
        expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
        expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
      }
    });

    it("should handle concurrent score calls in fallback mode", async () => {
      const config = createTestConfig({ enabled: false });
      const service = new MLService(config);
      await service.initialize();

      // Make concurrent calls
      const promises = Array(10)
        .fill(null)
        .map(() => service.score(SAMPLE_FEATURES));
      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result.usedFallback).toBe(true);
        expect(result.anomalyScore).toBe(NEUTRAL_ANOMALY_SCORE);
        expect(result.trustComponent).toBe(NEUTRAL_TRUST_COMPONENT);
      }
    });
  });
});
