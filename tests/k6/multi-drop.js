/**
 * k6 Multi-Drop Concurrent Test
 *
 * Tests isolation and resource contention between concurrent drops:
 * - Creates 3 separate drops
 * - Registers users concurrently across all drops
 * - Triggers lotteries in parallel
 * - Verifies no cross-contamination of state
 * - Measures per-drop performance under contention
 *
 * Usage:
 *   k6 run tests/k6/multi-drop.js
 *   k6 run --env USERS_PER_DROP=100 tests/k6/multi-drop.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate, Gauge } from "k6/metrics";
import { API_URL, RESTATE_URL, JSON_HEADERS } from "./lib/config.js";
import { solvePow } from "./lib/pow-solver.js";
import { runLottery, getDropState } from "./lib/restate.js";

// Configuration
const USERS_PER_DROP = Number(__ENV.USERS_PER_DROP) || 30;
const DROP_COUNT = 3;
const timestamp = Date.now();
const DROP_IDS = [
  `multi-drop-A-${timestamp}`,
  `multi-drop-B-${timestamp}`,
  `multi-drop-C-${timestamp}`,
];

// Custom metrics - per drop
const dropASuccess = new Counter("drop_a_registration_success");
const dropAFailed = new Counter("drop_a_registration_failed");
const dropBSuccess = new Counter("drop_b_registration_success");
const dropBFailed = new Counter("drop_b_registration_failed");
const dropCSuccess = new Counter("drop_c_registration_success");
const dropCFailed = new Counter("drop_c_registration_failed");
const registrationTime = new Trend("registration_time", true);
const errorRate = new Rate("error_rate");
const crossContamination = new Counter("cross_contamination");

// Track registrations per drop
const dropRegistrations = {
  [DROP_IDS[0]]: [],
  [DROP_IDS[1]]: [],
  [DROP_IDS[2]]: [],
};

export const options = {
  scenarios: {
    // Concurrent registration across all 3 drops
    drop_a_registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS_PER_DROP,
      maxDuration: "3m",
      exec: "registerDropA",
    },
    drop_b_registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS_PER_DROP,
      maxDuration: "3m",
      exec: "registerDropB",
    },
    drop_c_registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: USERS_PER_DROP,
      maxDuration: "3m",
      exec: "registerDropC",
    },
    // Trigger all lotteries concurrently
    lotteries: {
      executor: "shared-iterations",
      vus: 3,
      iterations: 3,
      startTime: "3m15s",
      maxDuration: "1m",
      exec: "runLotteries",
    },
    // Verify isolation
    verify_isolation: {
      executor: "shared-iterations",
      vus: 3,
      iterations: 3,
      startTime: "4m30s",
      maxDuration: "1m",
      exec: "verifyIsolation",
    },
  },
  thresholds: {
    drop_a_registration_success: [`count>=${USERS_PER_DROP * 0.9}`],
    drop_b_registration_success: [`count>=${USERS_PER_DROP * 0.9}`],
    drop_c_registration_success: [`count>=${USERS_PER_DROP * 0.9}`],
    cross_contamination: ["count==0"], // Must be 0!
  },
};

/**
 * Setup: Initialize all 3 drops
 */
export function setup() {
  console.log(`\n🎯 Multi-Drop Test: ${DROP_COUNT} drops × ${USERS_PER_DROP} users\n`);

  const now = Date.now();

  for (let i = 0; i < DROP_COUNT; i++) {
    const dropId = DROP_IDS[i];
    console.log(`   Initializing: ${dropId}`);

    const initRes = http.post(
      `${RESTATE_URL}/Drop/${dropId}/initialize`,
      JSON.stringify({
        dropId,
        inventory: Math.floor(USERS_PER_DROP / 2), // ~50% winners per drop
        registrationStart: now - 1000,
        registrationEnd: now + 10 * 60 * 1000,
        purchaseWindow: 300,
      }),
      { headers: JSON_HEADERS, timeout: "30s" }
    );

    if (initRes.status !== 200) {
      console.log(`   ⚠️ Drop ${dropId} init: ${initRes.status}`);
    }
  }

  console.log("\n");

  return { dropIds: DROP_IDS };
}

/**
 * Helper: Register for a specific drop
 */
function registerForDrop(dropId, successCounter, failedCounter) {
  const userId = `k6-multi-${dropId.slice(-1)}-${__VU}-${__ITER}-${Date.now()}`;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    failedCounter.add(1);
    errorRate.add(1);
    return null;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    failedCounter.add(1);
    errorRate.add(1);
    return null;
  }

  // 3. Register
  const regStart = Date.now();
  const registerRes = http.post(
    `${API_URL}/api/drop/${dropId}/register`,
    JSON.stringify({
      userId,
      tickets: Math.floor(Math.random() * 3) + 1, // 1-3 tickets
      botValidation: {
        fingerprint: `k6-multi-fp-${__VU}`,
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
    successCounter.add(1);
    errorRate.add(0);
    return userId;
  } else {
    failedCounter.add(1);
    errorRate.add(1);
    return null;
  }
}

/**
 * Register for Drop A
 */
export function registerDropA(data) {
  const userId = registerForDrop(DROP_IDS[0], dropASuccess, dropAFailed);
  if (userId) {
    dropRegistrations[DROP_IDS[0]].push(userId);
  }
  sleep(0.1);
}

/**
 * Register for Drop B
 */
export function registerDropB(data) {
  const userId = registerForDrop(DROP_IDS[1], dropBSuccess, dropBFailed);
  if (userId) {
    dropRegistrations[DROP_IDS[1]].push(userId);
  }
  sleep(0.1);
}

/**
 * Register for Drop C
 */
export function registerDropC(data) {
  const userId = registerForDrop(DROP_IDS[2], dropCSuccess, dropCFailed);
  if (userId) {
    dropRegistrations[DROP_IDS[2]].push(userId);
  }
  sleep(0.1);
}

/**
 * Run lotteries for all drops concurrently
 */
export function runLotteries(data) {
  const dropId = DROP_IDS[__ITER % DROP_COUNT];

  console.log(`🎰 Running lottery for ${dropId}...`);

  const result = runLottery(dropId);

  if (result.ok) {
    const json = result.json;
    console.log(
      `   ✅ ${dropId}: ${json.winnersSelected || 0} winners / ${json.totalParticipants || 0} participants`
    );
  } else {
    console.log(`   ❌ ${dropId}: Failed (${result.status})`);
  }

  sleep(1);
}

/**
 * Verify state isolation between drops
 */
export function verifyIsolation(data) {
  const dropId = DROP_IDS[__ITER % DROP_COUNT];

  const stateRes = getDropState(dropId);

  if (!stateRes.ok) {
    console.log(`❌ Failed to get state for ${dropId}`);
    return;
  }

  const state = stateRes.json;
  const expectedUsers = dropRegistrations[dropId];

  // Check that participant count matches our tracked registrations
  const participantCount = state.participantCount || 0;
  const expectedCount = expectedUsers.length;

  // Allow some variance due to timing
  if (Math.abs(participantCount - expectedCount) > expectedCount * 0.1) {
    console.log(
      `⚠️ ${dropId}: Expected ~${expectedCount} participants, got ${participantCount}`
    );
    // This could indicate cross-contamination if way off
    if (participantCount > expectedCount * 1.5) {
      crossContamination.add(1);
      console.log(`❌ CROSS-CONTAMINATION DETECTED in ${dropId}!`);
    }
  }

  // Verify phase consistency
  check(state, {
    "phase is lottery_complete or later": (s) =>
      s.phase === "lottery_complete" ||
      s.phase === "purchase" ||
      s.phase === "ended",
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const aSuccess = data.metrics.drop_a_registration_success?.values?.count || 0;
  const aFailed = data.metrics.drop_a_registration_failed?.values?.count || 0;
  const bSuccess = data.metrics.drop_b_registration_success?.values?.count || 0;
  const bFailed = data.metrics.drop_b_registration_failed?.values?.count || 0;
  const cSuccess = data.metrics.drop_c_registration_success?.values?.count || 0;
  const cFailed = data.metrics.drop_c_registration_failed?.values?.count || 0;
  const contamination = data.metrics.cross_contamination?.values?.count || 0;

  const regP50 = data.metrics.registration_time?.values?.["p(50)"] || 0;
  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;

  const totalSuccess = aSuccess + bSuccess + cSuccess;
  const totalFailed = aFailed + bFailed + cFailed;
  const total = totalSuccess + totalFailed;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            🎯 K6 MULTI-DROP TEST RESULTS                   ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Drops: ${DROP_COUNT}   Users/Drop: ${USERS_PER_DROP}   Total Target: ${DROP_COUNT * USERS_PER_DROP}          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Per-Drop Results                                          ║");
  console.log(`║    Drop A: ✅ ${aSuccess.toString().padStart(4)} / ❌ ${aFailed.toString().padStart(4)}                           ║`);
  console.log(`║    Drop B: ✅ ${bSuccess.toString().padStart(4)} / ❌ ${bFailed.toString().padStart(4)}                           ║`);
  console.log(`║    Drop C: ✅ ${cSuccess.toString().padStart(4)} / ❌ ${cFailed.toString().padStart(4)}                           ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Aggregate                                                 ║");
  console.log(`║    Total Success:    ${totalSuccess.toString().padStart(5)} (${total > 0 ? ((totalSuccess / total) * 100).toFixed(0) : 0}%)                      ║`);
  console.log(`║    Total Failed:     ${totalFailed.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Latency                                                   ║");
  console.log(`║    p50:              ${Math.round(regP50).toString().padStart(5)} ms                       ║`);
  console.log(`║    p95:              ${Math.round(regP95).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Isolation                                                 ║");
  if (contamination === 0) {
    console.log("║    ✅ No cross-contamination detected                      ║");
  } else {
    console.log(`║    ❌ Cross-contamination: ${contamination.toString().padStart(3)} instances!               ║`);
  }
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Analysis
  const variance = Math.max(
    Math.abs(aSuccess - bSuccess),
    Math.abs(bSuccess - cSuccess),
    Math.abs(aSuccess - cSuccess)
  );

  if (variance > USERS_PER_DROP * 0.2) {
    console.log("⚠️  High variance between drops. Possible resource contention.\n");
  }

  return {};
}

