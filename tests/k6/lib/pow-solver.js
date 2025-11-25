/**
 * PoW Solver for k6
 * Uses k6's crypto module for SHA-256 hashing
 */

import crypto from "k6/crypto";

export function solvePow(challenge, difficulty) {
  const prefix = "0".repeat(difficulty);
  let nonce = 0;

  while (nonce < 50000000) {
    const solution = nonce.toString();
    const data = challenge + solution;
    const hash = crypto.sha256(data, "hex");

    if (hash.startsWith(prefix)) {
      return solution;
    }
    nonce++;
  }

  throw new Error("PoW solver timeout - exceeded 50M attempts");
}

