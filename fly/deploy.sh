#!/bin/bash
# Fly.io Deployment Script for Product Drop
# Run from the project root directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# Set APP_PREFIX to make app names unique (e.g., your-company-drop)
# Default: your username + "-drop" (e.g., "john-drop")
APP_PREFIX="${APP_PREFIX:-$(whoami)-drop}"
REGION="${FLY_REGION:-sjc}"
ORG="${FLY_ORG:-personal}"

# Production app URL (used for CORS)
WEB_ORIGIN="https://${APP_PREFIX}-web.fly.dev"

# Derived app names
APP_NATS="${APP_PREFIX}-nats"
APP_RESTATE="${APP_PREFIX}-restate"
APP_WORKER="${APP_PREFIX}-worker"
APP_API="${APP_PREFIX}-api"
APP_SSE="${APP_PREFIX}-sse"
APP_WEB="${APP_PREFIX}-web"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Product Drop - Fly.io Deployment               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "App prefix: ${GREEN}${APP_PREFIX}${NC}"
echo -e "Region: ${GREEN}${REGION}${NC}"
echo -e "Organization: ${GREEN}${ORG}${NC}"
echo ""

# Check for flyctl
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}Error: flyctl is not installed.${NC}"
    echo "Install it with: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check authentication
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Fly.io. Running flyctl auth login...${NC}"
    flyctl auth login
fi

# Function to create app if it doesn't exist
create_app_if_needed() {
    local app_name=$1
    
    if flyctl apps list | grep -q "^$app_name "; then
        echo -e "${GREEN}✓ App $app_name already exists${NC}"
    else
        echo -e "${YELLOW}Creating app $app_name...${NC}"
        flyctl apps create "$app_name" --org "$ORG"
    fi
}

# Function to create volume if it doesn't exist
create_volume_if_needed() {
    local app_name=$1
    local volume_name=$2
    local size=$3
    
    if flyctl volumes list -a "$app_name" 2>/dev/null | grep -q "$volume_name"; then
        echo -e "${GREEN}✓ Volume $volume_name already exists for $app_name${NC}"
    else
        echo -e "${YELLOW}Creating volume $volume_name for $app_name...${NC}"
        flyctl volumes create "$volume_name" -a "$app_name" --region "$REGION" --size "$size" --yes
    fi
}

# Function to set app secrets for internal networking
set_internal_urls() {
    local app_name=$1
    
    echo "Setting internal service URLs for $app_name..."
    flyctl secrets set -a "$app_name" \
        NATS_URL="nats://${APP_NATS}.internal:4222" \
        RESTATE_INGRESS_URL="http://${APP_RESTATE}.internal:8080" \
        --stage
}

# Warn if recommended/required secrets are missing from the local environment.
# We don't auto-generate these to avoid accidental rotation on redeploy.
warn_missing_secrets() {
    local app_name=$1
    local missing=0

    if [[ -z "$CORS_ORIGINS" ]]; then
        echo -e "${YELLOW}Warning: CORS_ORIGINS not set locally. Will default to ${WEB_ORIGIN} for $app_name.${NC}"
    fi

    if [[ -z "$ADMIN_SECRET" ]]; then
        echo -e "${YELLOW}Warning: ADMIN_SECRET not set locally. Consider: flyctl secrets set ADMIN_SECRET=... -a $app_name${NC}"
        missing=1
    fi

    if [[ -z "$PURCHASE_TOKEN_SECRET" ]]; then
        echo -e "${YELLOW}Warning: PURCHASE_TOKEN_SECRET not set locally. Consider setting it for $app_name.${NC}"
        missing=1
    fi

    if [[ -z "$IP_HASH_SALT" ]]; then
        echo -e "${YELLOW}Warning: IP_HASH_SALT not set locally. Consider setting it for $app_name.${NC}"
    fi

    return $missing
}

# ============================================================
# Step 1: Create all Fly apps
# ============================================================
echo ""
echo -e "${BLUE}Step 1: Creating Fly apps...${NC}"
echo "-----------------------------------------------------------"

create_app_if_needed "$APP_NATS"
create_app_if_needed "$APP_RESTATE"
create_app_if_needed "$APP_WORKER"
create_app_if_needed "$APP_API"
create_app_if_needed "$APP_SSE"
create_app_if_needed "$APP_WEB"

# ============================================================
# Step 2: Create volumes for stateful services
# ============================================================
echo ""
echo -e "${BLUE}Step 2: Creating volumes...${NC}"
echo "-----------------------------------------------------------"

create_volume_if_needed "$APP_NATS" "nats_data" 1
create_volume_if_needed "$APP_RESTATE" "restate_data" 10

# ============================================================
# Step 3: Deploy NATS (must be first - other services depend on it)
# ============================================================
echo ""
echo -e "${BLUE}Step 3: Deploying NATS...${NC}"
echo "-----------------------------------------------------------"

flyctl deploy -a "$APP_NATS" -c fly/nats/fly.toml --dockerfile fly/nats/Dockerfile --wait-timeout 300 --yes

echo -e "${GREEN}✓ NATS deployed${NC}"

# ============================================================
# Step 4: Deploy Restate Runtime
# ============================================================
echo ""
echo -e "${BLUE}Step 4: Deploying Restate Runtime...${NC}"
echo "-----------------------------------------------------------"

flyctl deploy -a "$APP_RESTATE" -c fly/restate/fly.toml --wait-timeout 300 --yes

echo -e "${GREEN}✓ Restate Runtime deployed${NC}"

# ============================================================
# Step 5: Deploy Restate Worker
# ============================================================
echo ""
echo -e "${BLUE}Step 5: Deploying Restate Worker...${NC}"
echo "-----------------------------------------------------------"

# Set internal URLs before deploying
flyctl secrets set -a "$APP_WORKER" \
    NATS_URL="nats://${APP_NATS}.internal:4222" \
    --stage 2>/dev/null || true

flyctl deploy -a "$APP_WORKER" -c fly/worker/fly.toml --dockerfile fly/worker/Dockerfile --wait-timeout 300 --yes

echo -e "${GREEN}✓ Restate Worker deployed${NC}"

# ============================================================
# Step 6: Register Worker with Restate
# ============================================================
echo ""
echo -e "${BLUE}Step 6: Registering Worker with Restate...${NC}"
echo "-----------------------------------------------------------"

# Use flyctl proxy to temporarily connect to Restate admin port
echo "Registering worker deployment with Restate..."

REGISTER_PAYLOAD="{\"uri\":\"http://${APP_WORKER}.internal:8080\"}"
REGISTER_RESP=$(
  flyctl ssh console -a "$APP_RESTATE" -C "curl -sS -X POST http://localhost:9070/deployments \
    -H 'content-type: application/json' \
    -d '$REGISTER_PAYLOAD'" || true
)
echo "$REGISTER_RESP"

# Verify that Restate now knows about services (Drop, etc). If not, fail early.
SERVICES_RESP=$(
  flyctl ssh console -a "$APP_RESTATE" -C "curl -sS http://localhost:9070/services" || true
)
if echo "$SERVICES_RESP" | grep -q "\"services\""; then
  echo -e "${GREEN}✓ Worker registered (services visible)${NC}"
else
  echo -e "${RED}ERROR: Worker registration did not take effect (no /services output).${NC}"
  echo -e "${YELLOW}Try manually:${NC} flyctl ssh console -a $APP_RESTATE -C \"curl -X POST http://localhost:9070/deployments -H 'content-type: application/json' -d '$REGISTER_PAYLOAD'\""
  exit 1
fi

echo -e "${GREEN}✓ Worker registered${NC}"

# ============================================================
# Step 7: Deploy API Server
# ============================================================
echo ""
echo -e "${BLUE}Step 7: Deploying API Server...${NC}"
echo "-----------------------------------------------------------"

# Set internal URLs before deploying
warn_missing_secrets "$APP_API" || true
flyctl secrets set -a "$APP_API" \
    NATS_URL="nats://${APP_NATS}.internal:4222" \
    RESTATE_INGRESS_URL="http://${APP_RESTATE}.internal:8080" \
    CORS_ORIGINS="${CORS_ORIGINS:-$WEB_ORIGIN}" \
    --stage 2>/dev/null || true

flyctl deploy -a "$APP_API" -c fly/api/fly.toml --dockerfile fly/api/Dockerfile --wait-timeout 300 --yes

echo -e "${GREEN}✓ API Server deployed${NC}"

# ============================================================
# Step 8: Deploy SSE Server
# ============================================================
echo ""
echo -e "${BLUE}Step 8: Deploying SSE Server...${NC}"
echo "-----------------------------------------------------------"

# Set internal URLs before deploying
warn_missing_secrets "$APP_SSE" || true
flyctl secrets set -a "$APP_SSE" \
    NATS_URL="nats://${APP_NATS}.internal:4222" \
    RESTATE_INGRESS_URL="http://${APP_RESTATE}.internal:8080" \
    CORS_ORIGINS="${CORS_ORIGINS:-$WEB_ORIGIN}" \
    --stage 2>/dev/null || true

flyctl deploy -a "$APP_SSE" -c fly/sse/fly.toml --dockerfile fly/sse/Dockerfile --wait-timeout 300 --yes

echo -e "${GREEN}✓ SSE Server deployed${NC}"

# ============================================================
# Step 9: Deploy Next.js Frontend
# ============================================================
echo ""
echo -e "${BLUE}Step 9: Deploying Next.js Frontend...${NC}"
echo "-----------------------------------------------------------"

# Set internal URLs for Next.js rewrites
flyctl secrets set -a "$APP_WEB" \
    INTERNAL_API_URL="http://${APP_API}.internal:8080" \
    INTERNAL_SSE_URL="http://${APP_SSE}.internal:8080" \
    --stage 2>/dev/null || true

flyctl deploy -a "$APP_WEB" -c fly/web/fly.toml --dockerfile fly/web/Dockerfile --wait-timeout 300 --yes

echo -e "${GREEN}✓ Next.js Frontend deployed${NC}"

# ============================================================
# Deployment Complete
# ============================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Deployment Complete!                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Your services are now running on Fly.io:"
echo ""
echo -e "  ${BLUE}Frontend:${NC}  https://${APP_WEB}.fly.dev"
echo -e "  ${BLUE}API:${NC}       https://${APP_API}.fly.dev"
echo -e "  ${BLUE}SSE:${NC}       https://${APP_SSE}.fly.dev"
echo ""
echo -e "Internal services (private network):"
echo -e "  ${BLUE}NATS:${NC}      nats://${APP_NATS}.internal:4222"
echo -e "  ${BLUE}Restate:${NC}   http://${APP_RESTATE}.internal:8080"
echo -e "  ${BLUE}Worker:${NC}    http://${APP_WORKER}.internal:8080"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Initialize a drop: flyctl ssh console -a $APP_API -C 'node -e \"...\"'"
echo "  2. Monitor logs: flyctl logs -a $APP_API"
echo "  3. Scale services: flyctl scale count 2 -a $APP_API"
echo ""
echo -e "${YELLOW}To redeploy with a different prefix:${NC}"
echo "  APP_PREFIX=mycompany-drop ./fly/deploy.sh"
echo ""
