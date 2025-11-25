# Product Drop Backend System

A high-reliability product drop backend system with durable workflows, real-time updates, and multi-layered bot mitigation. Features a sleek Arc'teryx-inspired Next.js frontend.

## Features

- **Durable Execution**: Restate virtual objects ensure zero lost purchases
- **Fair Lottery**: Deterministic random selection ensures equal opportunity
- **Bot Resistance**: FingerprintJS + timing analysis + SHA-256 proof-of-work
- **Real-time Updates**: Server-Sent Events for live queue position
- **Crash Recovery**: Automatic state recovery on system failures
- **Purchase Protection**: Token expiration and double-purchase prevention
- **Modern UI**: Arc'teryx-inspired dark theme with Next.js + Tailwind CSS

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js + TypeScript (ESM) |
| Backend Framework | [Hono](https://hono.dev/) (lightweight, fast) |
| Durable Execution | [Restate](https://restate.dev/) SDK |
| Messaging | [NATS](https://nats.io/) v3 modular client |
| Frontend | Next.js 15 + Tailwind CSS |
| Load Testing | k6, Playwright |
| Package Manager | pnpm |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend                          :3005            │
│  - React components with SSE hooks                          │
│  - PoW solver, fingerprinting                               │
│  - Arc'teryx dark theme                                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  API Server (Hono)                         :3003            │
│  - Bot validation middleware                                │
│  - Routes: /api/drop/*, /api/pow/challenge                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  Restate Runtime (Docker)                                   │
│  - Ingress API: :8080                                       │
│  - Admin API:   :9070                                       │
│  - Drop & Participant virtual objects                       │
│  - Durable timers for phase transitions                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  SSE Server (Hono)                         :3004            │
│  - /events/:dropId/:userId endpoint                         │
│  - Real-time drop and user status polling                   │
└─────────────────────────────────────────────────────────────┘
```

## Design Deep Dive

### 1. Durable Execution with Restate

The core state machine uses [Restate](https://restate.dev/) virtual objects:

- **Drop**: Manages the lifecycle (registration → lottery → purchase → completed)
- **Participant**: Tracks individual user state per drop
- **UserRollover**: Global rollover balance across drops

This provides **automatic crash recovery**, **exactly-once semantics**, and **durable timers** for scheduled phase transitions. When you call:

```typescript
ctx.objectSendClient(dropObject, dropId, { delay: delayMs }).runLottery({});
```

That timer survives server restarts — Restate persists it and fires it at the right time.

### 2. Real-time Event System (NATS + SSE)

```
Restate handlers → publish to NATS → SSE server subscribes → pushes to browser
```

- **NATS v3 modular client** for pub/sub messaging between services
- **Server-Sent Events** for browser push (simpler than WebSockets for one-way updates)
- **Clock synchronization** with exponential moving average to handle client/server drift:

```typescript
// Smooth out network jitter for accurate countdowns
const alpha = 0.3;
return Math.round(prevOffset * (1 - alpha) + newOffset * alpha);
```

### 3. Deterministic Weighted Lottery

```typescript
// Expand participants by ticket count into a pool
for (const [userId, tickets] of entries) {
  for (let i = 0; i < tickets; i++) {
    pool.push(userId);
  }
}
// Shuffle with seeded RNG, select unique winners
const shuffled = seededShuffle(pool, seed);
```

- **Seeded RNG** (Linear Congruential Generator) ensures reproducibility
- **Fisher-Yates shuffle** for fair randomization
- **Weighted selection** where more tickets = more entries in the pool
- Each user can only win once (deduplication after shuffle)

### 4. Multi-Layer Bot Mitigation

| Layer | Weight | Technique |
|-------|--------|-----------|
| Fingerprinting | 40% | Browser fingerprint confidence score |
| Timing Analysis | 30% | Human-like interaction patterns (1-5s optimal) |
| Proof-of-Work | 30% | SHA-256 challenge solving |

The PoW challenge requires finding a nonce where `SHA256(challenge + nonce)` starts with N zeros — forces compute cost on the client before registration.

### 5. Rollover System

Clever engagement mechanic that reduces the sting of losing:

- **Paid entries that lose** → convert to rollover credits
- **Rollover credits auto-apply** to next drop registration (before free entry)
- **Stacks up to a maximum** to prevent infinite accumulation

```typescript
// Entry breakdown: rollover first, then free, then paid
const rolloverToUse = Math.min(rolloverBalance, desiredTickets);
const remainingAfterRollover = desiredTickets - rolloverToUse;
const freeEntry = remainingAfterRollover > 0 ? 1 : 0;
const paidEntries = Math.max(0, remainingAfterRollover - freeEntry);
```

### 6. Quadratic Ticket Pricing

Additional tickets cost progressively more, preventing whales from dominating:

```typescript
// Cost = 1² + 2² + ... + (n-1)² = n(n-1)(2n-1)/6
return ((n * (n + 1) * (2 * n + 1)) / 6) * priceUnit;
```

| Tickets | Total Cost |
|---------|------------|
| 1 | Free |
| 2 | $1 |
| 3 | $5 |
| 5 | $30 |
| 10 | $285 |

### 7. State Machine UX

The frontend gracefully handles every edge case with empathetic messaging:

- **Winner who didn't purchase in time** → "Time Expired" with encouragement
- **Missed registration entirely** → context-aware messaging based on current phase
- **Server clock sync** → smooth countdowns that don't jump around

---

## Quick Start (with Makefile)

The easiest way to run the project is using the Makefile:

```bash
# Install everything
make install

# Start Restate + backend + initialize drop
make dev

# In another terminal, start the frontend
make frontend

# Open http://localhost:3005
```

### Other useful commands

```bash
make status       # View drop state
make lottery      # Trigger lottery manually
make reset        # Quick reset (restart + re-init)
make reset-full   # Full reset (clear all state)
make logs         # View Restate logs
make help         # Show all available commands
```

---

## Manual Setup

### Prerequisites

- Node.js 20+ (or pnpm)
- Docker & Docker Compose

### 1. Install Dependencies

```bash
# Install backend dependencies
pnpm install

# Install frontend dependencies
cd web && pnpm install && cd ..
```

### 2. Start Restate Runtime

```bash
# Start Restate Docker container
docker-compose up -d

# Verify it's running
docker-compose ps
```

### 3. Start Backend Services

```bash
# Start API server, SSE server, and Restate worker
pnpm dev
```

You should see:

```
╔══════════════════════════════════════════════════════════╗
║           Product Drop Backend Started                   ║
╠══════════════════════════════════════════════════════════╣
║  API Server:      http://localhost:3003                  ║
║  SSE Server:      http://localhost:3004                  ║
║  Restate Worker:  http://localhost:9080                  ║
╚══════════════════════════════════════════════════════════╝
```

### 4. Register Worker with Restate

```bash
# Register the Restate worker (port 9080 is the SDK default)
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080"}'
```

### 5. Initialize a Demo Drop

```bash
# Create a drop with 5-minute registration window
NOW=$(date +%s)000
END=$((NOW + 300000))
curl localhost:8080/Drop/demo-drop-1/initialize \
  -H 'content-type: application/json' \
  -d "{\"dropId\":\"demo-drop-1\",\"inventory\":10,\"registrationStart\":$((NOW - 1000)),\"registrationEnd\":$END,\"purchaseWindow\":300}"
```

### 6. Start Frontend (Optional)

```bash
cd web && pnpm dev
```

Open <http://localhost:3005>

---

## Resetting the Project

### Full Reset (Clear All State)

```bash
# 1. Stop everything
docker-compose down

# 2. Remove Restate data volume (clears all state)
docker volume rm waitingroom_restate-data 2>/dev/null || true

# 3. Restart Restate
docker-compose up -d

# 4. Re-register worker (after starting backend with pnpm dev)
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080"}'

# 5. Initialize a new drop
NOW=$(date +%s)000
END=$((NOW + 300000))
curl localhost:8080/Drop/demo-drop-1/initialize \
  -H 'content-type: application/json' \
  -d "{\"dropId\":\"demo-drop-1\",\"inventory\":10,\"registrationStart\":$((NOW - 1000)),\"registrationEnd\":$END,\"purchaseWindow\":300}"
```

### Quick Reset (Keep Restate Running)

```bash
# Restart just the Restate container (clears in-memory state)
docker-compose restart

# Re-register worker
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080"}'

# Re-initialize drop
NOW=$(date +%s)000 && END=$((NOW + 300000)) && \
curl localhost:8080/Drop/demo-drop-1/initialize \
  -H 'content-type: application/json' \
  -d "{\"dropId\":\"demo-drop-1\",\"inventory\":10,\"registrationStart\":$((NOW - 1000)),\"registrationEnd\":$END,\"purchaseWindow\":300}"
```

---

## Restate Commands Reference

### Deployment Management

```bash
# List all deployments
curl localhost:9070/deployments

# Register a new deployment
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080"}'

# Force re-register (if services changed)
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080","force":true}'
```

### Invoking Services Directly

```bash
# Get drop state
curl localhost:8080/Drop/demo-drop-1/getState \
  -H 'content-type: application/json' \
  -d '{}'

# Trigger lottery manually
curl localhost:8080/Drop/demo-drop-1/runLottery \
  -H 'content-type: application/json' \
  -d '{}'

# Get participant state
curl localhost:8080/Participant/demo-drop-1:user-123/getState \
  -H 'content-type: application/json' \
  -d '{}'
```

### Viewing Invocations

```bash
# List all invocations (admin API)
curl localhost:9070/invocations

# Get specific invocation
curl localhost:9070/invocations/{invocation_id}
```

---

## Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| Next.js Frontend | 3005 | User interface |
| API Server | 3003 | REST API endpoints |
| SSE Server | 3004 | Real-time event streaming |
| Restate Ingress | 8080 | Service invocation API |
| Restate Admin | 9070 | Deployment & management API |
| Restate Worker | 9080 | SDK handler endpoint |

---

## API Endpoints

### Drop Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/drop/:id/register` | Register for a drop (requires PoW + fingerprint) |
| GET | `/api/drop/:id/status` | Get current drop status |
| POST | `/api/drop/:id/lottery` | Trigger lottery manually |
| POST | `/api/drop/:id/purchase/start` | Start purchase (get token) |
| POST | `/api/drop/:id/purchase` | Complete purchase |

### Proof of Work

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pow/challenge` | Get PoW challenge |

### SSE (Direct Connection)

| Method | Path | Description |
|--------|------|-------------|
| GET | `http://localhost:3004/events/:dropId/:userId` | SSE connection for real-time updates |

---

## Drop Lifecycle

```
REGISTRATION → LOTTERY → PURCHASE → COMPLETED
```

1. **Registration Phase**: Users register with bot validation
2. **Lottery Phase**: Fair random selection of winners
3. **Purchase Phase**: Winners can complete purchases within time window
4. **Completed**: All inventory sold or phase expires

---

## Bot Mitigation

The system uses a multi-layered approach with weighted scoring:

| Layer | Weight | Description |
|-------|--------|-------------|
| FingerprintJS | 40% | Browser fingerprinting confidence |
| Timing Analysis | 30% | Human-like interaction patterns (1-5s optimal) |
| Proof-of-Work | 30% | SHA-256 challenge solving |

**Trust Score Threshold**: 50/100 minimum to pass validation

---

## Environment Variables

```env
RESTATE_INGRESS_URL=http://localhost:8080
FINGERPRINT_API_KEY=your_fpjs_secret_key  # Optional for dev
POW_DIFFICULTY=2                          # Leading zero bytes required
API_PORT=3003
SSE_PORT=3004
```

---

## Project Structure

```
.
├── src/
│   ├── api/              # Hono API server
│   │   ├── routes/       # API route handlers
│   │   └── middleware/   # Bot guard, rate limiting
│   ├── sse/              # SSE server
│   ├── restate/          # Restate virtual objects
│   │   ├── drop.ts       # Drop state machine
│   │   └── participant.ts # Participant state
│   ├── lib/              # Shared utilities
│   └── scripts/          # CLI scripts
├── web/                  # Next.js frontend
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── hooks/            # Custom hooks (SSE, countdown)
│   └── lib/              # API client, types
└── docker-compose.yml    # Restate runtime
```

---

## Troubleshooting

### "Connection refused" on SSE

The backend servers aren't running. Start them with `pnpm dev`.

### "Deployment not found" or services not registered

Re-register the worker:

```bash
curl localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{"uri":"http://host.docker.internal:9080"}'
```

### Stuck invocations / infinite retries

Restart Restate to clear stuck state:

```bash
docker-compose restart
```

### CORS errors in browser

Make sure you're accessing the frontend at `http://localhost:3005` and the SSE server is running on port 3004.

### Hydration errors in Next.js

This was fixed - don't use `Date.now()` at module level. Use `useEffect` for client-only calculations.

---

## License

MIT
