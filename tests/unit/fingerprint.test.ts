/**
 * Unit tests for fingerprint/bot detection utilities
 *
 * Run with: npx tsx tests/unit/fingerprint.test.ts
 */

import {
  calculateTimingScore,
  validateFingerprint,
  calculateTrustScore,
} from "../../src/lib/fingerprint.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log("\n🤖 Fingerprint/Bot Detection Unit Tests\n");
  console.log("=".repeat(50));

  // ==========================================
  // calculateTimingScore
  // ==========================================
  console.log("\n📋 calculateTimingScore:\n");

  // Test 1: Very fast = likely bot
  {
    const score = calculateTimingScore(50);
    assert(score === 0, "Very fast timing (50ms) should score 0 (bot)");
  }

  // Test 2: Fast boundary
  {
    const score = calculateTimingScore(199);
    assert(score === 0, "Timing < 200ms should score 0");
  }

  // Test 3: Fast but possible
  {
    const score = calculateTimingScore(500);
    assert(score === 50, "Timing 200-1000ms should score 50");
  }

  // Test 4: Optimal human range (1-5 seconds)
  {
    const score1 = calculateTimingScore(1000);
    const score2 = calculateTimingScore(3000);
    const score3 = calculateTimingScore(5000);
    
    assert(score1 === 100, "1000ms should score 100");
    assert(score2 === 100, "3000ms should score 100");
    assert(score3 === 100, "5000ms should score 100");
  }

  // Test 5: Still reasonable (5-10 seconds)
  {
    const score = calculateTimingScore(7000);
    assert(score === 80, "7000ms should score 80");
  }

  // Test 6: Very slow
  {
    const score = calculateTimingScore(15000);
    assert(score === 60, "15000ms should score 60");
  }

  // ==========================================
  // validateFingerprint (without API key)
  // ==========================================
  console.log("\n📋 validateFingerprint (no API key):\n");

  // Test 7: Valid fingerprint with high confidence
  {
    const result = await validateFingerprint("valid-visitor-id-123", 95);
    assert(result.valid === true, "High confidence fingerprint should be valid");
    assert(result.confidence === 95, "Confidence should be preserved");
  }

  // Test 8: Valid fingerprint with low confidence
  {
    const result = await validateFingerprint("valid-visitor-id-123", 30);
    // Default minTrustScore is 50
    assert(result.valid === false, "Low confidence should fail");
  }

  // Test 9: Short fingerprint (invalid format)
  {
    const result = await validateFingerprint("abc", 95);
    assert(result.valid === false, "Short fingerprint should fail (< 4 chars)");
  }

  // Test 10: Empty fingerprint
  {
    const result = await validateFingerprint("", 95);
    assert(result.valid === false, "Empty fingerprint should fail");
  }

  // ==========================================
  // calculateTrustScore
  // ==========================================
  console.log("\n📋 calculateTrustScore:\n");

  // Test 11: Perfect scores
  {
    const result = await calculateTrustScore(
      {
        fingerprint: "valid-fingerprint-id",
        fingerprintConfidence: 100,
        timingMs: 2000, // Optimal timing
        powSolution: "ignored",
        powChallenge: "ignored",
      },
      true // PoW verified
    );
    
    // Trust = 100*0.4 + 100*0.3 + 100*0.3 = 100
    assert(result.trustScore === 100, "Perfect inputs should score 100");
    assert(result.allowed === true, "Perfect score should be allowed");
  }

  // Test 12: PoW not verified = rejected
  {
    const result = await calculateTrustScore(
      {
        fingerprint: "valid-fingerprint-id",
        fingerprintConfidence: 100,
        timingMs: 2000,
        powSolution: "ignored",
        powChallenge: "ignored",
      },
      false // PoW NOT verified
    );
    
    assert(result.allowed === false, "Unverified PoW should be rejected");
    assert(result.reason === "PoW not verified", "Reason should be PoW");
  }

  // Test 13: Bot-like timing
  {
    const result = await calculateTrustScore(
      {
        fingerprint: "valid-fingerprint-id",
        fingerprintConfidence: 100,
        timingMs: 50, // Bot-like
        powSolution: "ignored",
        powChallenge: "ignored",
      },
      true
    );
    
    // Trust = 100*0.4 + 0*0.3 + 100*0.3 = 70
    assert(result.trustScore === 70, "Bot timing should reduce score to 70");
  }

  // Test 14: Invalid fingerprint = rejected regardless of score
  {
    const result = await calculateTrustScore(
      {
        fingerprint: "ab", // Too short
        fingerprintConfidence: 100,
        timingMs: 2000,
        powSolution: "ignored",
        powChallenge: "ignored",
      },
      true
    );
    
    assert(result.allowed === false, "Invalid fingerprint should be rejected");
    assert(result.reason === "Invalid fingerprint", "Reason should be fingerprint");
  }

  // Test 15: Boundary trust score
  {
    const result = await calculateTrustScore(
      {
        fingerprint: "valid-fingerprint-id",
        fingerprintConfidence: 50, // Minimum acceptable
        timingMs: 2000,
        powSolution: "ignored",
        powChallenge: "ignored",
      },
      true
    );
    
    // Trust = 50*0.4 + 100*0.3 + 100*0.3 = 20 + 30 + 30 = 80
    assert(result.trustScore === 80, "Boundary confidence should give 80");
    assert(result.allowed === true, "Should be allowed at boundary");
  }

  // Test 16: Confidence passthrough (no API key = no server validation)
  // Note: When API key is not set, confidence is passed through as-is
  // In production with API key, confidence would be normalized
  {
    const result = await validateFingerprint("valid-id-1234", 150);
    // Without API key, confidence is passed through (would be clamped with API)
    assert(result.confidence === 150, "Without API key, confidence is passed through");
    assert(result.valid === true, "High confidence should still be valid");
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ All fingerprint tests passed!\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});

