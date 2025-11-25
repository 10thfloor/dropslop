/**
 * k6 Breakpoint Test
 *
 * Finds system breaking points using ramping-arrival-rate:
 * - Starts at 10 req/s
 * - Gradually increases to 500+ req/s
 * - Records when latency degrades
 * - Records when errors begin
 * - Identifies maximum sustainable throughput
 *
 * Usage:
 *   k6 run tests/k6/breakpoint.js
 *   k6 run --env MAX_RATE=1000 tests/k6/breakpoint.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate, Gauge } from "k6/metrics";
import { API_URL, DROP_ID, JSON_HEADERS } from "./lib/config.js";
import { solvePow } from "./lib/pow-solver.js";

// Configuration
const MAX_RATE = Number(__ENV.MAX_RATE) || 500;
const RAMP_DURATION = __ENV.RAMP_DURATION || "2m";
const HOLD_DURATION = __ENV.HOLD_DURATION || "30s";

// Custom metrics
const registrationSuccess = new Counter("registration_success");
const registrationFailed = new Counter("registration_failed");
const registrationTime = new Trend("registration_time", true);
const errorRate = new Rate("error_rate");
const currentRate = new Gauge("current_rate");

// Track when degradation starts
const degradationStartRate = null;
const errorStartRate = null;

// Breakpoint scenario using ramping-arrival-rate
export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: "30s", target: 50 }, // Warm up to 50 req/s
        { duration: RAMP_DURATION, target: MAX_RATE }, // Ramp to max
        { duration: HOLD_DURATION, target: MAX_RATE }, // Hold at max
        { duration: "30s", target: 10 }, // Cool down
      ],
    },
  },
  thresholds: {
    // These are informational - we expect some to fail at breakpoint
    registration_time: [
      { threshold: "p(50)<1000", abortOnFail: false },
      { threshold: "p(95)<5000", abortOnFail: false },
    ],
    error_rate: [{ threshold: "rate<0.5", abortOnFail: false }],
  },
};

export default function () {
  const userId = `k6-bp-${__VU}-${__ITER}-${Date.now()}`;
  const iterStart = Date.now();

  // Track approximate current rate
  const elapsed = (Date.now() - __ENV.__START_TIME) / 1000;
  currentRate.add(__ITER / Math.max(elapsed, 1));

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
    `${API_URL}/api/drop/${DROP_ID}/register`,
    JSON.stringify({
      userId,
      tickets: 1,
      botValidation: {
        fingerprint: `k6-bp-fp-${__VU}`,
        fingerprintConfidence: 99,
        timingMs: 1000,
        powSolution: solution,
        powChallenge: challenge,
      },
    }),
    { headers: JSON_HEADERS, timeout: "30s" }
  );

  const regDuration = Date.now() - regStart;
  registrationTime.add(regDuration);

  if (registerRes.status === 200) {
    registrationSuccess.add(1);
    errorRate.add(0);
  } else {
    registrationFailed.add(1);
    errorRate.add(1);

    // Track when errors start appearing
    if (!errorStartRate) {
      const currentReqRate = __ITER / Math.max((Date.now() - __ENV.__START_TIME) / 1000, 1);
      console.log(`⚠️ First error at ~${currentReqRate.toFixed(1)} req/s: ${registerRes.status}`);
    }
  }

  // Track when latency degrades significantly (>1s)
  if (regDuration > 1000 && !degradationStartRate) {
    const currentReqRate = __ITER / Math.max((Date.now() - __ENV.__START_TIME) / 1000, 1);
    console.log(`⚠️ Latency degradation at ~${currentReqRate.toFixed(1)} req/s: ${regDuration}ms`);
  }
}

export function setup() {
  // Store start time for rate calculation
  __ENV.__START_TIME = Date.now();
  console.log(`\n🎯 Breakpoint Test: Ramping from 10 to ${MAX_RATE} req/s\n`);
  return { startTime: Date.now() };
}

export function handleSummary(data) {
  const successCount = data.metrics.registration_success?.values?.count || 0;
  const failedCount = data.metrics.registration_failed?.values?.count || 0;
  const total = successCount + failedCount;

  const regP50 = data.metrics.registration_time?.values?.["p(50)"] || 0;
  const regP95 = data.metrics.registration_time?.values?.["p(95)"] || 0;
  const regP99 = data.metrics.registration_time?.values?.["p(99)"] || 0;
  const regMax = data.metrics.registration_time?.values?.max || 0;

  const httpReqRate = data.metrics.http_reqs?.values?.rate || 0;
  const errorRateValue = data.metrics.error_rate?.values?.rate || 0;

  // Estimate sustainable rate (where p95 < 2s and error rate < 5%)
  let sustainableRate = "Unknown";
  if (regP95 < 2000 && errorRateValue < 0.05) {
    sustainableRate = `~${httpReqRate.toFixed(0)} req/s (peak maintained)`;
  } else if (regP95 > 2000) {
    sustainableRate = `<${MAX_RATE} req/s (latency limited)`;
  } else {
    sustainableRate = `<${MAX_RATE} req/s (error limited)`;
  }

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            📈 K6 BREAKPOINT TEST RESULTS                   ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Target Max Rate:    ${MAX_RATE.toString().padStart(5)} req/s                       ║`);
  console.log(`║  Actual Peak Rate:   ${httpReqRate.toFixed(1).padStart(5)} req/s                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Throughput                                                ║");
  console.log(`║    Total Requests:   ${total.toString().padStart(5)}                          ║`);
  console.log(`║    ✅ Successful:    ${successCount.toString().padStart(5)} (${total > 0 ? ((successCount / total) * 100).toFixed(0) : 0}%)                      ║`);
  console.log(`║    ❌ Failed:        ${failedCount.toString().padStart(5)}                          ║`);
  console.log(`║    Error Rate:       ${(errorRateValue * 100).toFixed(1).padStart(5)}%                         ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Latency                                                   ║");
  console.log(`║    p50:              ${Math.round(regP50).toString().padStart(5)} ms                       ║`);
  console.log(`║    p95:              ${Math.round(regP95).toString().padStart(5)} ms                       ║`);
  console.log(`║    p99:              ${Math.round(regP99).toString().padStart(5)} ms                       ║`);
  console.log(`║    Max:              ${Math.round(regMax).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Analysis                                                  ║");
  console.log(`║    Sustainable Rate: ${sustainableRate.padEnd(36)}║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Provide recommendations
  if (errorRateValue > 0.1) {
    console.log("⚠️  High error rate detected. Consider:");
    console.log("   - Increasing Restate resources");
    console.log("   - Adding rate limiting");
    console.log("   - Scaling horizontally\n");
  }

  if (regP95 > 3000) {
    console.log("⚠️  High latency detected. Consider:");
    console.log("   - Optimizing PoW difficulty");
    console.log("   - Database/NATS connection pooling");
    console.log("   - Caching frequently accessed state\n");
  }

  return {};
}

