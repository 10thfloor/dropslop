/**
 * Standalone Restate Worker Entrypoint for Fly.io
 * Runs only the Restate service handlers
 */
import * as restate from "@restatedev/restate-sdk";
import * as http2 from "node:http2";
import { dropObject } from "../../src/restate/drop.js";
import { participantObject } from "../../src/restate/participant.js";
import { userRolloverObject } from "../../src/restate/user-rollover.js";
import { userLoyaltyObject } from "../../src/restate/user-loyalty.js";
import { queueAdmissionObject } from "../../src/restate/queue-admission.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`Starting Restate Worker on port ${PORT}...`);

// Create Restate endpoint handler and explicitly bind to 0.0.0.0 (Fly health checks / routing)
// Ref: https://docs.restate.dev/develop/ts/serving
const handler = restate.createEndpointHandler({
  services: [
    dropObject,
    participantObject,
    userRolloverObject,
    userLoyaltyObject,
    queueAdmissionObject,
  ],
});

const server = http2.createServer(handler);
// Fly private networking is IPv6 (6PN). Bind to IPv6-any so Restate runtime can reach us via *.internal.
// This typically also accepts IPv4-mapped connections where supported.
server.listen(PORT, "::");

console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop Restate Worker                    ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(4)}                                          ║
║  NATS: ${(process.env.NATS_URL || "not configured").padEnd(40)}  ║
║  Services: Drop, Participant, UserRollover, UserLoyalty, QueueAdmission ║
╚══════════════════════════════════════════════════════════╝
`);
