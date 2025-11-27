/**
 * Standalone Restate Worker Entrypoint for Fly.io
 * Runs only the Restate service handlers
 */
import * as restate from "@restatedev/restate-sdk";
import { dropObject } from "../../src/restate/drop.js";
import { participantObject } from "../../src/restate/participant.js";
import { userRolloverObject } from "../../src/restate/user-rollover.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`Starting Restate Worker on port ${PORT}...`);

// Create Restate server with services
restate.serve({
  services: [dropObject, participantObject, userRolloverObject],
  port: PORT,
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop Restate Worker                    ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(4)}                                          ║
║  NATS: ${(process.env.NATS_URL || "not configured").padEnd(40)}  ║
║  Services: Drop, Participant, UserRollover               ║
╚══════════════════════════════════════════════════════════╝
`);

