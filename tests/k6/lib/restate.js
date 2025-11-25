/**
 * Restate Helper for k6
 *
 * Provides utilities for calling Restate services directly.
 */

import http from "k6/http";
import { RESTATE_URL, JSON_HEADERS } from "./config.js";

/**
 * Call a Restate service method directly
 *
 * @param {string} service - Service name (e.g., "Drop", "UserRollover")
 * @param {string} key - Object key/ID
 * @param {string} method - Method name
 * @param {object} payload - Request payload
 * @param {object} options - Additional options (timeout, etc.)
 * @returns {object} Response with status, body, and parsed JSON
 */
export function callRestate(service, key, method, payload = {}, options = {}) {
  const url = `${RESTATE_URL}/${service}/${key}/${method}`;
  const timeout = options.timeout || "30s";

  const response = http.post(url, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    timeout,
  });

  let json = null;
  try {
    json = JSON.parse(response.body);
  } catch (e) {
    // Body is not JSON
  }

  return {
    status: response.status,
    body: response.body,
    json,
    ok: response.status >= 200 && response.status < 300,
  };
}

/**
 * Initialize a drop via Restate
 *
 * @param {string} dropId - Drop ID
 * @param {object} config - Drop configuration
 * @returns {object} Response
 */
export function initializeDrop(dropId, config = {}) {
  const now = Date.now();
  const defaults = {
    dropId,
    inventory: config.inventory || 10,
    registrationStart: config.registrationStart || now - 1000,
    registrationEnd: config.registrationEnd || now + 5 * 60 * 1000, // 5 minutes
    purchaseWindow: config.purchaseWindow || 300,
  };

  return callRestate("Drop", dropId, "initialize", defaults, {
    timeout: "60s",
  });
}

/**
 * Run lottery for a drop
 *
 * @param {string} dropId - Drop ID
 * @returns {object} Response with lottery results
 */
export function runLottery(dropId) {
  return callRestate("Drop", dropId, "runLottery", {}, { timeout: "120s" });
}

/**
 * Get drop state
 *
 * @param {string} dropId - Drop ID
 * @returns {object} Response with drop state
 */
export function getDropState(dropId) {
  return callRestate("Drop", dropId, "getState", {});
}

/**
 * Get user rollover balance
 *
 * @param {string} userId - User ID
 * @returns {object} Response with rollover balance
 */
export function getRolloverBalance(userId) {
  return callRestate("UserRollover", userId, "getBalance", {});
}

/**
 * Add rollover entries to a user (for testing)
 *
 * @param {string} userId - User ID
 * @param {number} entries - Number of entries to add
 * @param {string} sourceDropId - Source drop ID
 * @returns {object} Response
 */
export function addRollover(userId, entries, sourceDropId) {
  return callRestate("UserRollover", userId, "addRollover", {
    entries,
    sourceDropId,
  });
}

