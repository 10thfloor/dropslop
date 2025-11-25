/**
 * k6 Registration Spike Test
 *
 * Simulates a flash crowd: rapid ramp-up to peak load, hold, then ramp down.
 * Tests system behavior under sudden traffic spikes.
 *
 * Usage:
 *   k6 run tests/k6/registration-spike.js
 *   k6 run --vus 500 --duration 60s tests/k6/registration-spike.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { solvePow } from "./lib/pow-solver.js";

// Configuration
const API_URL = __ENV.API_URL || "http://localhost:3003";
const DROP_ID = __ENV.DROP_ID || "demo-drop-1";

// Custom metrics
const registrationSuccess = new Counter("registration_success");
const registrationFailed = new Counter("registration_failed");
const powSolveTime = new Trend("pow_solve_time", true);
const registrationTime = new Trend("registration_time", true);

// Spike scenario: 0 → 200 → hold → 0
export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 50 }, // Ramp up to 50
        { duration: "10s", target: 200 }, // Spike to 200
        { duration: "30s", target: 200 }, // Hold at peak
        { duration: "10s", target: 50 }, // Ramp down
        { duration: "10s", target: 0 }, // Cool down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.1"], // <10% errors
    registration_time: ["p(95)<5000"], // 95% under 5s
    registration_success: ["count>100"], // At least 100 successful
  },
};

export default function () {
  const userId = `k6-spike-${__VU}-${__ITER}-${Date.now()}`;

  // 1. Get challenge
  const challengeRes = http.get(`${API_URL}/api/pow/challenge`);

  if (
    !check(challengeRes, {
      "challenge status 200": (r) => r.status === 200,
    })
  ) {
    registrationFailed.add(1);
    return;
  }

  const { challenge, difficulty } = JSON.parse(challengeRes.body);

  // 2. Solve PoW
  const powStart = Date.now();
  let solution;
  try {
    solution = solvePow(challenge, difficulty);
  } catch (e) {
    registrationFailed.add(1);
    return;
  }
  powSolveTime.add(Date.now() - powStart);

  // 3. Register
  const regStart = Date.now();
  const registerRes = http.post(
    `${API_URL}/api/drop/${DROP_ID}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  registrationTime.add(Date.now() - regStart);

  if (
    check(registerRes, {
      "registration status 200": (r) => r.status === 200,
    })
  ) {
    registrationSuccess.add(1);
  } else {
    registrationFailed.add(1);
    console.log(`Registration failed: ${registerRes.status} - ${registerRes.body}`);
  }

  // Small delay between iterations
  sleep(0.1);
}

export function handleSummary(data) {
  const successCount = data.metrics.registration_success?.values?.count || 0;
  const failedCount = data.metrics.registration_failed?.values?.count || 0;
  const total = successCount + failedCount;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║            ⚡ K6 SPIKE TEST RESULTS                    ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(
    `║  Total Registrations:  ${total.toString().padStart(5)}                          ║`
  );
  console.log(
    `║  ✅ Successful:        ${successCount.toString().padStart(5)} (${total > 0 ? ((successCount / total) * 100).toFixed(0) : 0}%)                      ║`
  );
  console.log(
    `║  ❌ Failed:            ${failedCount.toString().padStart(5)}                          ║`
  );
  console.log("╠════════════════════════════════════════════════════════╣");

  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;
  const regP99 = data.metrics.registration_time?.values?.["p(99)"] || 0;
  console.log(
    `║  Registration p95:    ${Math.round(regP95).toString().padStart(5)} ms                       ║`
  );
  console.log(
    `║  Registration p99:    ${Math.round(regP99).toString().padStart(5)} ms                       ║`
  );

  const powAvg = data.metrics.pow_solve_time?.values?.avg || 0;
  console.log(
    `║  Avg PoW Time:        ${Math.round(powAvg).toString().padStart(5)} ms                       ║`
  );
  console.log("╚════════════════════════════════════════════════════════╝\n");

  return {};
}

