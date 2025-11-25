/**
 * SHA-256 Proof of Work solver
 */
export async function solvePow(
  challenge: string,
  difficulty: number,
  onProgress?: (progress: number) => void
): Promise<string> {
  const prefix = "0".repeat(difficulty);
  let nonce = 0;
  const maxIterations = 10000000;

  while (nonce < maxIterations) {
    const data = challenge + nonce;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (hashHex.startsWith(prefix)) {
      return nonce.toString();
    }

    nonce++;

    // Report progress every 10000 iterations
    if (onProgress && nonce % 10000 === 0) {
      onProgress(Math.min((nonce / maxIterations) * 100, 99));
    }
  }

  throw new Error("Could not solve PoW challenge");
}

/**
 * Generate a simple fingerprint for the browser
 */
export function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || "unknown",
  ];

  // Simple hash function
  let hash = 0;
  const str = components.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
}
