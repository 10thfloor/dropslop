/**
 * Logging configuration using pino
 * Uses shared config for settings
 */

import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.server.logLevel,
  transport: !config.server.isProduction
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// Child loggers for specific modules
export const createLogger = (module: string) => logger.child({ module });
