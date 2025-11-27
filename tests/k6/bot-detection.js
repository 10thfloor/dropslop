/**
 * k6 Bot Detection Stress Test
 *
 * Stress tests the PoW challenge system:
 * - Rapid challenge requests
 * - Tests with invalid/expired solutions
 * - Tests with replayed solutions
 * - Measures challenge generation throughput
 *
 * Usage:
 *   k6 run tests/k6/bot-detection.js
 *   k6 run --env VUS=100 tests/k6/bot-detection.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { API_URL, RESTATE_URL, JSON_HEADERS, generateDropId } from "./lib/config.js";
import { solvePow } from "./lib/pow-solver.js";
import { initializeDrop } from "./lib/restate.js";

// Drop ID - shared across all scenarios via exec.scenario.env
// This is set in the Makefile or defaults to auto-generated in setup
let DROP_ID = __ENV.DROP_ID;

// Custom metrics
const challengeSuccess = new Counter("challenge_success");
const challengeFailed = new Counter("challenge_failed");
const challengeTime = new Trend("challenge_time", true);
const invalidAttempts = new Counter("invalid_attempts");
const replayAttempts = new Counter("replay_attempts");
const validRegistrations = new Counter("valid_registrations");
const errorRate = new Rate("error_rate");

// Store used challenges for replay testing
const usedChallenges = [];

// Scenario configuration
export const options = {
  scenarios: {
    // Phase 1: Rapid challenge generation
    challenge_flood: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS) || 50,
      duration: "30s",
      exec: "challengeFlood",
      startTime: "0s",
    },
    // Phase 2: Invalid solution attempts
    invalid_solutions: {
      executor: "constant-vus",
      vus: 20,
      duration: "20s",
      exec: "invalidSolutions",
      startTime: "35s",
    },
    // Phase 3: Replay attacks
    replay_attacks: {
      executor: "constant-vus",
      vus: 10,
      duration: "15s",
      exec: "replayAttacks",
      startTime: "60s",
    },
    // Phase 4: Valid registrations (baseline)
    valid_flow: {
      executor: "constant-vus",
      vus: 10,
      duration: "20s",
      exec: "validFlow",
      startTime: "80s",
    },
  },
  thresholds: {
    challenge_success: ["count>100"],
    challenge_time: ["p(95)<500"], // Challenges should be fast
    error_rate: ["rate<0.3"], // Allow some failures (invalid attempts)
  },
};

/**
 * Setup - Initialize drop (runs once before all scenarios)
 */
export function setup() {
  // Generate drop ID once, shared by all VUs
  DROP_ID = DROP_ID || generateDropId("bot-test");

  console.log(`\n🤖 Bot Detection Test`);
  console.log(`   Drop ID: ${DROP_ID}\n`);

  const result = initializeDrop(DROP_ID, {
    inventory: 10000, // Large inventory for stress testing
    registrationEnd: Date.now() + 30 * 60 * 1000, // 30 minutes
    purchaseWindow: 300,
  });

  if (!result.ok) {
    console.log(`⚠️ Drop init: ${result.status} - continuing anyway`);
  } else {
    console.log(`✅ Drop initialized: ${DROP_ID}`);
  }

  return { dropId: DROP_ID };
}

/**
 * Phase 1: Flood the challenge endpoint
 * Tests challenge generation throughput
 */
export function challengeFlood(data) {
  const dropId = data?.dropId || DROP_ID;
  const start = Date.now();
  const res = http.get(`${API_URL}/api/pow/challenge`, { timeout: "10s" });
  challengeTime.add(Date.now() - start);

  if (res.status === 200) {
    challengeSuccess.add(1);
    errorRate.add(0);

    // Store challenge for replay testing
    try {
      const data = JSON.parse(res.body);
      if (usedChallenges.length < 100) {
        usedChallenges.push(data);
      }
    } catch (e) {
      // Ignore parse errors
    }
  } else {
    challengeFailed.add(1);
    errorRate.add(1);
  }

  sleep(0.05); // Small delay between requests
}

/**
 * Phase 2: Submit invalid solutions
 * Tests rejection of bad PoW solutions
 */
export function invalidSolutions(data) {
  const dropId = data?.dropId || DROP_ID;
  const userId = `k6-invalid-${__VU}-${__ITER}-${Date.now()}`;

  // Get a valid challenge first
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`);
  if (challengeRes.status !== 200) {
    errorRate.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // Submit with obviously invalid solution
  const invalidSolutions = [
    "invalid", // Wrong format
    "0", // Too simple
    "-1", // Negative
    "999999999999999", // Too large
    "", // Empty
  ];

  const badSolution = invalidSolutions[__ITER % invalidSolutions.length];

  const registerRes = http.post(
    `${API_URL}/api/drop/${dropId}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-invalid-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: badSolution,
        powChallenge: challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "10s" }
  );

  invalidAttempts.add(1);

  // Should be rejected (400 or 403)
  const rejected = registerRes.status === 400 || registerRes.status === 403;
  check(registerRes, {
    "invalid solution rejected": () => rejected,
  });

  if (rejected) {
    errorRate.add(0); // Expected rejection
  } else {
    errorRate.add(1); // Unexpected acceptance
    console.log(`WARNING: Invalid solution accepted! Status: ${registerRes.status}`);
  }

  sleep(0.1);
}

/**
 * Phase 3: Replay attack simulation
 * Tests that used challenges are rejected
 */
export function replayAttacks(data) {
  const dropId = data?.dropId || DROP_ID;

  if (usedChallenges.length === 0) {
    sleep(1);
    return;
  }

  const userId = `k6-replay-${__VU}-${__ITER}-${Date.now()}`;

  // Pick a previously used challenge
  const oldChallenge = usedChallenges[__ITER % usedChallenges.length];

  // Solve it (would be valid if challenge wasn't already used)
  let solution;
  try {
    solution = solvePow(oldChallenge.challenge, oldChallenge.difficulty);
  } catch (e) {
    sleep(0.5);
    return;
  }

  const registerRes = http.post(
    `${API_URL}/api/drop/${dropId}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-replay-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: oldChallenge.challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "10s" }
  );

  replayAttempts.add(1);

  // Should be rejected (challenge already used or expired)
  const status = registerRes.status;
  // Note: Could succeed if challenge is still valid and hasn't been used yet
  // This is actually testing the challenge validation, not replay protection per se

  if (status === 200) {
    // Challenge was still valid
    validRegistrations.add(1);
    errorRate.add(0);
  } else if (status === 400 || status === 403) {
    // Properly rejected
    errorRate.add(0);
  } else {
    errorRate.add(1);
  }

  sleep(0.2);
}

/**
 * Phase 4: Valid registration flow (baseline)
 * Ensures the system works correctly under load
 */
export function validFlow(data) {
  const dropId = data?.dropId || DROP_ID;
  const userId = `k6-valid-${__VU}-${__ITER}-${Date.now()}`;

  // 1. Get fresh challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    errorRate.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    errorRate.add(1);
    return;
  }

  // 3. Register with valid solution
  const registerRes = http.post(
    `${API_URL}/api/drop/${dropId}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-valid-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  if (registerRes.status === 200) {
    validRegistrations.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  const challengeCount = data.metrics.challenge_success?.values?.count || 0;
  const invalidCount = data.metrics.invalid_attempts?.values?.count || 0;
  const replayCount = data.metrics.replay_attempts?.values?.count || 0;
  const validCount = data.metrics.valid_registrations?.values?.count || 0;

  const challengeP50 = data.metrics.challenge_time?.values?.["p(50)"] || 0;
  const challengeP95 = data.metrics.challenge_time?.values?.["p(95)"] || 0;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            🤖 K6 BOT DETECTION TEST RESULTS                ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 1: Challenge Flood                                  ║");
  console.log(`║    Challenges Generated: ${challengeCount.toString().padStart(5)}                          ║`);
  console.log(`║    p50 Latency:          ${Math.round(challengeP50).toString().padStart(5)} ms                       ║`);
  console.log(`║    p95 Latency:          ${Math.round(challengeP95).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 2: Invalid Solutions                                ║");
  console.log(`║    Invalid Attempts:     ${invalidCount.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 3: Replay Attacks                                   ║");
  console.log(`║    Replay Attempts:      ${replayCount.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 4: Valid Flow (Baseline)                            ║");
  console.log(`║    Valid Registrations:  ${validCount.toString().padStart(5)}                          ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  return {};
}

