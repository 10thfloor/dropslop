# API Server Dockerfile
# Build context: project root (../../)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build the main project
RUN pnpm run build
# Build the standalone entrypoint
RUN pnpm exec tsup fly/api/entrypoint.ts --format esm --out-dir fly/api/dist --target es2022

# Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy built output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/fly/api/dist ./fly/api/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["node", "fly/api/dist/entrypoint.js"]

