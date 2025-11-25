#!/usr/bin/env tsx
/**
 * Initialize a demo drop
 * Usage: npx tsx src/scripts/init-drop.ts
 */

const RESTATE_URL = process.env.RESTATE_INGRESS_URL || "http://localhost:8080";

async function initDrop() {
  // Generate unique drop ID with timestamp, or use env var if provided
  const dropId = process.env.DROP_ID || `demo-drop-${Math.floor(Date.now() / 1000)}`;
  const now = Date.now();

  const config = {
    dropId,
    inventory: 10,
    registrationStart: now - 1000, // Started 1 second ago
    registrationEnd: now + 300000, // Ends in 5 minutes
    purchaseWindow: 600, // 10 minutes to complete purchase
  };

  console.log("Initializing drop with config:", config);

  try {
    const response = await fetch(`${RESTATE_URL}/Drop/${dropId}/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to initialize: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log("Drop initialized:", result);
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Drop initialized successfully!                           ║
╠═══════════════════════════════════════════════════════════╣
║  Drop ID: ${dropId.padEnd(44)}                            ║
║  Inventory: ${config.inventory.toString().padEnd(42)}     ║
║  Registration ends in: 5 minutes                          ║
║                                                           ║
║  Open http://localhost:3000 to test                       ║
╚═══════════════════════════════════════════════════════════╝
`);
  } catch (error) {
    console.error("Failed to initialize drop:", error);
    console.log(`
Make sure:
1. Restate is running: docker-compose up -d
2. Worker is registered: 
   curl localhost:9070/deployments -H 'content-type: application/json' \\
     -d '{"uri":"http://host.docker.internal:8081"}'
`);
    process.exit(1);
  }
}

initDrop();
