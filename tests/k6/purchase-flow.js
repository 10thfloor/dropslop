/**
 * k6 Purchase Flow Test
 *
 * Tests the complete winner flow:
 * - Setup: Register limited users
 * - Phase 1: Trigger lottery with enough items (guarantees winners)
 * - Phase 2: Winners call startPurchase to get token
 * - Phase 3: Winners call completePurchase
 * - Measures purchase latency and token generation throughput
 *
 * Usage:
 *   k6 run tests/k6/purchase-flow.js
 *   k6 run --env WINNERS=50 tests/k6/purchase-flow.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";
import { API_URL, RESTATE_URL, DROP_ID, JSON_HEADERS } from "./lib/config.js";
import { solvePow } from "./lib/pow-solver.js";
import { runLottery, getDropState } from "./lib/restate.js";

// Configuration
const WINNERS = Number(__ENV.WINNERS) || 20;
const TEST_DROP_ID = __ENV.TEST_DROP_ID || `purchase-test-${Date.now()}`;

// Custom metrics
const registrationSuccess = new Counter("registration_success");
const registrationFailed = new Counter("registration_failed");
const purchaseStartSuccess = new Counter("purchase_start_success");
const purchaseStartFailed = new Counter("purchase_start_failed");
const purchaseCompleteSuccess = new Counter("purchase_complete_success");
const purchaseCompleteFailed = new Counter("purchase_complete_failed");
const registrationTime = new Trend("registration_time", true);
const purchaseStartTime = new Trend("purchase_start_time", true);
const purchaseCompleteTime = new Trend("purchase_complete_time", true);
const errorRate = new Rate("error_rate");

// Store registered users and their tokens
const registeredUsers = [];
const purchaseTokens = {};

export const options = {
  scenarios: {
    // Phase 1: Register users (all will be winners since inventory >= users)
    registration: {
      executor: "shared-iterations",
      vus: 10,
      iterations: WINNERS,
      maxDuration: "2m",
      exec: "registerUser",
    },
    // Phase 2: Trigger lottery (runs once after registration)
    lottery: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      startTime: "2m10s",
      maxDuration: "30s",
      exec: "triggerLottery",
    },
    // Phase 3: Start purchases (winners get tokens)
    start_purchases: {
      executor: "shared-iterations",
      vus: 10,
      iterations: WINNERS,
      startTime: "2m45s",
      maxDuration: "2m",
      exec: "startPurchase",
    },
    // Phase 4: Complete purchases
    complete_purchases: {
      executor: "shared-iterations",
      vus: 10,
      iterations: WINNERS,
      startTime: "5m",
      maxDuration: "2m",
      exec: "completePurchase",
    },
  },
  thresholds: {
    registration_success: [`count>=${WINNERS * 0.9}`],
    purchase_start_success: [`count>=${WINNERS * 0.8}`],
    purchase_complete_success: [`count>=${WINNERS * 0.7}`],
  },
};

/**
 * Setup: Initialize a test drop with enough inventory for all winners
 */
export function setup() {
  console.log(`\n🛒 Purchase Flow Test: ${WINNERS} winners\n`);
  console.log(`   Drop ID: ${TEST_DROP_ID}\n`);

  // Initialize drop with inventory = WINNERS (everyone wins)
  const now = Date.now();
  const initRes = http.post(
    `${RESTATE_URL}/Drop/${TEST_DROP_ID}/initialize`,
    JSON.stringify({
      dropId: TEST_DROP_ID,
      inventory: WINNERS, // Enough for everyone
      registrationStart: now - 1000,
      registrationEnd: now + 5 * 60 * 1000,
      purchaseWindow: 300,
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  if (initRes.status !== 200) {
    console.log(`⚠️ Drop initialization returned: ${initRes.status}`);
    // May already exist, continue anyway
  }

  return {
    dropId: TEST_DROP_ID,
    startTime: Date.now(),
    users: [],
  };
}

/**
 * Phase 1: Register users
 */
export function registerUser(data) {
  const userId = `k6-purchase-${__VU}-${__ITER}-${Date.now()}`;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    registrationFailed.add(1);
    errorRate.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    registrationFailed.add(1);
    errorRate.add(1);
    return;
  }

  // 3. Register
  const regStart = Date.now();
  const registerRes = http.post(
    `${API_URL}/api/drop/${TEST_DROP_ID}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-purchase-fp-${__VU}`,
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
    registrationSuccess.add(1);
    errorRate.add(0);
    registeredUsers.push(userId);
  } else {
    registrationFailed.add(1);
    errorRate.add(1);
    console.log(`Registration failed: ${registerRes.status} - ${registerRes.body}`);
  }

  sleep(0.1);
}

/**
 * Phase 2: Trigger lottery
 */
export function triggerLottery(data) {
  console.log(`\n🎰 Triggering lottery for ${registeredUsers.length} participants...\n`);

  const lotteryRes = runLottery(TEST_DROP_ID);

  if (lotteryRes.ok) {
    console.log(`✅ Lottery complete: ${JSON.stringify(lotteryRes.json)}\n`);
  } else {
    console.log(`❌ Lottery failed: ${lotteryRes.status} - ${lotteryRes.body}\n`);
  }

  // Give time for state to propagate
  sleep(2);
}

/**
 * Phase 3: Start purchase (get token)
 */
export function startPurchase(data) {
  if (__ITER >= registeredUsers.length) {
    return; // No more users to process
  }

  const userId = registeredUsers[__ITER];
  if (!userId) {
    return;
  }

  const startTime = Date.now();
  const startRes = http.post(
    `${API_URL}/api/drop/${TEST_DROP_ID}/purchase/start`,
    JSON.stringify({ userId }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  purchaseStartTime.add(Date.now() - startTime);

  if (startRes.status === 200) {
    purchaseStartSuccess.add(1);
    errorRate.add(0);

    try {
      const result = JSON.parse(startRes.body);
      if (result.purchaseToken) {
        purchaseTokens[userId] = result.purchaseToken;
      }
    } catch (e) {
      // Ignore parse errors
    }
  } else {
    purchaseStartFailed.add(1);
    // Don't count as error if user wasn't a winner
    if (startRes.status === 403 || startRes.status === 400) {
      errorRate.add(0); // Expected for non-winners
    } else {
      errorRate.add(1);
      console.log(`Purchase start failed for ${userId}: ${startRes.status}`);
    }
  }

  sleep(0.05);
}

/**
 * Phase 4: Complete purchase
 */
export function completePurchase(data) {
  if (__ITER >= registeredUsers.length) {
    return;
  }

  const userId = registeredUsers[__ITER];
  const token = purchaseTokens[userId];

  if (!userId || !token) {
    return; // User didn't get a token
  }

  const startTime = Date.now();
  const completeRes = http.post(
    `${API_URL}/api/drop/${TEST_DROP_ID}/purchase`,
    JSON.stringify({
      userId,
      purchaseToken: token,
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  purchaseCompleteTime.add(Date.now() - startTime);

  if (completeRes.status === 200) {
    purchaseCompleteSuccess.add(1);
    errorRate.add(0);
  } else {
    purchaseCompleteFailed.add(1);
    errorRate.add(1);
    console.log(`Purchase complete failed for ${userId}: ${completeRes.status}`);
  }

  sleep(0.05);
}

export function handleSummary(data) {
  const regSuccess = data.metrics.registration_success?.values?.count || 0;
  const regFailed = data.metrics.registration_failed?.values?.count || 0;
  const startSuccess = data.metrics.purchase_start_success?.values?.count || 0;
  const startFailed = data.metrics.purchase_start_failed?.values?.count || 0;
  const completeSuccess = data.metrics.purchase_complete_success?.values?.count || 0;
  const completeFailed = data.metrics.purchase_complete_failed?.values?.count || 0;

  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;
  const startP95 = data.metrics.purchase_start_time?.values?.["p(95)"] || 0;
  const completeP95 = data.metrics.purchase_complete_time?.values?.["p(95)"] || 0;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            🛒 K6 PURCHASE FLOW TEST RESULTS                ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Target Winners:     ${WINNERS.toString().padStart(5)}                          ║`);
  console.log(`║  Drop ID:            ${TEST_DROP_ID.slice(0, 20).padEnd(20)}               ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 1: Registration                                     ║");
  console.log(`║    ✅ Successful:    ${regSuccess.toString().padStart(5)}                          ║`);
  console.log(`║    ❌ Failed:        ${regFailed.toString().padStart(5)}                          ║`);
  console.log(`║    p95 Latency:      ${Math.round(regP95).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 2: Start Purchase (Get Token)                       ║");
  console.log(`║    ✅ Tokens Issued: ${startSuccess.toString().padStart(5)}                          ║`);
  console.log(`║    ❌ Denied:        ${startFailed.toString().padStart(5)}                          ║`);
  console.log(`║    p95 Latency:      ${Math.round(startP95).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Phase 3: Complete Purchase                                ║");
  console.log(`║    ✅ Completed:     ${completeSuccess.toString().padStart(5)}                          ║`);
  console.log(`║    ❌ Failed:        ${completeFailed.toString().padStart(5)}                          ║`);
  console.log(`║    p95 Latency:      ${Math.round(completeP95).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  const conversionRate = regSuccess > 0 ? ((completeSuccess / regSuccess) * 100).toFixed(1) : 0;
  console.log(`║  Conversion Rate:    ${conversionRate.toString().padStart(5)}%                         ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  return {};
}

