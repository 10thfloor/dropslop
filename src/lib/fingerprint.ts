import type { BotValidationRequest, BotValidationResult } from './types.js';

const API_KEY = process.env.FINGERPRINT_API_KEY;

if (!API_KEY) {
  console.warn('FINGERPRINT_API_KEY not set - bot validation will be limited');
}

/**
 * Validate FingerprintJS Pro data
 * In production, verify the visitorId with FingerprintJS Pro Server API
 */
export async function validateFingerprint(
  visitorId: string,
  confidence: number
): Promise<{ valid: boolean; confidence: number }> {
  if (!API_KEY) {
    // Fallback: basic validation without API
    // Accept any visitorId that looks valid (at least 4 chars for our simple hash)
    const isValidFormat = visitorId && visitorId.length >= 4;
    return {
      valid: isValidFormat && confidence >= 50,
      confidence,
    };
  }

  try {
    // In production, verify with FingerprintJS Pro Server API:
    // const response = await fetch(`https://api.fpjs.io/visitors/${visitorId}`, {
    //   headers: { 'Auth-API-Key': API_KEY }
    // });
    // const data = await response.json();
    // return { valid: data.visits?.length > 0, confidence: data.confidence?.score || 0 };

    // For now, trust client-provided confidence
    const normalizedConfidence = Math.max(0, Math.min(100, confidence));

    return {
      valid: normalizedConfidence >= 50,
      confidence: normalizedConfidence,
    };
  } catch (error) {
    console.error('Fingerprint validation error:', error);
    return {
      valid: false,
      confidence: 0,
    };
  }
}

/**
 * Calculate timing score based on human-like interaction patterns
 * Humans typically take 1-5 seconds from page load to registration
 */
export function calculateTimingScore(timingMs: number): number {
  // Too fast - likely bot
  if (timingMs < 200) {
    return 0;
  }
  // Fast but possible
  if (timingMs < 1000) {
    return 50;
  }
  // Optimal human range
  if (timingMs >= 1000 && timingMs <= 5000) {
    return 100;
  }
  // Still reasonable
  if (timingMs <= 10000) {
    return 80;
  }
  // Very slow - might be human but penalize slightly
  return 60;
}

/**
 * Calculate overall trust score from multiple signals
 */
export async function calculateTrustScore(
  request: BotValidationRequest,
  powVerified: boolean
): Promise<BotValidationResult> {
  const fingerprintResult = await validateFingerprint(
    request.fingerprint,
    request.fingerprintConfidence
  );

  const timingScore = calculateTimingScore(request.timingMs);

  // PoW score based on actual verification
  const powScore = powVerified ? 100 : 0;

  // Weighted trust score (as per PRD)
  const trustScore =
    fingerprintResult.confidence * 0.4 +
    timingScore * 0.3 +
    powScore * 0.3;

  const allowed = trustScore >= 50 && fingerprintResult.valid && powVerified;

  // Debug logging
  console.log('Trust score calculation:', {
    fingerprint: request.fingerprint,
    fingerprintLen: request.fingerprint?.length,
    fingerprintConfidence: request.fingerprintConfidence,
    fingerprintValid: fingerprintResult.valid,
    timingMs: request.timingMs,
    timingScore,
    powVerified,
    powScore,
    totalScore: trustScore,
    allowed,
  });

  let reason: string | undefined;
  if (!allowed) {
    if (!fingerprintResult.valid) {
      reason = `Invalid fingerprint (len=${request.fingerprint?.length})`;
    } else if (!powVerified) {
      reason = 'PoW not verified';
    } else {
      reason = `Trust score ${Math.round(trustScore)} below threshold`;
    }
  }

  return {
    trustScore: Math.round(trustScore),
    allowed,
    reason,
  };
}
