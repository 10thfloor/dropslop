/**
 * Standalone API Server Entrypoint for Fly.io
 * Runs only the REST API server
 */
import { serve } from "@hono/node-server";
import apiApp from "../../src/api/server.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`Starting API server on port ${PORT}...`);

serve({
  fetch: apiApp.fetch,
  port: PORT,
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop API Server                        ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(4)}                                          ║
║  NATS: ${(process.env.NATS_URL || "not configured").padEnd(40)}  ║
║  Restate: ${(process.env.RESTATE_INGRESS_URL || "not configured").padEnd(37)}  ║
╚══════════════════════════════════════════════════════════╝
`);

