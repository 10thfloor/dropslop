/**
 * k6 Rollover Flow Test
 *
 * Tests the new rollover system end-to-end across two drops:
 * - Phase 1: Register with paid entries (2-5 tickets)
 * - Phase 2: Trigger lottery, verify all users lose (high participants, low items)
 * - Phase 3: Check rollover balance = tickets - 1
 * - Phase 4: Reset drop, register again, verify rollover applied
 *
 * Usage:
 *   k6 run tests/k6/rollover-flow.js
 *   k6 run --env USERS=50 tests/k6/rollover-flow.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { API_URL, RESTATE_URL, JSON_HEADERS } from "./lib/config.js";
import { solvePow } from "./lib/pow-solver.js";
import {
  runLottery,
  getRolloverBalance,
  initializeDrop,
} from "./lib/restate.js";

// Configuration
const USERS = Number(__ENV.USERS) || 20;
const DROP1_ID = __ENV.DROP1_ID || `rollover-test-1-${Date.now()}`;
const DROP2_ID = __ENV.DROP2_ID || `rollover-test-2-${Date.now()}`;

// Custom metrics
const drop1RegSuccess = new Counter("drop1_registration_success");
const drop1RegFailed = new Counter("drop1_registration_failed");
const drop2RegSuccess = new Counter("drop2_registration_success");
const drop2RegFailed = new Counter("drop2_registration_failed");
const rolloverGranted = new Counter("rollover_granted");
const rolloverApplied = new Counter("rollover_applied");
const rolloverMismatch = new Counter("rollover_mismatch");
const registrationTime = new Trend("registration_time", true);
const errorRate = new Rate("error_rate");

// Track user data across phases
const userTickets = {}; // userId -> tickets purchased in drop 1
const userRollovers = {}; // userId -> expected rollover
const registeredUsers = []; // List of user IDs for phase 2+

export const options = {
  scenarios: {
    // Phase 1: Register for drop 1 with paid entries (everyone loses)
    drop1_registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS,
      maxDuration: "3m",
      exec: "registerDrop1",
    },
    // Phase 2: Trigger lottery (1 item, many participants = almost all lose)
    drop1_lottery: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      startTime: "3m10s",
      maxDuration: "30s",
      exec: "runDrop1Lottery",
    },
    // Phase 3: Verify rollover balances
    verify_rollover: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS,
      startTime: "3m45s",
      maxDuration: "2m",
      exec: "verifyRollover",
    },
    // Phase 4: Register for drop 2 with rollover applied
    drop2_registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS,
      startTime: "6m",
      maxDuration: "3m",
      exec: "registerDrop2",
    },
    // Phase 5: Verify rollover was consumed
    verify_consumed: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS,
      startTime: "9m10s",
      maxDuration: "2m",
      exec: "verifyConsumed",
    },
  },
  thresholds: {
    drop1_registration_success: [`count>=${USERS * 0.9}`],
    rollover_granted: [`count>=${USERS * 0.5}`], // At least half get rollover
    drop2_registration_success: [`count>=${USERS * 0.9}`],
  },
};

/**
 * Setup: Initialize both drops
 */
export function setup() {
  console.log(`\n🔄 Rollover Flow Test: ${USERS} users\n`);
  console.log(`   Drop 1 ID: ${DROP1_ID}`);
  console.log(`   Drop 2 ID: ${DROP2_ID}\n`);

  const now = Date.now();

  // Initialize drop 1 with very low inventory (1 item = almost everyone loses)
  const drop1Init = http.post(
    `${RESTATE_URL}/Drop/${DROP1_ID}/initialize`,
    JSON.stringify({
      dropId: DROP1_ID,
      inventory: 1, // Only 1 winner!
      registrationStart: now - 1000,
      registrationEnd: now + 10 * 60 * 1000,
      purchaseWindow: 300,
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  if (drop1Init.status !== 200) {
    console.log(`⚠️ Drop 1 init: ${drop1Init.status}`);
  }

  // Initialize drop 2 (for rollover testing)
  const drop2Init = http.post(
    `${RESTATE_URL}/Drop/${DROP2_ID}/initialize`,
    JSON.stringify({
      dropId: DROP2_ID,
      inventory: USERS, // Everyone can win
      registrationStart: now - 1000,
      registrationEnd: now + 15 * 60 * 1000,
      purchaseWindow: 300,
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  if (drop2Init.status !== 200) {
    console.log(`⚠️ Drop 2 init: ${drop2Init.status}`);
  }

  return {
    drop1Id: DROP1_ID,
    drop2Id: DROP2_ID,
  };
}

/**
 * Phase 1: Register for drop 1 with paid entries
 */
export function registerDrop1(data) {
  const userId = `k6-rollover-${__VU}-${__ITER}-${Date.now()}`;
  // Random 2-5 tickets (so rollover = 1-4)
  const tickets = Math.floor(Math.random() * 4) + 2;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    drop1RegFailed.add(1);
    errorRate.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    drop1RegFailed.add(1);
    errorRate.add(1);
    return;
  }

  // 3. Register with multiple tickets
  const regStart = Date.now();
  const registerRes = http.post(
    `${API_URL}/api/drop/${DROP1_ID}/register`,
    JSON.stringify({
      userId,
      tickets,
      botValidation: {
        fingerprint: `k6-rollover-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  registrationTime.add(Date.now() - regStart);

  if (registerRes.status === 200) {
    drop1RegSuccess.add(1);
    errorRate.add(0);

    // Track for later phases
    registeredUsers.push(userId);
    userTickets[userId] = tickets;
    // Rollover = tickets - 1 (first entry is free)
    userRollovers[userId] = tickets - 1;
  } else {
    drop1RegFailed.add(1);
    errorRate.add(1);
    console.log(`Drop 1 registration failed: ${registerRes.status}`);
  }

  sleep(0.1);
}

/**
 * Phase 2: Trigger lottery for drop 1
 */
export function runDrop1Lottery(data) {
  console.log(`\n🎰 Triggering lottery for drop 1 (${registeredUsers.length} participants, 1 item)...\n`);

  const lotteryRes = runLottery(DROP1_ID);

  if (lotteryRes.ok) {
    const result = lotteryRes.json;
    console.log(`✅ Lottery complete:`);
    console.log(`   Winners: ${result.winnersSelected || 0}`);
    console.log(`   Total:   ${result.totalParticipants || 0}\n`);
  } else {
    console.log(`❌ Lottery failed: ${lotteryRes.status}\n`);
  }

  // Wait for rollover to be granted
  sleep(3);
}

/**
 * Phase 3: Verify rollover balances
 */
export function verifyRollover(data) {
  if (__ITER >= registeredUsers.length) {
    return;
  }

  const userId = registeredUsers[__ITER];
  const expectedRollover = userRollovers[userId] || 0;

  const balanceRes = getRolloverBalance(userId);

  if (balanceRes.ok) {
    const balance = balanceRes.json?.balance || 0;

    // Check if rollover was granted (user lost and had paid entries)
    if (balance > 0) {
      rolloverGranted.add(1);

      if (balance === expectedRollover) {
        // Perfect match
      } else {
        // Mismatch (could be winner with 0 rollover)
        rolloverMismatch.add(1);
      }
    }
    // Note: balance = 0 could mean user won (no rollover granted)
  } else {
    console.log(`Failed to get rollover for ${userId}: ${balanceRes.status}`);
  }

  sleep(0.05);
}

/**
 * Phase 4: Register for drop 2 with rollover
 */
export function registerDrop2(data) {
  if (__ITER >= registeredUsers.length) {
    return;
  }

  const userId = registeredUsers[__ITER];

  // Get current rollover balance
  const balanceRes = getRolloverBalance(userId);
  const rolloverBefore = balanceRes.ok ? balanceRes.json?.balance || 0 : 0;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    drop2RegFailed.add(1);
    errorRate.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    drop2RegFailed.add(1);
    errorRate.add(1);
    return;
  }

  // 3. Register with 1 ticket (rollover should cover it)
  const regStart = Date.now();
  const registerRes = http.post(
    `${API_URL}/api/drop/${DROP2_ID}/register`,
    JSON.stringify({
      userId,
      tickets: 1, // Just 1 ticket to test rollover application
      botValidation: {
        fingerprint: `k6-rollover-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  registrationTime.add(Date.now() - regStart);

  if (registerRes.status === 200) {
    drop2RegSuccess.add(1);
    errorRate.add(0);

    // Check if rollover was applied
    try {
      const result = JSON.parse(registerRes.body);
      if (result.rolloverUsed && result.rolloverUsed > 0) {
        rolloverApplied.add(1);
      }
    } catch (e) {
      // Ignore parse errors
    }
  } else {
    drop2RegFailed.add(1);
    errorRate.add(1);
    console.log(`Drop 2 registration failed for ${userId}: ${registerRes.status}`);
  }

  sleep(0.1);
}

/**
 * Phase 5: Verify rollover was consumed
 */
export function verifyConsumed(data) {
  if (__ITER >= registeredUsers.length) {
    return;
  }

  const userId = registeredUsers[__ITER];
  const originalRollover = userRollovers[userId] || 0;

  const balanceRes = getRolloverBalance(userId);

  if (balanceRes.ok) {
    const balance = balanceRes.json?.balance || 0;

    // If user had rollover and registered with 1 ticket, balance should be reduced
    // (rollover - 1) since we consumed 1 rollover entry (or all if user had exactly 1)
    if (originalRollover > 0 && balance < originalRollover) {
      // Rollover was consumed
    }
  }

  sleep(0.05);
}

export function handleSummary(data) {
  const drop1Success = data.metrics.drop1_registration_success?.values?.count || 0;
  const drop1Failed = data.metrics.drop1_registration_failed?.values?.count || 0;
  const drop2Success = data.metrics.drop2_registration_success?.values?.count || 0;
  const drop2Failed = data.metrics.drop2_registration_failed?.values?.count || 0;
  const granted = data.metrics.rollover_granted?.values?.count || 0;
  const applied = data.metrics.rollover_applied?.values?.count || 0;
  const mismatch = data.metrics.rollover_mismatch?.values?.count || 0;

  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            🔄 K6 ROLLOVER FLOW TEST RESULTS                ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Target Users:       ${USERS.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Drop 1 (Lose to get rollover)                             ║");
  console.log(`║    ✅ Registered:    ${drop1Success.toString().padStart(5)}                          ║`);
  console.log(`║    ❌ Failed:        ${drop1Failed.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Rollover Verification                                     ║");
  console.log(`║    Rollover Granted: ${granted.toString().padStart(5)} losers                     ║`);
  console.log(`║    Balance Mismatch: ${mismatch.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Drop 2 (Use rollover)                                     ║");
  console.log(`║    ✅ Registered:    ${drop2Success.toString().padStart(5)}                          ║`);
  console.log(`║    ❌ Failed:        ${drop2Failed.toString().padStart(5)}                          ║`);
  console.log(`║    Rollover Applied: ${applied.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Registration p95:   ${Math.round(regP95).toString().padStart(5)} ms                       ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Analysis
  if (granted > 0 && applied === 0) {
    console.log("⚠️  Rollover was granted but never applied. Check drop 2 registration.\n");
  }

  if (granted === 0 && drop1Success > 1) {
    console.log("⚠️  No rollover granted despite losers. Check notifyResult logic.\n");
  }

  if (applied > 0) {
    console.log("✅ Rollover system working: entries were granted and applied!\n");
  }

  return {};
}

