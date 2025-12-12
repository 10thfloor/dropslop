/**
 * Logging configuration using pino
 * Uses shared config for settings
 */

import { createRequire } from "node:module";
import pino from "pino";
import { config } from "./config.js";

const require = createRequire(import.meta.url);

function resolveOptionalTransportTarget(specifier: string): string | undefined {
  try {
    return require.resolve(specifier);
  } catch {
    return undefined;
  }
}

const prettyTarget = !config.server.isProduction
  ? resolveOptionalTransportTarget("pino-pretty")
  : undefined;

export const logger = pino({
  level: config.server.logLevel,
  transport: prettyTarget
    ? { target: prettyTarget, options: { colorize: true } }
    : undefined,
});

// Child loggers for specific modules
export const createLogger = (module: string) => logger.child({ module });
