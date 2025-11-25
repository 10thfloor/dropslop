import { serve } from "@hono/node-server";
import apiApp from "./api/server.js";
import sseApp from "./sse/server.js";
import "./restate/server.js"; // Import to start Restate server

const API_PORT = Number.parseInt(process.env.API_PORT || "3003", 10);
const SSE_PORT = Number.parseInt(process.env.SSE_PORT || "3004", 10);
const RESTATE_PORT = Number.parseInt(process.env.RESTATE_PORT || "8081", 10);

// Start API server
console.log(`Starting API server on port ${API_PORT}...`);
serve({
  fetch: apiApp.fetch,
  port: API_PORT,
});

// Start SSE server
console.log(`Starting SSE server on port ${SSE_PORT}...`);
serve({
  fetch: sseApp.fetch,
  port: SSE_PORT,
});

// Restate server is started by importing restate/server.js
// It will listen on the port specified by RESTATE_PORT environment variable
// or default to the Restate SDK default port

console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop Backend Started                   ║
╠══════════════════════════════════════════════════════════╣
║  API Server:      http://localhost:${API_PORT.toString().padEnd(
  4
)}                  ║
║  SSE Server:      http://localhost:${SSE_PORT.toString().padEnd(
  4
)}                  ║
║  Restate Worker:  http://localhost:${RESTATE_PORT.toString().padEnd(
  4
)}                  ║
╠══════════════════════════════════════════════════════════╣
║  Next steps:                                             ║
║  1. Start Restate: docker-compose up -d                  ║
║  2. Register worker with Restate:                        ║
║     curl localhost:9070/deployments -H 'content-type:    ║
║     application/json' -d '{"uri":"http://host.docker.    ║
║     internal:${RESTATE_PORT.toString().padEnd(
  4
)}"}'                                ║
║  3. Initialize a drop:                                   ║
║     npx tsx src/scripts/init-drop.ts                     ║
║  4. Open: http://localhost:${API_PORT.toString().padEnd(
  4
)}                          ║
╚══════════════════════════════════════════════════════════╝
`);
