/**
 * Shared Restate client utilities with timeouts and error handling
 * Uses shared config for settings
 */

import { config } from "./config.js";

/**
 * Custom error that preserves HTTP status code from Restate
 */
export class RestateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "RestateError";
    this.statusCode = statusCode;
  }
}

/**
 * Timeout error for Restate calls
 */
export class RestateTimeoutError extends Error {
  constructor(service: string, method: string, timeoutMs: number) {
    super(
      `Restate call to ${service}.${method} timed out after ${timeoutMs}ms`
    );
    this.name = "RestateTimeoutError";
  }
}

/**
 * Create an AbortController with timeout
 */
function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Call Restate ingress API with full error handling and timeout
 * Throws RestateError on failure, RestateTimeoutError on timeout
 */
export async function callRestate<T = unknown>(
  service: string,
  key: string,
  method: string,
  payload: unknown = {},
  options?: { timeoutMs?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? config.restate.defaultTimeoutMs;
  const url = `${config.restate.ingressUrl}/${service}/${key}/${method}`;

  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      // Try to extract error message from Restate response
      let message = errorText;
      try {
        const parsed = JSON.parse(errorText);
        message = parsed.message || errorText;
      } catch {
        // Keep raw text
      }
      throw new RestateError(message, response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new RestateTimeoutError(service, method, timeoutMs);
    }

    throw error;
  }
}

/**
 * Call Restate ingress API, returning null on error (for non-critical calls)
 * Includes timeout support
 */
export async function callRestateSafe<T = unknown>(
  service: string,
  key: string,
  method: string,
  payload: unknown = {},
  options?: { timeoutMs?: number }
): Promise<T | null> {
  try {
    return await callRestate<T>(service, key, method, payload, options);
  } catch (error) {
    if (error instanceof RestateTimeoutError) {
      console.error(`Restate timeout: ${error.message}`);
    } else if (error instanceof RestateError) {
      console.error(`Restate error: ${error.statusCode} - ${error.message}`);
    } else {
      console.error("Failed to call Restate:", error);
    }
    return null;
  }
}

/**
 * Call Restate with retry support
 */
export async function callRestateWithRetry<T = unknown>(
  service: string,
  key: string,
  method: string,
  payload: unknown = {},
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? config.restate.maxRetries;
  const retryDelayMs = options?.retryDelayMs ?? config.restate.retryDelayMs;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callRestate<T>(service, key, method, payload, {
        timeoutMs: options?.timeoutMs,
      });
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (4xx)
      if (error instanceof RestateError && error.statusCode < 500) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      console.warn(
        `Retrying Restate call to ${service}.${method} (attempt ${attempt + 2}/${maxRetries + 1})`
      );
    }
  }

  throw lastError;
}
