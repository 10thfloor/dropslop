/**
 * Main application entry point
 * Starts API, SSE, and Restate servers
 */

import "./lib/env-loader.js";
import { serve } from "@hono/node-server";
import apiApp from "./api/server.js";
import sseApp from "./sse/server.js";
import "./restate/server.js"; // Import to start Restate server
import { initNatsKv } from "./lib/nats-kv.js";
import { config } from "./lib/config.js";
import { validateStartup, printStartupBanner } from "./lib/startup.js";

// Validate environment variables at startup
validateStartup();

// Initialize NATS KV stores for distributed state
console.log("Initializing NATS KV stores...");
initNatsKv()
  .then(() => {
    console.log("NATS KV stores initialized");
  })
  .catch((err) => {
    console.error("Failed to initialize NATS KV stores:", err);
    console.warn(
      "Continuing without distributed state - single instance mode only"
    );
  });

// Start API server
console.log(`Starting API server on port ${config.server.apiPort}...`);
serve({
  fetch: apiApp.fetch,
  port: config.server.apiPort,
});

// Start SSE server
console.log(`Starting SSE server on port ${config.server.ssePort}...`);
serve({
  fetch: sseApp.fetch,
  port: config.server.ssePort,
});

// Restate server is started by importing restate/server.js
// It will listen on the port specified by RESTATE_PORT environment variable

// Print startup banner with connection info
printStartupBanner();
