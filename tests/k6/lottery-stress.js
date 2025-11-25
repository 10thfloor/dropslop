/**
 * k6 Lottery Stress Test
 *
 * Registers many participants rapidly, then triggers the lottery.
 * Tests lottery algorithm performance with large participant pools.
 *
 * Usage:
 *   k6 run tests/k6/lottery-stress.js
 *   k6 run --env PARTICIPANTS=5000 tests/k6/lottery-stress.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import { solvePow } from "./lib/pow-solver.js";

// Configuration
const API_URL = __ENV.API_URL || "http://localhost:3003";
const RESTATE_URL = __ENV.RESTATE_URL || "http://localhost:8080";
const DROP_ID = __ENV.DROP_ID || "demo-drop-1";
const PARTICIPANTS = Number(__ENV.PARTICIPANTS) || 1000;

// Custom metrics
const registrationSuccess = new Counter("registration_success");
const registrationFailed = new Counter("registration_failed");
const registrationTime = new Trend("registration_time", true);

// Fast registration scenario
export const options = {
  scenarios: {
    // Phase 1: Rapid registration
    registration: {
      executor: "shared-iterations",
      vus: 50, // 50 concurrent workers
      iterations: PARTICIPANTS, // Total registrations
      maxDuration: "10m",
    },
  },
  thresholds: {
    registration_success: [`count>=${PARTICIPANTS * 0.9}`], // 90% success
  },
};

export default function () {
  const userId = `k6-lottery-${__VU}-${__ITER}-${Date.now()}`;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
    timeout: "10s",
  });

  if (challengeRes.status !== 200) {
    registrationFailed.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW (use lower difficulty for speed)
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    registrationFailed.add(1);
    return;
  }

  // 3. Register with random ticket count (1-5)
  const tickets = Math.floor(Math.random() * 5) + 1;
  const regStart = Date.now();

  const registerRes = http.post(
    `${API_URL}/api/drop/${DROP_ID}/register`,
    JSON.stringify({
      userId,
      tickets,
      botValidation: {
        fingerprint: `k6-lottery-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    {
      headers: { "Content-Type": "application/json" },
      timeout: "30s",
    }
  );

  registrationTime.add(Date.now() - regStart);

  if (registerRes.status === 200) {
    registrationSuccess.add(1);
  } else {
    registrationFailed.add(1);
  }
}

// Trigger lottery after all registrations
export function teardown(data) {
  console.log("\n📊 Triggering lottery...\n");

  const lotteryStart = Date.now();
  const lotteryRes = http.post(
    `${RESTATE_URL}/Drop/${DROP_ID}/runLottery`,
    "{}",
    {
      headers: { "Content-Type": "application/json" },
      timeout: "120s", // Lottery can take time with many participants
    }
  );

  const lotteryDuration = Date.now() - lotteryStart;

  if (lotteryRes.status === 200) {
    const result = JSON.parse(lotteryRes.body);
    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║            🎰 LOTTERY RESULTS                          ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log(
      `║  Lottery Duration:   ${Math.round(lotteryDuration).toString().padStart(5)} ms                       ║`
    );
    console.log(
      `║  Winners Selected:   ${(result.winnersSelected || 0).toString().padStart(5)}                          ║`
    );
    console.log(
      `║  Total Participants: ${(result.totalParticipants || 0).toString().padStart(5)}                          ║`
    );
    console.log("╚════════════════════════════════════════════════════════╝");
  } else {
    console.log(`❌ Lottery failed: ${lotteryRes.status} - ${lotteryRes.body}`);
  }
}

export function handleSummary(data) {
  const successCount = data.metrics.registration_success?.values?.count || 0;
  const failedCount = data.metrics.registration_failed?.values?.count || 0;
  const total = successCount + failedCount;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║            🎯 K6 LOTTERY STRESS RESULTS                ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║  Target Participants: ${PARTICIPANTS.toString().padStart(5)}                          ║`);
  console.log(
    `║  Actual Registered:   ${successCount.toString().padStart(5)} (${total > 0 ? ((successCount / total) * 100).toFixed(0) : 0}%)                      ║`
  );
  console.log(
    `║  Failed:              ${failedCount.toString().padStart(5)}                          ║`
  );
  console.log("╠════════════════════════════════════════════════════════╣");

  const regP50 = data.metrics.registration_time?.values?.["p(50)"] || 0;
  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;
  console.log(
    `║  Registration p50:   ${Math.round(regP50).toString().padStart(5)} ms                       ║`
  );
  console.log(
    `║  Registration p95:   ${Math.round(regP95).toString().padStart(5)} ms                       ║`
  );

  const rps = data.metrics.http_reqs?.values?.rate?.toFixed(1) || "?";
  console.log(`║  Throughput:         ${rps.toString().padStart(5)} req/s                     ║`);
  console.log("╚════════════════════════════════════════════════════════╝\n");

  return {};
}

