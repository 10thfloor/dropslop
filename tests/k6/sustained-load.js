/**
 * k6 Sustained Load (Soak) Test
 *
 * Runs constant load for an extended period to detect:
 * - Memory leaks
 * - Connection exhaustion
 * - Performance degradation over time
 *
 * Usage:
 *   k6 run tests/k6/sustained-load.js
 *   k6 run --duration 30m tests/k6/sustained-load.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { solvePow } from "./lib/pow-solver.js";

// Configuration
const API_URL = __ENV.API_URL || "http://localhost:3003";
const DROP_ID = __ENV.DROP_ID || "demo-drop-1";

// Custom metrics
const registrationSuccess = new Counter("registration_success");
const registrationFailed = new Counter("registration_failed");
const errorRate = new Rate("error_rate");
const registrationTime = new Trend("registration_time", true);

// Sustained load scenario
export const options = {
  scenarios: {
    sustained: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS) || 20, // Steady 20 concurrent users
      duration: __ENV.DURATION || "5m", // 5 minutes default
    },
  },
  thresholds: {
    error_rate: ["rate<0.05"], // <5% error rate
    registration_time: ["p(95)<3000"], // 95% under 3s
    http_req_duration: ["p(99)<10000"], // 99% under 10s
  },
};

export default function () {
  const userId = `k6-soak-${__VU}-${__ITER}-${Date.now()}`;
  let success = false;

  try {
    // 1. Get challenge
    const challengeRes = http.get(`${API_URL}/api/pow/challenge`, {
      timeout: "10s",
    });

    if (challengeRes.status !== 200) {
      throw new Error(`Challenge failed: ${challengeRes.status}`);
    }

    const { challenge, difficulty } = JSON.parse(challengeRes.body);

    // 2. Solve PoW
    const solution = solvePow(challenge, difficulty);

    // 3. Register
    const regStart = Date.now();
    const registerRes = http.post(
      `${API_URL}/api/drop/${DROP_ID}/register`,
      JSON.stringify({
        userId,
        tickets: 1,
        botValidation: {
          fingerprint: `k6-soak-fp-${__VU}`,
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

    success = registerRes.status === 200;

    check(registerRes, {
      "registration successful": (r) => r.status === 200,
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  if (success) {
    registrationSuccess.add(1);
    errorRate.add(0);
  } else {
    registrationFailed.add(1);
    errorRate.add(1);
  }

  // Pause between registrations (simulates real user think time)
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
  const successCount = data.metrics.registration_success?.values?.count || 0;
  const failedCount = data.metrics.registration_failed?.values?.count || 0;
  const total = successCount + failedCount;
  const duration = data.state?.testRunDurationMs
    ? (data.state.testRunDurationMs / 1000 / 60).toFixed(1)
    : "?";

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║            🔄 K6 SOAK TEST RESULTS                     ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║  Duration:            ${duration.padStart(5)} min                       ║`);
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

  const regP50 = data.metrics.registration_time?.values?.["p(50)"] || 0;
  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;
  console.log(
    `║  Registration p50:    ${Math.round(regP50).toString().padStart(5)} ms                       ║`
  );
  console.log(
    `║  Registration p95:    ${Math.round(regP95).toString().padStart(5)} ms                       ║`
  );

  const rps =
    data.metrics.http_reqs?.values?.rate?.toFixed(1) || "?";
  console.log(`║  Requests/sec:        ${rps.toString().padStart(5)}                          ║`);
  console.log("╚════════════════════════════════════════════════════════╝\n");

  return {};
}

