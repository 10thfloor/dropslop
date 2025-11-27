/**
 * Standalone SSE Server Entrypoint for Fly.io
 * Runs only the Server-Sent Events server
 */
import { serve } from "@hono/node-server";
import sseApp from "../../src/sse/server.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`Starting SSE server on port ${PORT}...`);

serve({
  fetch: sseApp.fetch,
  port: PORT,
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop SSE Server                        ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(4)}                                          ║
║  NATS: ${(process.env.NATS_URL || "not configured").padEnd(40)}  ║
║  Restate: ${(process.env.RESTATE_INGRESS_URL || "not configured").padEnd(37)}  ║
╚══════════════════════════════════════════════════════════╝
`);

