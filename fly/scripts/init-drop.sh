#!/bin/bash
# Initialize a product drop in production
# Run from your local machine (not inside Fly)

set -e

# Use the same APP_PREFIX as deploy.sh
APP_PREFIX="${APP_PREFIX:-$(whoami)-drop}"
APP_RESTATE="${APP_PREFIX}-restate"

# Default values
DROP_ID="${1:-drop-$(date +%Y%m%d-%H%M%S)}"
INVENTORY="${2:-100}"
DURATION_MINUTES="${3:-30}"
PRICE_UNIT="${4:-1}"
MAX_TICKETS="${5:-10}"

echo "Using app prefix: $APP_PREFIX"
echo ""
echo "Initializing drop with:"
echo "  Drop ID: $DROP_ID"
echo "  Inventory: $INVENTORY"
echo "  Duration: $DURATION_MINUTES minutes"
echo "  Price Unit: $PRICE_UNIT"
echo "  Max Tickets: $MAX_TICKETS"
echo ""

# Calculate timestamps
NOW=$(date +%s)
REGISTRATION_START=$((NOW - 1))
REGISTRATION_END=$((NOW + DURATION_MINUTES * 60))
PURCHASE_WINDOW=600  # 10 minutes

# Build the JSON payload
PAYLOAD=$(cat <<EOF
{
  "dropId": "$DROP_ID",
  "inventory": $INVENTORY,
  "registrationStart": ${REGISTRATION_START}000,
  "registrationEnd": ${REGISTRATION_END}000,
  "purchaseWindow": $PURCHASE_WINDOW,
  "ticketPriceUnit": $PRICE_UNIT,
  "maxTicketsPerUser": $MAX_TICKETS
}
EOF
)

echo "Payload: $PAYLOAD"
echo ""

# Initialize via Restate
echo "Calling Restate to initialize drop..."

flyctl ssh console -a "$APP_RESTATE" -C "curl -s -X POST http://localhost:8080/Drop/$DROP_ID/initialize \
  -H 'content-type: application/json' \
  -d '$PAYLOAD'"

echo ""
echo "Drop initialized!"
echo ""
echo "Access it at: https://${APP_PREFIX}-web.fly.dev/drop/$DROP_ID"
