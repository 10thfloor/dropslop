# Fly.io Deployment Guide

This directory contains all configuration and scripts needed to deploy the Product Drop application on Fly.io.

## Quick Start

```bash
# Deploy with default prefix (your username)
./fly/deploy.sh

# Or with a custom prefix
APP_PREFIX=mycompany-drop ./fly/deploy.sh
```

The `APP_PREFIX` determines your app names (e.g., `mycompany-drop-api`, `mycompany-drop-web`, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fly.io Private Network                   │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  drop-api   │    │  drop-sse   │    │     drop-web        │ │
│  │  (Hono)     │    │  (Hono)     │    │     (Next.js)       │ │
│  │  Port 8080  │    │  Port 8080  │    │     Port 3000       │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                      │             │
│         │    ┌─────────────┴────────────┐        │             │
│         │    │                          │        │             │
│  ┌──────▼────▼──┐              ┌────────▼────────▼─┐           │
│  │   restate    │◄────────────►│   restate-worker  │           │
│  │   (Runtime)  │              │   (SDK Services)  │           │
│  │   8080/9070  │              │      Port 8080    │           │
│  └──────────────┘              └───────────────────┘           │
│         │                                │                      │
│         └────────────┬───────────────────┘                     │
│                      │                                          │
│              ┌───────▼───────┐                                 │
│              │   drop-nats   │                                 │
│              │  Port 4222    │                                 │
│              └───────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Type | URL | Purpose |
|---------|------|-----|---------|
| `drop-nats` | Internal | `nats://drop-nats.internal:4222` | Message broker for real-time events |
| `drop-restate` | Internal | `http://drop-restate.internal:8080` | Durable execution runtime |
| `drop-worker` | Internal | `http://drop-worker.internal:8080` | Restate service handlers |
| `drop-api` | Public | `https://drop-api.fly.dev` | REST API |
| `drop-sse` | Public | `https://drop-sse.fly.dev` | Server-Sent Events |
| `drop-web` | Public | `https://drop-web.fly.dev` | Next.js frontend |

## Prerequisites

1. Install the Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login to Fly:
   ```bash
   flyctl auth login
   ```

## Quick Deploy

Run the deployment script from the project root:

```bash
./fly/deploy.sh
```

The script will:
1. Create all Fly apps if they don't exist
2. Create persistent volumes for NATS and Restate
3. Deploy services in the correct order
4. Register the Restate worker with the runtime

## Manual Deployment

If you prefer to deploy manually or need to redeploy a single service:

### 1. Create Apps

```bash
flyctl apps create drop-nats
flyctl apps create drop-restate
flyctl apps create drop-worker
flyctl apps create drop-api
flyctl apps create drop-sse
flyctl apps create drop-web
```

### 2. Create Volumes

```bash
flyctl volumes create nats_data -a drop-nats --region sjc --size 1
flyctl volumes create restate_data -a drop-restate --region sjc --size 10
```

### 3. Deploy Services (in order)

```bash
# NATS first
flyctl deploy -a drop-nats -c fly/nats/fly.toml

# Restate runtime
flyctl deploy -a drop-restate -c fly/restate/fly.toml

# Restate worker
flyctl deploy -a drop-worker -c fly/worker/fly.toml --dockerfile fly/worker/Dockerfile

# Register worker with Restate
flyctl ssh console -a drop-restate -C "curl -X POST http://localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{\"uri\":\"http://drop-worker.internal:8080\"}'"

# API and SSE servers
flyctl deploy -a drop-api -c fly/api/fly.toml --dockerfile fly/api/Dockerfile
flyctl deploy -a drop-sse -c fly/sse/fly.toml --dockerfile fly/sse/Dockerfile

# Frontend
flyctl deploy -a drop-web -c fly/web/fly.toml --dockerfile fly/web/Dockerfile
```

## Configuration

### Environment Variables

Each service reads configuration from environment variables set in `fly.toml`:

| Variable | Service | Description |
|----------|---------|-------------|
| `NATS_URL` | API, SSE, Worker | NATS connection string |
| `RESTATE_INGRESS_URL` | API, SSE | Restate ingress endpoint |
| `INTERNAL_API_URL` | Web | API server for Next.js rewrites |
| `INTERNAL_SSE_URL` | Web | SSE server for Next.js rewrites |
| `CORS_ORIGINS` | API, SSE | Comma-separated allowed origins |

### Secrets

Set secrets for sensitive values:

```bash
# Example: Set a secret API key
flyctl secrets set API_SECRET_KEY=your-secret -a drop-api
```

### Custom Domain

To use a custom domain:

```bash
flyctl certs create yourdomain.com -a drop-web
```

Then add a CNAME record pointing to `drop-web.fly.dev`.

## Scaling

### Horizontal Scaling

Scale the stateless services (API, SSE, Web):

```bash
# Scale API to 3 instances
flyctl scale count 3 -a drop-api

# Scale SSE to handle more concurrent connections
flyctl scale count 2 -a drop-sse
```

### Vertical Scaling

Increase VM resources:

```bash
# Upgrade API to dedicated CPU
flyctl scale vm dedicated-cpu-1x -a drop-api

# Increase memory
flyctl scale memory 1024 -a drop-sse
```

## Monitoring

### Logs

```bash
# View logs for a service
flyctl logs -a drop-api

# Follow logs in real-time
flyctl logs -a drop-sse -f
```

### Metrics

View metrics in the Fly.io dashboard or use:

```bash
flyctl status -a drop-api
flyctl vm status -a drop-api
```

### Health Checks

All services have health check endpoints:
- API: `GET /health`
- SSE: `GET /health`
- Restate: `GET /health` (port 8080)

## Troubleshooting

### Service can't connect to NATS

1. Check NATS is running: `flyctl status -a drop-nats`
2. Verify DNS resolution: `flyctl ssh console -a drop-api -C "nslookup drop-nats.internal"`

### Restate worker not registered

Register manually:

```bash
flyctl ssh console -a drop-restate -C "curl -X POST http://localhost:9070/deployments \
  -H 'content-type: application/json' \
  -d '{\"uri\":\"http://drop-worker.internal:8080\"}'"
```

### SSE connections dropping

1. Check concurrency settings in `fly/sse/fly.toml`
2. Increase `idle_timeout` if needed
3. Scale horizontally: `flyctl scale count 2 -a drop-sse`

### Build failures

1. Ensure Docker is running locally
2. Check Dockerfile syntax
3. Try building locally first: `docker build -f fly/api/Dockerfile .`

## Directory Structure

```
fly/
├── deploy.sh           # Full deployment script
├── README.md           # This file
├── nats/
│   └── fly.toml        # NATS server configuration
├── restate/
│   └── fly.toml        # Restate runtime configuration
├── worker/
│   ├── fly.toml        # Worker configuration
│   ├── Dockerfile      # Worker Docker build
│   └── entrypoint.ts   # Standalone worker entrypoint
├── api/
│   ├── fly.toml        # API server configuration
│   ├── Dockerfile      # API Docker build
│   └── entrypoint.ts   # Standalone API entrypoint
├── sse/
│   ├── fly.toml        # SSE server configuration
│   ├── Dockerfile      # SSE Docker build
│   └── entrypoint.ts   # Standalone SSE entrypoint
└── web/
    ├── fly.toml        # Next.js configuration
    ├── Dockerfile      # Next.js Docker build
    └── next.config.fly.ts  # Fly-specific Next.js config
```

## Cost Estimation

Based on Fly.io's pricing (as of 2024):

| Service | VM | Memory | Estimated Monthly |
|---------|-----|--------|-------------------|
| drop-nats | shared-cpu-1x | 512MB | ~$5 |
| drop-restate | shared-cpu-1x | 1GB | ~$7 |
| drop-worker | shared-cpu-1x | 512MB | ~$5 |
| drop-api | shared-cpu-1x | 512MB | ~$5 |
| drop-sse | shared-cpu-1x | 512MB | ~$5 |
| drop-web | shared-cpu-1x | 512MB | ~$5 |
| **Total** | | | **~$32/month** |

Note: Volumes are billed separately (~$0.15/GB/month).

