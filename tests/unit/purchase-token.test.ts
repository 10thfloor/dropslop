/**
 * Unit tests for purchase token utilities
 *
 * Run with: npx tsx tests/unit/purchase-token.test.ts
 */

import {
  generatePurchaseToken,
  verifyPurchaseToken,
  validatePurchaseToken,
  isTokenExpired,
} from "../../src/lib/purchase-token.js";

const TEST_DROP_ID = "test-drop-123";
const TEST_USER_ID = "test-user-456";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log("\n🧪 Purchase Token Unit Tests\n");
  console.log("=".repeat(50));

  // Test 1: Token generation format
  {
    const expiresAt = Date.now() + 60000; // 1 minute from now
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const parts = token.split(".");
    assert(parts.length === 3, "Token should have 3 parts (shortId.expiry.signature)");
    assert(parts[0].length === 16, "shortId should be 16 chars (base64url)");
    assert(parts[1].length > 0, "expiry should not be empty");
    assert(parts[2].length === 16, "signature should be 16 chars");

    console.log(`   Token: ${token}`);
    console.log(`   Length: ${token.length} chars`);
  }

  // Test 2: Token verification (valid token)
  {
    const expiresAt = Date.now() + 60000;
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const result = verifyPurchaseToken(token, TEST_DROP_ID, TEST_USER_ID);
    assert(result.valid === true, "Valid token should verify successfully");
    assert(result.expiresAt !== null, "expiresAt should be extracted");
    assert(
      Math.abs((result.expiresAt || 0) - expiresAt) < 1000,
      "expiresAt should match (within 1 second due to rounding)"
    );
  }

  // Test 3: Token verification (wrong dropId)
  {
    const expiresAt = Date.now() + 60000;
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const result = verifyPurchaseToken(token, "wrong-drop", TEST_USER_ID);
    assert(result.valid === false, "Token should fail with wrong dropId");
    assert(result.error === "Invalid signature", "Error should be 'Invalid signature'");
  }

  // Test 4: Token verification (wrong userId)
  {
    const expiresAt = Date.now() + 60000;
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const result = verifyPurchaseToken(token, TEST_DROP_ID, "wrong-user");
    assert(result.valid === false, "Token should fail with wrong userId");
    assert(result.error === "Invalid signature", "Error should be 'Invalid signature'");
  }

  // Test 5: Token verification (tampered signature)
  {
    const expiresAt = Date.now() + 60000;
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);
    const tamperedToken = token.slice(0, -1) + "X"; // Change last char

    const result = verifyPurchaseToken(tamperedToken, TEST_DROP_ID, TEST_USER_ID);
    assert(result.valid === false, "Tampered token should fail verification");
  }

  // Test 6: Token expiration check
  {
    const pastExpiry = Date.now() - 1000; // 1 second ago
    const futureExpiry = Date.now() + 60000; // 1 minute from now

    assert(isTokenExpired(pastExpiry) === true, "Past expiry should be expired");
    assert(isTokenExpired(futureExpiry) === false, "Future expiry should not be expired");
  }

  // Test 7: Full validation (valid, not expired)
  {
    const expiresAt = Date.now() + 60000;
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const result = validatePurchaseToken(token, TEST_DROP_ID, TEST_USER_ID);
    assert(result.valid === true, "Valid non-expired token should pass full validation");
  }

  // Test 8: Full validation (valid but expired)
  {
    const expiresAt = Date.now() - 1000; // Already expired
    const token = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    const result = validatePurchaseToken(token, TEST_DROP_ID, TEST_USER_ID);
    assert(result.valid === false, "Expired token should fail full validation");
    assert(result.error === "Token expired", "Error should be 'Token expired'");
  }

  // Test 9: Invalid token format
  {
    const result = verifyPurchaseToken("invalid-token", TEST_DROP_ID, TEST_USER_ID);
    assert(result.valid === false, "Invalid format should fail");
    assert(result.error === "Invalid token format", "Error should indicate format issue");
  }

  // Test 10: Token uniqueness
  {
    const expiresAt = Date.now() + 60000;
    const token1 = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);
    const token2 = generatePurchaseToken(TEST_DROP_ID, TEST_USER_ID, expiresAt);

    assert(token1 !== token2, "Each generated token should be unique");
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ All tests passed!\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});

