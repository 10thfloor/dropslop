# Product Drop Backend - Makefile
# ================================

.PHONY: help install start stop backend frontend restate-up restate-down restate-restart \
        register init-drop reset reset-full status logs lottery clean setup nats-up nats-logs _ensure-infra \
        test-browser k6-spike k6-soak k6-lottery k6-bot k6-breakpoint k6-purchase k6-rollover k6-multi k6-sse test-all

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
BOLD := \033[1m
RESET := \033[0m

# Configuration
# Generate unique drop ID with timestamp if not specified
DROP_ID ?= demo-drop-$(shell date +%s)
INVENTORY ?= 10
REGISTRATION_MINUTES ?= 5

# Default target
help:
	@echo ""
	@echo "$(BOLD)$(CYAN)Product Drop Backend$(RESET)"
	@echo "====================="
	@echo ""
	@echo "$(BOLD)Recommended workflow:$(RESET)"
	@echo "  $(GREEN)1.$(RESET) make start       $(YELLOW)# Start Restate + register + init drop$(RESET)"
	@echo "  $(GREEN)2.$(RESET) make backend     $(YELLOW)# Run backend (foreground) - Terminal 1$(RESET)"
	@echo "  $(GREEN)3.$(RESET) make frontend    $(YELLOW)# Run frontend (foreground) - Terminal 2$(RESET)"
	@echo ""
	@echo "$(BOLD)Setup:$(RESET)"
	@echo "  make install        Install all dependencies"
	@echo "  make start          Start Restate + register worker + init drop"
	@echo "  make stop           Stop all services"
	@echo ""
	@echo "$(BOLD)Run Services (foreground):$(RESET)"
	@echo "  make backend        Start backend servers (API :3003, SSE :3004)"
	@echo "  make frontend       Start Next.js frontend (:3005)"
	@echo ""
	@echo "$(BOLD)Restate Management:$(RESET)"
	@echo "  make register       Register worker with Restate"
	@echo "  make init-drop      Initialize a demo drop"
	@echo "  make lottery        Trigger lottery manually"
	@echo "  make status         Show drop status"
	@echo ""
	@echo "$(BOLD)Reset:$(RESET)"
	@echo "  make reset          Quick reset (restart Restate + re-register)"
	@echo "  make reset-full     Full reset (clear all state)"
	@echo ""
	@echo "$(BOLD)Stress Testing:$(RESET)"
	@echo "  $(CYAN)Playwright (Browser E2E):$(RESET)"
	@echo "  make test-browser USERS=50      Real browser E2E test"
	@echo ""
	@echo "  $(CYAN)k6 Load Tests (install: brew install k6):$(RESET)"
	@echo "  make k6-spike                   Flash crowd simulation"
	@echo "  make k6-soak DURATION=30m       Long-running stability test"
	@echo "  make k6-lottery PARTICIPANTS=5000  Lottery stress test"
	@echo "  make k6-bot                     Bot detection/PoW stress test"
	@echo "  make k6-breakpoint              Find system breaking points"
	@echo "  make k6-purchase                Purchase flow test"
	@echo "  make k6-rollover                Rollover feature test"
	@echo "  make k6-multi                   Multi-drop concurrent test"
	@echo "  make k6-sse                     SSE connection saturation"
	@echo ""
	@echo "  make test-all                   Run all test suites"
	@echo ""
	@echo "$(BOLD)Utilities:$(RESET)"
	@echo "  make logs           Show Restate logs (foreground)"
	@echo "  make clean          Remove node_modules and build artifacts"
	@echo ""
	@echo "$(BOLD)Configuration:$(RESET)"
	@echo "  DROP_ID=$(DROP_ID)  INVENTORY=$(INVENTORY)  REGISTRATION_MINUTES=$(REGISTRATION_MINUTES)"
	@echo ""

# =============================================================================
# Setup & Lifecycle
# =============================================================================

install:
	@echo "$(CYAN)Installing backend dependencies...$(RESET)"
	pnpm install
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd web && pnpm install
	@echo "$(GREEN)✓ All dependencies installed$(RESET)"

# Start infrastructure (Restate) and prepare for development
start: restate-up _wait-restate register init-drop
	@echo ""
	@echo "$(GREEN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(GREEN)║  Infrastructure ready!                                     ║$(RESET)"
	@echo "$(GREEN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(GREEN)║  Restate:    http://localhost:8080 (ingress)               ║$(RESET)"
	@echo "$(GREEN)║              http://localhost:9070 (admin)                 ║$(RESET)"
	@echo "$(GREEN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(GREEN)║  $(BOLD)Next steps:$(RESET)$(GREEN)                                              ║$(RESET)"
	@echo "$(GREEN)║  1. Run $(CYAN)make backend$(GREEN)  in this terminal                  ║$(RESET)"
	@echo "$(GREEN)║  2. Run $(CYAN)make frontend$(GREEN) in another terminal               ║$(RESET)"
	@echo "$(GREEN)║  3. Open $(CYAN)http://localhost:3005$(GREEN)                          ║$(RESET)"
	@echo "$(GREEN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""

stop: restate-down
	@echo "$(GREEN)✓ All services stopped$(RESET)"

# Setup alias for first-time users
setup: install start
	@echo "$(GREEN)✓ Setup complete! Run 'make backend' to start.$(RESET)"

# =============================================================================
# Services (run in foreground)
# =============================================================================

backend: _ensure-infra
	@echo "$(CYAN)Starting backend servers...$(RESET)"
	@echo "  API Server:  http://localhost:3003"
	@echo "  SSE Server:  http://localhost:3004"
	@echo "  Worker:      http://localhost:9080"
	@echo "  NATS:        nats://localhost:4222"
	@echo ""
	@echo "$(YELLOW)Press Ctrl+C to stop$(RESET)"
	@echo ""
	pnpm dev

frontend:
	@echo "$(CYAN)Starting Next.js frontend...$(RESET)"
	@echo "  Frontend:    http://localhost:3005"
	@echo ""
	@echo "$(YELLOW)Press Ctrl+C to stop$(RESET)"
	@echo ""
	cd web && pnpm dev

# Ensure infrastructure is running (idempotent)
_ensure-infra:
	@if ! docker-compose ps --status running | grep -q nats; then \
		echo "$(CYAN)Starting infrastructure (Restate + NATS)...$(RESET)"; \
		docker-compose up -d; \
		sleep 2; \
		echo "$(GREEN)✓ Infrastructure started$(RESET)"; \
	else \
		echo "$(GREEN)✓ Infrastructure already running$(RESET)"; \
	fi

# =============================================================================
# NATS
# =============================================================================

nats-up:
	@echo "$(CYAN)Starting NATS...$(RESET)"
	@docker-compose up -d nats
	@echo "$(GREEN)✓ NATS container started$(RESET)"

nats-logs:
	@echo "$(CYAN)NATS logs (Ctrl+C to exit):$(RESET)"
	@docker-compose logs -f nats

restate-up:
	@echo "$(CYAN)Starting Restate & NATS...$(RESET)"
	@docker-compose up -d
	@echo "$(GREEN)✓ Infrastructure started$(RESET)"

restate-down:
	@echo "$(CYAN)Stopping Restate...$(RESET)"
	@docker-compose down
	@echo "$(GREEN)✓ Restate stopped$(RESET)"

restate-restart:
	@echo "$(CYAN)Restarting Restate...$(RESET)"
	@docker-compose restart
	@echo "$(GREEN)✓ Restate restarted$(RESET)"

_wait-restate:
	@echo "$(CYAN)Waiting for Restate to be ready...$(RESET)"
	@sleep 3
	@until curl -s localhost:9070/health > /dev/null 2>&1; do \
		echo "  Waiting..."; \
		sleep 1; \
	done
	@echo "$(GREEN)✓ Restate is ready$(RESET)"

# =============================================================================
# Restate Management
# =============================================================================

register:
	@echo "$(CYAN)Registering worker with Restate...$(RESET)"
	@curl -s localhost:9070/deployments \
		-H 'content-type: application/json' \
		-d '{"uri":"http://host.docker.internal:9080"}' > /dev/null 2>&1 || true
	@echo "$(GREEN)✓ Worker registered$(RESET)"

init-drop:
	@echo "$(CYAN)Initializing drop: $(DROP_ID)$(RESET)"
	@NOW=$$(date +%s)000; \
	END=$$((NOW + $(REGISTRATION_MINUTES) * 60000)); \
	curl -s localhost:8080/Drop/$(DROP_ID)/initialize \
		-H 'content-type: application/json' \
		-d "{\"dropId\":\"$(DROP_ID)\",\"inventory\":$(INVENTORY),\"registrationStart\":$$((NOW - 1000)),\"registrationEnd\":$$END,\"purchaseWindow\":300}" > /dev/null 2>&1 || true
	@echo "$(GREEN)✓ Drop initialized: $(DROP_ID) ($(INVENTORY) items, $(REGISTRATION_MINUTES) min)$(RESET)"

lottery:
	@echo "$(CYAN)Triggering lottery for $(DROP_ID)...$(RESET)"
	@curl -s localhost:8080/Drop/$(DROP_ID)/runLottery \
		-H 'content-type: application/json' \
		-d '{}'
	@echo ""
	@echo "$(GREEN)✓ Lottery triggered$(RESET)"

status:
	@echo "$(CYAN)Drop Status: $(DROP_ID)$(RESET)"
	@echo "────────────────────────"
	@curl -s localhost:8080/Drop/$(DROP_ID)/getState \
		-H 'content-type: application/json' \
		-d '{}' 2>/dev/null | python3 -m json.tool 2>/dev/null || \
		curl -s localhost:8080/Drop/$(DROP_ID)/getState \
		-H 'content-type: application/json' \
		-d '{}' 2>/dev/null || \
		echo "$(RED)Error: Cannot connect to Restate. Is it running?$(RESET)"
	@echo ""

# =============================================================================
# Reset
# =============================================================================

reset: restate-restart _wait-restate register init-drop
	@echo "$(GREEN)✓ Reset complete$(RESET)"

reset-full:
	@echo "$(CYAN)Wiping all Restate state...$(RESET)"
	@docker-compose down -v
	@docker-compose up -d
	@$(MAKE) _wait-restate
	@$(MAKE) register
	@$(MAKE) init-drop
	@echo "$(GREEN)✓ Full reset complete - fresh $(REGISTRATION_MINUTES)-minute registration window$(RESET)"

# =============================================================================
# Stress Testing
# =============================================================================

# Test configuration defaults
USERS ?= 10
RAMP_UP ?= 5
CONNECTIONS ?= 100
HOLD_TIME ?= 10
BATCH_SIZE ?= 50
DURATION ?= 5m
PARTICIPANTS ?= 1000
VUS ?= 20
MAX_RATE ?= 500
WINNERS ?= 20

# -----------------------------------------------------------------------------
# Playwright Browser E2E Test
# -----------------------------------------------------------------------------

# Browser E2E test (full user flow with real browsers)
test-browser:
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🎭 Browser E2E Test                                       ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Users: $(USERS)   Ramp-up: $(RAMP_UP)s   Drop: $(DROP_ID)$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@USERS=$(USERS) RAMP_UP=$(RAMP_UP) DROP_ID=$(DROP_ID) BASE_URL=http://localhost:3005 \
		npx playwright test tests/load/browser-e2e.spec.ts
	@echo ""
	@echo "$(GREEN)✓ Browser test complete$(RESET)"
	@echo "$(YELLOW)Results: tests/load/results/$(RESET)"

# -----------------------------------------------------------------------------
# k6 Test Suites
# -----------------------------------------------------------------------------

# Check if k6 is installed
_check-k6:
	@which k6 > /dev/null || (echo "$(RED)Error: k6 not installed. Run: brew install k6$(RESET)" && exit 1)

# Flash crowd simulation (spike test)
k6-spike: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  ⚡ k6 Spike Test (Flash Crowd)                            ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Scenario: 0 → 50 → 200 → hold → 50 → 0                    ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env DROP_ID=$(DROP_ID) \
		tests/k6/registration-spike.js

# Long-running soak test
k6-soak: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🔄 k6 Soak Test (Sustained Load)                          ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  VUs: $(VUS)   Duration: $(DURATION)$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env DROP_ID=$(DROP_ID) \
		--env VUS=$(VUS) --env DURATION=$(DURATION) \
		tests/k6/sustained-load.js

# Lottery stress test with many participants
k6-lottery: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🎰 k6 Lottery Stress Test                                 ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Target Participants: $(PARTICIPANTS)$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env DROP_ID=$(DROP_ID) \
		--env PARTICIPANTS=$(PARTICIPANTS) --env RESTATE_URL=http://localhost:8080 \
		tests/k6/lottery-stress.js

# Bot detection and PoW stress test
k6-bot: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🤖 k6 Bot Detection Stress Test                           ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Tests: Challenge flood, invalid solutions, replay attacks ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env DROP_ID=$(DROP_ID) \
		tests/k6/bot-detection.js

# Breakpoint test - find system limits
k6-breakpoint: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  📈 k6 Breakpoint Test                                     ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Ramping: 10 → $(MAX_RATE) req/s                                    ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env DROP_ID=$(DROP_ID) \
		--env MAX_RATE=$(MAX_RATE) --env RESTATE_URL=http://localhost:8080 \
		tests/k6/breakpoint.js

# Purchase flow test
k6-purchase: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🛒 k6 Purchase Flow Test                                  ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Winners: $(WINNERS)                                              ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env RESTATE_URL=http://localhost:8080 \
		--env WINNERS=$(WINNERS) \
		tests/k6/purchase-flow.js

# Rollover feature test
k6-rollover: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🔄 k6 Rollover Flow Test                                  ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Tests rollover grant (drop 1) and apply (drop 2)         ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env RESTATE_URL=http://localhost:8080 \
		--env USERS=$(USERS) \
		tests/k6/rollover-flow.js

# Multi-drop concurrent test
k6-multi: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  🎯 k6 Multi-Drop Concurrent Test                          ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  3 drops running concurrently                              ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env API_URL=http://localhost:3003 --env RESTATE_URL=http://localhost:8080 \
		--env USERS_PER_DROP=$(USERS) \
		tests/k6/multi-drop.js

# SSE connection saturation test
k6-sse: _check-k6
	@echo "$(CYAN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║  📡 k6 SSE Saturation Test                                 ║$(RESET)"
	@echo "$(CYAN)╠════════════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(CYAN)║  Max Connections: $(CONNECTIONS)                                    ║$(RESET)"
	@echo "$(CYAN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	k6 run --env SSE_URL=http://localhost:3004 --env DROP_ID=$(DROP_ID) \
		--env MAX_CONNECTIONS=$(CONNECTIONS) \
		tests/k6/sse-saturation.js

# -----------------------------------------------------------------------------
# Run All Tests
# -----------------------------------------------------------------------------

test-all: test-browser
	@echo ""
	@echo "$(GREEN)╔════════════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(GREEN)║  ✓ Browser E2E test complete!                             ║$(RESET)"
	@echo "$(GREEN)╚════════════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(YELLOW)k6 load tests available:$(RESET)"
	@echo "  make k6-spike      - Flash crowd simulation"
	@echo "  make k6-soak       - Long-running stability"
	@echo "  make k6-lottery    - Lottery stress test"
	@echo "  make k6-bot        - Bot detection stress"
	@echo "  make k6-breakpoint - Find breaking points"
	@echo "  make k6-purchase   - Purchase flow test"
	@echo "  make k6-rollover   - Rollover feature test"
	@echo "  make k6-multi      - Multi-drop concurrent"
	@echo "  make k6-sse        - SSE saturation test"

# Legacy alias
load-test: test-browser

# =============================================================================
# Utilities
# =============================================================================

logs:
	@echo "$(CYAN)Restate logs (Ctrl+C to exit):$(RESET)"
	@docker-compose logs -f restate

deployments:
	@echo "$(CYAN)Registered Deployments:$(RESET)"
	@curl -s localhost:9070/deployments | python3 -m json.tool 2>/dev/null || \
		curl -s localhost:9070/deployments

clean:
	@echo "$(CYAN)Cleaning...$(RESET)"
	@rm -rf node_modules web/node_modules web/.next dist
	@echo "$(GREEN)✓ Cleaned$(RESET)"

# =============================================================================
# Shortcuts
# =============================================================================

up: restate-up
down: restate-down
restart: reset
r: register
i: init-drop
s: status
l: logs
b: backend
f: frontend
