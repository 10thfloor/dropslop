/**
 * Startup validation for required environment variables and configuration
 * Call this at application startup before initializing services
 */

import { config } from "./config.js";
import { createLogger } from "./logger.js";

const logger = createLogger("startup");

/**
 * Environment variable requirements
 */
interface EnvRequirement {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
}

/**
 * Define required and optional environment variables
 */
const ENV_REQUIREMENTS: EnvRequirement[] = [
  // Required in production
  {
    name: "NATS_URL",
    required: config.server.isProduction,
    description: "NATS server URL for messaging",
  },
  {
    name: "RESTATE_INGRESS_URL",
    required: config.server.isProduction,
    description: "Restate ingress URL for durable execution",
  },
  {
    name: "CORS_ORIGINS",
    required: config.server.isProduction,
    description: "Comma-separated list of allowed CORS origins",
  },
  {
    name: "ADMIN_SECRET",
    required: config.server.isProduction,
    description: "Secret for admin-only endpoints",
  },
  // Recommended in production
  {
    name: "IP_HASH_SALT",
    required: false,
    description: "Salt for hashing IP addresses (GDPR compliance)",
  },
  {
    name: "FINGERPRINT_API_KEY",
    required: false,
    description: "FingerprintJS Pro API key for enhanced bot detection",
  },
  // Port configuration (optional, has defaults)
  {
    name: "API_PORT",
    required: false,
    description: "API server port",
    validator: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) < 65536,
  },
  {
    name: "SSE_PORT",
    required: false,
    description: "SSE server port",
    validator: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) < 65536,
  },
  {
    name: "RESTATE_PORT",
    required: false,
    description: "Restate worker port",
    validator: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) < 65536,
  },
];

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const req of ENV_REQUIREMENTS) {
    const value = process.env[req.name];

    if (!value) {
      if (req.required) {
        errors.push(`Missing required env var: ${req.name} - ${req.description}`);
      } else if (config.server.isProduction) {
        warnings.push(`Missing recommended env var: ${req.name} - ${req.description}`);
      }
      continue;
    }

    // Run custom validator if provided
    if (req.validator && !req.validator(value)) {
      errors.push(`Invalid value for ${req.name}: "${value}" - ${req.description}`);
    }
  }

  // Check for port conflicts
  const ports = [config.server.apiPort, config.server.ssePort, config.server.restatePort];
  const uniquePorts = new Set(ports);
  if (uniquePorts.size !== ports.length) {
    errors.push("Port conflict detected: API_PORT, SSE_PORT, and RESTATE_PORT must be different");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and log results, exit if invalid in production
 */
export function validateStartup(): void {
  logger.info("Validating startup configuration...");

  const result = validateEnvironment();

  // Log warnings
  for (const warning of result.warnings) {
    logger.warn(warning);
  }

  // Log errors
  for (const error of result.errors) {
    logger.error(error);
  }

  // Exit in production if validation fails
  if (!result.valid) {
    if (config.server.isProduction) {
      logger.fatal("Startup validation failed in production mode. Exiting.");
      process.exit(1);
    } else {
      logger.warn("Startup validation failed, continuing in development mode");
    }
  } else {
    logger.info("Startup validation passed");
  }

  // Log configuration summary
  logConfigSummary();
}

/**
 * Log configuration summary at startup
 */
function logConfigSummary(): void {
  logger.info({
    environment: config.server.nodeEnv,
    apiPort: config.server.apiPort,
    ssePort: config.server.ssePort,
    restatePort: config.server.restatePort,
    natsUrl: config.nats.url,
    restateUrl: config.restate.ingressUrl,
    corsOrigins: config.security.corsOrigins.length,
    powDifficulty: config.pow.difficulty,
    rateLimitMax: config.rateLimit.maxRequests,
    rateLimitWindow: `${config.rateLimit.windowMs / 1000}s`,
  }, "Configuration loaded");
}

/**
 * Print startup banner
 */
export function printStartupBanner(): void {
  const { apiPort, ssePort, restatePort } = config.server;

  console.log(`
╔══════════════════════════════════════════════════════════╗
║           Product Drop Backend Started                   ║
╠══════════════════════════════════════════════════════════╣
║  API Server:      http://localhost:${apiPort.toString().padEnd(4)}                  ║
║  SSE Server:      http://localhost:${ssePort.toString().padEnd(4)}                  ║
║  Restate Worker:  http://localhost:${restatePort.toString().padEnd(4)}                  ║
╠══════════════════════════════════════════════════════════╣
║  Next steps:                                             ║
║  1. Start Restate: docker-compose up -d                  ║
║  2. Register worker with Restate:                        ║
║     curl localhost:9070/deployments -H 'content-type:    ║
║     application/json' -d '{"uri":"http://host.docker.    ║
║     internal:${restatePort.toString().padEnd(4)}"}'                                ║
║  3. Initialize a drop:                                   ║
║     npx tsx src/scripts/init-drop.ts                     ║
║  4. Open: http://localhost:${apiPort.toString().padEnd(4)}                          ║
╚══════════════════════════════════════════════════════════╝
`);
}

