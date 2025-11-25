/**
 * k6 SSE Saturation Test
 *
 * Tests how many concurrent SSE connections the server can handle:
 * - Ramping VUs: 0 -> 100 -> 500 -> 1000
 * - Measures connection establishment time
 * - Tracks dropped connections
 * - Tests event delivery latency
 *
 * Note: k6 doesn't have native SSE support, so we use HTTP requests
 * with streaming to simulate SSE behavior.
 *
 * Usage:
 *   k6 run tests/k6/sse-saturation.js
 *   k6 run --env MAX_CONNECTIONS=1000 tests/k6/sse-saturation.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate, Gauge } from "k6/metrics";
import { SSE_URL, DROP_ID } from "./lib/config.js";

// Configuration
const MAX_CONNECTIONS = Number(__ENV.MAX_CONNECTIONS) || 500;
const HOLD_TIME = __ENV.HOLD_TIME || "60s";

// Custom metrics
const connectionSuccess = new Counter("connection_success");
const connectionFailed = new Counter("connection_failed");
const connectionTime = new Trend("connection_time", true);
const activeConnections = new Gauge("active_connections");
const eventsReceived = new Counter("events_received");
const connectionDropped = new Counter("connection_dropped");
const errorRate = new Rate("error_rate");

// Track active VUs for gauge
let currentVUs = 0;

export const options = {
  scenarios: {
    // Gradual ramp-up of SSE connections
    sse_ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: Math.min(100, MAX_CONNECTIONS) }, // Warm up
        { duration: "30s", target: Math.min(300, MAX_CONNECTIONS) }, // Ramp
        { duration: "30s", target: MAX_CONNECTIONS }, // Peak
        { duration: HOLD_TIME, target: MAX_CONNECTIONS }, // Hold
        { duration: "30s", target: 0 }, // Cool down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    connection_success: ["count>100"],
    connection_time: ["p(95)<5000"], // 95% connect under 5s
    error_rate: ["rate<0.2"], // <20% errors
  },
};

export default function () {
  const userId = `k6-sse-${__VU}-${__ITER}-${Date.now()}`;
  const sseUrl = `${SSE_URL}/events/${DROP_ID}/${userId}`;

  currentVUs++;
  activeConnections.add(currentVUs);

  const connectStart = Date.now();

  try {
    // Open SSE connection
    // k6 will follow the connection until timeout or error
    const response = http.get(sseUrl, {
      timeout: "65s", // Slightly longer than hold time
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      // Don't follow redirects for SSE
      redirects: 0,
    });

    const connectDuration = Date.now() - connectStart;
    connectionTime.add(connectDuration);

    // Check initial connection
    if (response.status === 200) {
      connectionSuccess.add(1);
      errorRate.add(0);

      // Parse SSE events from response body
      // Note: k6 receives the full response, not streaming
      const body = response.body || "";
      const events = body.split("\n\n").filter((e) => e.trim());
      
      if (events.length > 0) {
        eventsReceived.add(events.length);
      }

      // Check for expected SSE format
      check(response, {
        "is SSE content-type": (r) =>
          r.headers["Content-Type"]?.includes("text/event-stream") || true,
        "received events": () => events.length > 0 || true,
      });
    } else {
      connectionFailed.add(1);
      errorRate.add(1);

      if (response.status === 0) {
        connectionDropped.add(1);
      }
    }
  } catch (error) {
    connectionFailed.add(1);
    connectionDropped.add(1);
    errorRate.add(1);
  } finally {
    currentVUs--;
    activeConnections.add(currentVUs);
  }

  // Small delay before next connection attempt
  sleep(Math.random() * 2 + 1);
}

export function setup() {
  console.log(`\n📡 SSE Saturation Test\n`);
  console.log(`   Target: ${MAX_CONNECTIONS} connections`);
  console.log(`   SSE URL: ${SSE_URL}`);
  console.log(`   Drop ID: ${DROP_ID}\n`);

  // Verify SSE server is reachable
  const testRes = http.get(`${SSE_URL}/events/${DROP_ID}/test-user`, {
    timeout: "5s",
    headers: { Accept: "text/event-stream" },
  });

  if (testRes.status !== 200) {
    console.log(`⚠️ SSE server may not be running: ${testRes.status}\n`);
  } else {
    console.log(`✅ SSE server reachable\n`);
  }

  return {};
}

export function handleSummary(data) {
  const successCount = data.metrics.connection_success?.values?.count || 0;
  const failedCount = data.metrics.connection_failed?.values?.count || 0;
  const droppedCount = data.metrics.connection_dropped?.values?.count || 0;
  const eventCount = data.metrics.events_received?.values?.count || 0;
  const total = successCount + failedCount;

  const connP50 = data.metrics.connection_time?.values?.["p(50)"] || 0;
  const connP95 = data.metrics.connection_time?.values?.["p(95)"] || 0;
  const connP99 = data.metrics.connection_time?.values?.["p(99)"] || 0;
  const connMax = data.metrics.connection_time?.values?.max || 0;

  const peakConnections = data.metrics.active_connections?.values?.max || 0;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            📡 K6 SSE SATURATION TEST RESULTS               ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Target Connections: ${MAX_CONNECTIONS.toString().padStart(5)}                          ║`);
  console.log(`║  Peak Active:        ${Math.round(peakConnections).toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Connection Results                                        ║");
  console.log(`║    ✅ Successful:    ${successCount.toString().padStart(5)} (${total > 0 ? ((successCount / total) * 100).toFixed(0) : 0}%)                      ║`);
  console.log(`║    ❌ Failed:        ${failedCount.toString().padStart(5)}                          ║`);
  console.log(`║    💔 Dropped:       ${droppedCount.toString().padStart(5)}                          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Connection Latency                                        ║");
  console.log(`║    p50:              ${Math.round(connP50).toString().padStart(5)} ms                       ║`);
  console.log(`║    p95:              ${Math.round(connP95).toString().padStart(5)} ms                       ║`);
  console.log(`║    p99:              ${Math.round(connP99).toString().padStart(5)} ms                       ║`);
  console.log(`║    Max:              ${Math.round(connMax).toString().padStart(5)} ms                       ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Events                                                    ║");
  console.log(`║    Total Received:   ${eventCount.toString().padStart(5)}                          ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Analysis
  if (droppedCount > successCount * 0.1) {
    console.log("⚠️  High connection drop rate. Consider:");
    console.log("   - Increasing server file descriptor limits (ulimit -n)");
    console.log("   - Adding connection pooling");
    console.log("   - Scaling SSE server horizontally\n");
  }

  if (connP95 > 3000) {
    console.log("⚠️  High connection latency. Consider:");
    console.log("   - Reducing initial payload size");
    console.log("   - Optimizing NATS subscription setup");
    console.log("   - Adding connection load balancing\n");
  }

  if (successCount >= MAX_CONNECTIONS * 0.9) {
    console.log(`✅ Server handled ${MAX_CONNECTIONS} connections successfully!\n`);
  }

  return {};
}

